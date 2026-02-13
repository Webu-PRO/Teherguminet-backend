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

const provisionSchema = z
  .object({
    company_name: z.string().trim().min(1).max(255).optional(),
    company_email: z.string().email().optional(),
    currency_code: z.string().trim().min(3).max(10).optional(),
  })
  .strict()

const toggleSchema = provisionSchema
  .extend({
    enabled: z.boolean(),
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

const pickCustomerByEmail = (customers: CustomerDTO[], email: string) => {
  if (!customers.length) {
    return null
  }

  const exactMatch = customers.find((customer) => {
    return normalizeEmail(customer.email) === email
  })

  const accountMatch = customers.find((customer) => {
    return customer.has_account === true
  })

  return accountMatch ?? exactMatch ?? customers[0]
}

const pickEditorCompany = (companies: Array<any>, preferredName: string) => {
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

const readEmployeeScope = (employee: any) => {
  const metadata = toRecord(employee?.metadata)

  return {
    metadata,
    scope: normalizeString(metadata.scope),
    source: normalizeString(metadata.source),
    adminUserId: normalizeString(metadata.admin_user_id),
  }
}

const pickEmployeeForUser = (employees: Array<any>, userId: string) => {
  if (!employees.length) {
    return null
  }

  const scored = employees
    .map((employee) => {
      const scope = readEmployeeScope(employee)
      let score = 0

      if (scope.adminUserId === userId) {
        score += 100
      }
      if (scope.scope === "storefront-content-editor") {
        score += 20
      }
      if (employee?.is_admin === true) {
        score += 10
      }

      return { employee, score }
    })
    .sort((left, right) => right.score - left.score)

  return scored[0]?.employee ?? employees[0]
}

const buildEditorMetadata = (employee: any, userId: string) => {
  return {
    ...toRecord(employee?.metadata),
    scope: "storefront-content-editor",
    source: "admin-user-storefront-access",
    admin_user_id: userId,
  }
}

type RequestBody = z.infer<typeof provisionSchema>
type ToggleBody = z.infer<typeof toggleSchema>

type AdminContext = {
  userId: string
  rawEmail: string
  email: string
  firstName: string | null
  lastName: string | null
  customerService: ICustomerModuleService
  authService: IAuthModuleService
  b2bService: B2BModuleService
}

type AccessState = {
  authIdentityId: string | null
  authAppMetadata: Record<string, unknown>
  customer: CustomerDTO | null
  employees: Array<any>
  selectedEmployee: any | null
}

type ResponseFlags = {
  authIdentityCreated?: boolean
  authCustomerLinked?: boolean
  temporaryPassword?: string | null
  customerCreated?: boolean
  customerUpdated?: boolean
  employeeCreated?: boolean
  employeeUpdated?: boolean
  companyCreated?: boolean
}

const parseProvisionBody = (body: unknown): RequestBody => {
  const parsedBody = provisionSchema.safeParse(body ?? {})
  if (!parsedBody.success) {
    const firstIssue = parsedBody.error.issues[0]
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      firstIssue?.message || "Invalid request payload."
    )
  }

  return parsedBody.data as RequestBody
}

const parseToggleBody = (body: unknown): ToggleBody => {
  const parsedBody = toggleSchema.safeParse(body ?? {})
  if (!parsedBody.success) {
    const firstIssue = parsedBody.error.issues[0]
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      firstIssue?.message || "Invalid request payload."
    )
  }

  return parsedBody.data as ToggleBody
}

const resolveAdminContext = async (
  req: MedusaRequest
): Promise<AdminContext> => {
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

  return {
    userId,
    rawEmail,
    email: rawEmail.toLowerCase(),
    firstName: normalizeString(adminUser.first_name),
    lastName: normalizeString(adminUser.last_name),
    customerService,
    authService,
    b2bService,
  }
}

const readCurrentAccessState = async (
  context: AdminContext
): Promise<AccessState> => {
  const emailCandidates = Array.from(
    new Set([context.rawEmail, context.email].filter(Boolean))
  )

  const providerIdentity = await findEmailpassProviderIdentity(
    context.authService,
    emailCandidates
  )
  let authIdentityId = normalizeString(providerIdentity?.auth_identity_id)
  let authAppMetadata: Record<string, unknown> = {}
  let linkedCustomerId: string | null = null

  if (authIdentityId) {
    try {
      const authIdentity = await context.authService.retrieveAuthIdentity(
        authIdentityId
      )
      authAppMetadata = toRecord(authIdentity.app_metadata)
      linkedCustomerId = normalizeString(authAppMetadata.customer_id)
    } catch {
      authIdentityId = null
      authAppMetadata = {}
      linkedCustomerId = null
    }
  }

  let customer: CustomerDTO | null = null
  if (linkedCustomerId) {
    try {
      customer = await context.customerService.retrieveCustomer(linkedCustomerId)
    } catch {
      customer = null
    }
  }

  if (!customer) {
    const existingCustomers = await context.customerService.listCustomers({
      email: context.email,
    })
    customer = pickCustomerByEmail(existingCustomers, context.email)
  }

  const customerId = normalizeString(customer?.id)
  let employees: Array<any> = []
  if (customerId) {
    employees = (await context.b2bService.listEmployees(
      { customer_id: customerId },
      {}
    )) as Array<any>
  }

  return {
    authIdentityId,
    authAppMetadata,
    customer,
    employees,
    selectedEmployee: pickEmployeeForUser(employees, context.userId),
  }
}

const buildAccessResponse = (
  context: AdminContext,
  state: AccessState,
  flags: ResponseFlags = {}
) => {
  const customerId = normalizeString(state.customer?.id)
  const employeeId = normalizeString(state.selectedEmployee?.id)
  const companyId = normalizeString(state.selectedEmployee?.company_id)
  const isAdmin = state.selectedEmployee?.is_admin === true

  return {
    ok: true,
    user: {
      id: context.userId,
      email: context.email,
    },
    customer: customerId
      ? {
          id: customerId,
          email: normalizeEmail(state.customer?.email) || context.email,
          created: flags.customerCreated ?? false,
          updated: flags.customerUpdated ?? false,
        }
      : undefined,
    auth: {
      auth_identity_id: state.authIdentityId,
      identity_created: flags.authIdentityCreated ?? false,
      customer_linked: flags.authCustomerLinked ?? false,
      temporary_password: flags.temporaryPassword ?? null,
    },
    storefront_editor: {
      employee_id: employeeId,
      company_id: companyId,
      is_admin: isAdmin,
      enabled: isAdmin,
      employee_created: flags.employeeCreated ?? false,
      employee_updated: flags.employeeUpdated ?? false,
      company_created: flags.companyCreated ?? false,
      matched_employees: state.employees.length,
    },
  }
}

const ensureEditorAccess = async (
  context: AdminContext,
  body: RequestBody
) => {
  let state = await readCurrentAccessState(context)

  let authIdentityId = state.authIdentityId
  let authAppMetadata = state.authAppMetadata
  let authIdentityCreated = false
  let authCustomerLinked = false
  let temporaryPassword: string | null = null

  if (!authIdentityId) {
    temporaryPassword = generateTemporaryPassword()
    const registration = await context.authService.register("emailpass", {
      body: {
        email: context.email,
        password: temporaryPassword,
      },
    })

    if (registration.success && registration.authIdentity?.id) {
      authIdentityCreated = true
      authIdentityId = registration.authIdentity.id
    } else {
      const fallbackIdentity = await findEmailpassProviderIdentity(
        context.authService,
        Array.from(new Set([context.rawEmail, context.email]))
      )
      authIdentityId = normalizeString(fallbackIdentity?.auth_identity_id)

      if (!authIdentityId) {
        throw new MedusaError(
          MedusaError.Types.UNAUTHORIZED,
          registration.error || "Unable to create or resolve emailpass identity."
        )
      }

      temporaryPassword = null
    }

    const authIdentity = await context.authService.retrieveAuthIdentity(authIdentityId)
    authAppMetadata = toRecord(authIdentity.app_metadata)
  }

  if (!authIdentityId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Unable to resolve auth identity."
    )
  }

  let customer = state.customer
  let customerCreated = false
  let customerUpdated = false

  if (!customer) {
    customer = await context.customerService.createCustomers({
      email: context.email,
      first_name: context.firstName ?? undefined,
      last_name: context.lastName ?? undefined,
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

  const linkedCustomerId = normalizeString(authAppMetadata.customer_id)
  if (!linkedCustomerId) {
    await context.authService.updateAuthIdentities({
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

  const customerUpdatePayload: {
    first_name?: string
    last_name?: string
  } = {}

  if (!normalizeString(customer.first_name) && context.firstName) {
    customerUpdatePayload.first_name = context.firstName
  }
  if (!normalizeString(customer.last_name) && context.lastName) {
    customerUpdatePayload.last_name = context.lastName
  }

  if (Object.keys(customerUpdatePayload).length) {
    customer = await context.customerService.updateCustomers(
      customerId,
      customerUpdatePayload
    )
    customerUpdated = true
  }

  const existingEmployees = (await context.b2bService.listEmployees(
    { customer_id: customerId },
    {}
  )) as Array<any>

  let employee = pickEmployeeForUser(existingEmployees, context.userId)
  let employeeCreated = false
  let employeeUpdated = false
  let companyCreated = false

  if (employee) {
    const employeeId = normalizeString(employee.id)
    if (!employeeId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Unable to resolve employee ID."
      )
    }

    const scope = readEmployeeScope(employee)
    const needsAdminFlag = employee.is_admin !== true
    const needsMetadata =
      scope.adminUserId !== context.userId ||
      scope.scope !== "storefront-content-editor" ||
      scope.source !== "admin-user-storefront-access"

    if (needsAdminFlag || needsMetadata) {
      employee = await context.b2bService.updateEmployee({
        id: employeeId,
        is_admin: true,
        metadata: buildEditorMetadata(employee, context.userId),
      })
      employeeUpdated = true
    }
  } else {
    const companyName =
      body.company_name?.trim() || DEFAULT_EDITOR_COMPANY_NAME
    const companyEmail =
      body.company_email?.trim().toLowerCase() ||
      DEFAULT_EDITOR_COMPANY_EMAIL
    const currencyCode =
      body.currency_code?.trim().toUpperCase() ||
      DEFAULT_EDITOR_COMPANY_CURRENCY

    const existingCompanies = (await context.b2bService.listCompanies(
      { email: companyEmail },
      {}
    )) as Array<any>

    let company = pickEditorCompany(existingCompanies, companyName)
    if (!company) {
      company = await context.b2bService.createCompany({
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

    employee = await context.b2bService.createEmployee({
      company_id: companyId,
      customer_id: customerId,
      is_admin: true,
      spending_limit: 0,
      metadata: buildEditorMetadata(null, context.userId),
    })
    employeeCreated = true
  }

  state = {
    authIdentityId,
    authAppMetadata,
    customer,
    employees: (await context.b2bService.listEmployees(
      { customer_id: customerId },
      {}
    )) as Array<any>,
    selectedEmployee: employee,
  }

  return buildAccessResponse(context, state, {
    authIdentityCreated,
    authCustomerLinked,
    temporaryPassword,
    customerCreated,
    customerUpdated,
    employeeCreated,
    employeeUpdated,
    companyCreated,
  })
}

const disableEditorAccess = async (context: AdminContext) => {
  const state = await readCurrentAccessState(context)
  const customerId = normalizeString(state.customer?.id)

  if (!customerId || state.employees.length === 0) {
    return buildAccessResponse(context, state)
  }

  const matchingByUser = state.employees.filter((employee) => {
    return readEmployeeScope(employee).adminUserId === context.userId
  })

  const matchingByScope = state.employees.filter((employee) => {
    return readEmployeeScope(employee).scope === "storefront-content-editor"
  })

  let targets = matchingByUser
  if (!targets.length) {
    targets = matchingByScope
  }
  if (!targets.length && state.selectedEmployee) {
    targets = [state.selectedEmployee]
  }

  let employeeUpdated = false
  for (const employee of targets) {
    const employeeId = normalizeString(employee?.id)
    if (!employeeId || employee?.is_admin !== true) {
      continue
    }

    await context.b2bService.updateEmployee({
      id: employeeId,
      is_admin: false,
    })
    employeeUpdated = true
  }

  const refreshedState = await readCurrentAccessState(context)
  return buildAccessResponse(context, refreshedState, {
    employeeUpdated,
  })
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const context = await resolveAdminContext(req)
  const state = await readCurrentAccessState(context)
  res.status(200).json(buildAccessResponse(context, state))
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = parseProvisionBody(req.body)
  const context = await resolveAdminContext(req)
  const payload = await ensureEditorAccess(context, body)
  res.status(200).json(payload)
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const body = parseToggleBody(req.body)
  const context = await resolveAdminContext(req)

  if (body.enabled) {
    const payload = await ensureEditorAccess(context, body)
    res.status(200).json(payload)
    return
  }

  const payload = await disableEditorAccess(context)
  res.status(200).json(payload)
}
