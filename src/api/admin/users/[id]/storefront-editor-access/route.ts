import { randomBytes } from "crypto"

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type {
  CustomerDTO,
  IAuthModuleService,
  ICustomerModuleService,
  IUserModuleService,
  UserDTO,
} from "@medusajs/types"
import { z } from "zod"

import { B2B_MODULE } from "@modules/b2b"
import type B2BModuleService from "@modules/b2b/service"

const DEFAULT_EDITOR_COMPANY_NAME =
  process.env.STOREFRONT_EDITOR_COMPANY_NAME?.trim() ||
  "Storefront Content Editors"
const DEFAULT_EDITOR_COMPANY_EMAIL =
  process.env.STOREFRONT_EDITOR_COMPANY_EMAIL?.trim().toLowerCase() ||
  "content-editor@teherguminet.hu"
const DEFAULT_EDITOR_COMPANY_CURRENCY =
  process.env.STOREFRONT_EDITOR_COMPANY_CURRENCY?.trim().toUpperCase() ||
  "HUF"

const requestSchema = z
  .object({
    company_name: z.string().trim().min(1).max(255).optional(),
    company_email: z.string().email().optional(),
    currency_code: z.string().trim().min(3).max(10).optional(),
  })
  .strict()

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

const normalizeEmail = (value: unknown) => {
  const normalized = normalizeString(value)
  return normalized ? normalized.toLowerCase() : null
}

const generateTemporaryPassword = () => {
  return `TGN!${randomBytes(18).toString("base64url")}`
}

const findEmailpassProviderIdentity = async (
  authService: IAuthModuleService,
  emailCandidates: string[]
) => {
  for (const candidate of emailCandidates) {
    const identities = await authService.listProviderIdentities({
      provider: "emailpass",
      entity_id: candidate,
    })

    if (identities.length) {
      return identities[0]
    }
  }

  return null
}

const pickCustomerByEmail = (
  customers: CustomerDTO[],
  email: string
) => {
  if (!customers.length) {
    return null
  }

  const exactMatch = customers.find((customer) => {
    return normalizeEmail(customer.email) === email
  })

  const accountMatch = customers.find(
    (customer) => customer.has_account === true
  )

  return accountMatch ?? exactMatch ?? customers[0]
}

const pickEditorCompany = (
  companies: Array<any>,
  preferredName: string
) => {
  if (!companies.length) {
    return null
  }

  const scoped = companies.find((company) => {
    const metadata = toRecord(company.metadata)
    return metadata.scope === "storefront-content-editor"
  })

  if (scoped) {
    return scoped
  }

  const named = companies.find((company) => {
    return normalizeString(company.name) === preferredName
  })

  return named ?? companies[0]
}

type RequestBody = z.infer<typeof requestSchema>

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsedBody = requestSchema.safeParse(req.body ?? {})
  if (!parsedBody.success) {
    const firstIssue = parsedBody.error.issues[0]
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      firstIssue?.message || "Invalid request payload."
    )
  }

  const body = parsedBody.data as RequestBody
  const userId = normalizeString(req.params?.id)

  if (!userId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "User ID is required."
    )
  }

  const userService = req.scope.resolve<IUserModuleService>(Modules.USER)
  const customerService = req.scope.resolve<ICustomerModuleService>(
    Modules.CUSTOMER
  )
  const authService = req.scope.resolve<IAuthModuleService>(Modules.AUTH)
  const b2bService = req.scope.resolve<B2BModuleService>(B2B_MODULE)

  const adminUser = (await userService.retrieveUser(userId)) as UserDTO
  const rawEmail = normalizeString(adminUser.email)

  if (!rawEmail) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Admin user must have a valid email."
    )
  }

  const email = rawEmail.toLowerCase()
  const firstName = normalizeString(adminUser.first_name)
  const lastName = normalizeString(adminUser.last_name)
  const emailCandidates = Array.from(
    new Set([rawEmail, email].filter(Boolean))
  )

  let providerIdentity = await findEmailpassProviderIdentity(
    authService,
    emailCandidates
  )
  let authIdentityId = normalizeString(providerIdentity?.auth_identity_id)
  let authIdentityCreated = false
  let temporaryPassword: string | null = null

  if (!authIdentityId) {
    temporaryPassword = generateTemporaryPassword()
    const registration = await authService.register("emailpass", {
      body: {
        email,
        password: temporaryPassword,
      },
    })

    if (registration.success && registration.authIdentity?.id) {
      authIdentityCreated = true
      authIdentityId = registration.authIdentity.id
    } else {
      // Handle race or pre-existing identities with case-variant emails.
      providerIdentity = await findEmailpassProviderIdentity(
        authService,
        emailCandidates
      )
      authIdentityId = normalizeString(providerIdentity?.auth_identity_id)

      if (!authIdentityId) {
        throw new MedusaError(
          MedusaError.Types.UNAUTHORIZED,
          registration.error ||
            "Unable to create or resolve emailpass identity."
        )
      }

      temporaryPassword = null
    }
  }

  if (!authIdentityId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Unable to resolve auth identity."
    )
  }

  const authIdentity = await authService.retrieveAuthIdentity(authIdentityId)
  const authAppMetadata = toRecord(authIdentity.app_metadata)
  const linkedCustomerId = normalizeString(authAppMetadata.customer_id)

  let customer: CustomerDTO | null = null
  let customerCreated = false

  if (linkedCustomerId) {
    customer = await customerService.retrieveCustomer(linkedCustomerId)
  }

  if (!customer) {
    const existingCustomers = await customerService.listCustomers({
      email,
    })
    customer = pickCustomerByEmail(existingCustomers, email)
  }

  if (!customer) {
    customer = await customerService.createCustomers({
      email,
      first_name: firstName ?? undefined,
      last_name: lastName ?? undefined,
      has_account: true,
    })
    customerCreated = true
  }

  const customerId = normalizeString(customer.id)
  if (!customerId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Unable to resolve customer ID."
    )
  }

  let authCustomerLinked = false
  if (!linkedCustomerId) {
    await authService.updateAuthIdentities({
      id: authIdentityId,
      app_metadata: {
        ...authAppMetadata,
        customer_id: customerId,
      },
    })
    authCustomerLinked = true
  } else if (linkedCustomerId !== customerId) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Auth identity is linked to a different customer (${linkedCustomerId}).`
    )
  }

  const customerFirstName = normalizeString(customer.first_name)
  const customerLastName = normalizeString(customer.last_name)
  const customerUpdatePayload: {
    first_name?: string
    last_name?: string
  } = {}

  if (!customerFirstName && firstName) {
    customerUpdatePayload.first_name = firstName
  }
  if (!customerLastName && lastName) {
    customerUpdatePayload.last_name = lastName
  }

  let customerUpdated = false
  if (Object.keys(customerUpdatePayload).length) {
    customer = await customerService.updateCustomers(
      customerId,
      customerUpdatePayload
    )
    customerUpdated = true
  }

  const existingEmployees = (await b2bService.listEmployees(
    { customer_id: customerId },
    {}
  )) as Array<any>
  const existingAdminEmployee = existingEmployees.find(
    (employee) => employee.is_admin === true
  )

  let employee = existingAdminEmployee ?? null
  let employeeCreated = false
  let companyCreated = false
  let company: any | null = null

  if (!employee) {
    const companyName =
      body.company_name?.trim() || DEFAULT_EDITOR_COMPANY_NAME
    const companyEmail =
      body.company_email?.trim().toLowerCase() ||
      DEFAULT_EDITOR_COMPANY_EMAIL
    const currencyCode =
      body.currency_code?.trim().toUpperCase() ||
      DEFAULT_EDITOR_COMPANY_CURRENCY

    const existingCompanies = (await b2bService.listCompanies(
      {
        email: companyEmail,
      },
      {}
    )) as Array<any>
    company = pickEditorCompany(existingCompanies, companyName)

    if (!company) {
      company = await b2bService.createCompany({
        name: companyName,
        email: companyEmail,
        currency_code: currencyCode,
        approval_settings: {
          requires_admin_approval: false,
        },
        metadata: {
          scope: "storefront-content-editor",
          source: "admin-user-storefront-access",
        },
      })
      companyCreated = true
    }

    const companyId = normalizeString(company.id)
    if (!companyId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Unable to resolve editor company ID."
      )
    }

    employee = await b2bService.createEmployee({
      company_id: companyId,
      customer_id: customerId,
      is_admin: true,
      spending_limit: 0,
      metadata: {
        scope: "storefront-content-editor",
        source: "admin-user-storefront-access",
        admin_user_id: userId,
      },
    })
    employeeCreated = true
  }

  res.status(200).json({
    ok: true,
    user: {
      id: userId,
      email,
    },
    customer: {
      id: customerId,
      email: normalizeEmail(customer.email) || email,
      created: customerCreated,
      updated: customerUpdated,
    },
    auth: {
      auth_identity_id: authIdentityId,
      identity_created: authIdentityCreated,
      customer_linked: authCustomerLinked,
      temporary_password: temporaryPassword,
    },
    storefront_editor: {
      employee_id: normalizeString(employee?.id),
      company_id: normalizeString(employee?.company_id),
      is_admin: employee?.is_admin === true,
      employee_created: employeeCreated,
      company_created: companyCreated,
    },
  })
}
