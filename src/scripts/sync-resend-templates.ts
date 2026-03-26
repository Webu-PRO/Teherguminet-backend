import fs from "fs"
import path from "path"
import React from "react"
import type { ExecArgs } from "@medusajs/types"
import { loadEnv } from "@medusajs/utils"
import { Resend } from "resend"
import { render } from "@react-email/render"
import {
  OwnDeliveryPaymentNoticeEmail,
  mockOwnDeliveryPaymentNotice,
  type OwnDeliveryPaymentNoticeEmailProps,
} from "../modules/resend/emails/own-delivery-payment-notice"
import {
  OwnDeliveryFulfillmentCreatedEmail,
  mockOwnDeliveryFulfillmentCreated,
  type OwnDeliveryFulfillmentCreatedEmailProps,
} from "../modules/resend/emails/own-delivery-fulfillment-created"
import {
  OwnDeliveryShippedEmail,
  mockOwnDeliveryShipped,
  type OwnDeliveryShippedEmailProps,
} from "../modules/resend/emails/own-delivery-shipped"
import {
  OwnDeliveryDeliveredEmail,
  mockOwnDeliveryDelivered,
  type OwnDeliveryDeliveredEmailProps,
} from "../modules/resend/emails/own-delivery-delivered"
import {
  OrderPickupReadyEmail,
  mockOrderPickupReady,
  type OrderPickupReadyEmailProps,
} from "../modules/resend/emails/order-pickup-ready"
import {
  OrderPickupCompletedEmail,
  mockOrderPickupCompleted,
  type OrderPickupCompletedEmailProps,
} from "../modules/resend/emails/order-pickup-completed"
import {
  GlsLabelCancelledEmail,
  type GlsLabelCancelledEmailProps,
} from "../modules/resend/emails/gls-label-cancelled"
import { buildOrderUrl } from "../modules/resend/emails/order-email-shared"

type ScriptArgs = ExecArgs & {
  args?: string[]
}

type TemplateLanguage = "hu" | "sk"

type ResendTemplateDefinition = {
  key:
    | "own-delivery-payment-notice"
    | "own-delivery-fulfillment-created"
    | "own-delivery-shipped"
    | "own-delivery-delivered"
    | "order-pickup-ready"
    | "order-pickup-completed"
    | "gls-label-cancelled"
  language: TemplateLanguage
  name: string
  alias: string
  subject: string
  html: string
  variables: Array<{
    key: string
    type: "string"
    fallbackValue?: string | null
  }>
}

type TemplateListItem = {
  id: string
  name: string
  alias?: string | null
}

type ResendTemplateApiResponse<T> = {
  data?: T
  error?: unknown
}

type ResendTemplatesApi = {
  list: (options?: {
    limit?: number
    after?: string
    before?: string
  }) => Promise<
    ResendTemplateApiResponse<{
      object: "list"
      data: TemplateListItem[]
      has_more: boolean
    }>
  >
  publish: (id: string) => Promise<ResendTemplateApiResponse<{ id: string }>>
  update: (
    id: string,
    payload: {
      name?: string
      alias?: string
      subject?: string
      html?: string
      from?: string
      replyTo?: string
      variables?: Array<{
        key: string
        type: "string"
        fallbackValue?: string | null
      }>
    }
  ) => Promise<ResendTemplateApiResponse<{ id: string }>>
  create: (payload: {
    name: string
    alias: string
    subject: string
    html: string
    from: string
    replyTo?: string
    variables?: Array<{
      key: string
      type: "string"
      fallbackValue?: string | null
    }>
  }) => Promise<ResendTemplateApiResponse<{ id: string }>>
}

const TEMPLATE_IDS_FILE = ".resend-template-ids.json"
const ORDER_ID_PLACEHOLDER = "{{{order_id}}}"
const CUSTOMER_NAME_PLACEHOLDER = "{{{customer_name}}}"
const ORDER_URL_PLACEHOLDER = "{{{order_url}}}"
const TEMPLATE_VARIABLES: ResendTemplateDefinition["variables"] = [
  {
    key: "order_id",
    type: "string",
    fallbackValue: "TG-000019",
  },
  {
    key: "customer_name",
    type: "string",
    fallbackValue: "Partner",
  },
  {
    key: "order_url",
    type: "string",
    fallbackValue: "https://teherguminet.hu/hu/store/orders/TG-000019",
  },
]

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const requireEnv = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} environment variable is required`)
  }
  return value
}

const getTemplatesApi = (resend: Resend): ResendTemplatesApi => {
  const maybeTemplates = (resend as unknown as { templates?: ResendTemplatesApi })
    .templates

  if (!maybeTemplates) {
    throw new Error(
      "This Resend SDK build does not expose templates API at runtime."
    )
  }

  return maybeTemplates
}

const withLanguage = <
  T extends
    | OwnDeliveryPaymentNoticeEmailProps
    | OwnDeliveryFulfillmentCreatedEmailProps
    | OwnDeliveryShippedEmailProps
    | OwnDeliveryDeliveredEmailProps
    | OrderPickupReadyEmailProps
    | OrderPickupCompletedEmailProps
    | GlsLabelCancelledEmailProps,
>(
  props: T,
  language: TemplateLanguage
): T => {
  return {
    ...props,
    order: {
      ...props.order,
      metadata: {
        ...(props.order.metadata ?? {}),
        language,
      },
    },
  } as T
}

const withTemplatePlaceholders = <
  T extends
    | OwnDeliveryPaymentNoticeEmailProps
    | OwnDeliveryFulfillmentCreatedEmailProps
    | OwnDeliveryShippedEmailProps
    | OwnDeliveryDeliveredEmailProps
    | OrderPickupReadyEmailProps
    | OrderPickupCompletedEmailProps
    | GlsLabelCancelledEmailProps,
>(
  props: T
): T => {
  return {
    ...props,
    order: {
      ...props.order,
      display_id: ORDER_ID_PLACEHOLDER,
      customer: {
        ...(props.order.customer ?? {}),
        first_name: CUSTOMER_NAME_PLACEHOLDER,
      },
      shipping_address: {
        ...(props.order.shipping_address ?? {}),
        first_name: CUSTOMER_NAME_PLACEHOLDER,
      },
      billing_address: {
        ...(props.order.billing_address ?? {}),
        first_name: CUSTOMER_NAME_PLACEHOLDER,
      },
    },
  } as T
}

const normalizeHtmlForResendVariables = (
  html: string,
  language: TemplateLanguage
) => {
  const orderUrlMarker = buildOrderUrl(ORDER_ID_PLACEHOLDER, language)
  return html
    .split(orderUrlMarker)
    .join(ORDER_URL_PLACEHOLDER)
    .split(encodeURIComponent(ORDER_ID_PLACEHOLDER))
    .join(ORDER_ID_PLACEHOLDER)
}

const listAllTemplates = async (templatesApi: ResendTemplatesApi) => {
  const all: TemplateListItem[] = []
  let cursor: string | undefined

  while (true) {
    const response = await templatesApi.list({
      limit: 100,
      ...(cursor ? { after: cursor } : {}),
    })

    if (response.error) {
      throw new Error(
        `Failed to list Resend templates: ${JSON.stringify(response.error)}`
      )
    }

    const chunk = (response.data?.data ?? []) as TemplateListItem[]
    all.push(...chunk)

    if (!response.data?.has_more || !chunk.length) {
      break
    }

    cursor = chunk[chunk.length - 1]?.id
    if (!cursor) {
      break
    }
  }

  return all
}

const tryPublishTemplate = async (resend: Resend, id: string) => {
  const templatesApi = getTemplatesApi(resend)
  const response = await templatesApi.publish(id)
  if (response.error) {
    // Template may already be published, or has no draft changes.
    console.warn(
      `Publish warning for template ${id}: ${JSON.stringify(response.error)}`
    )
    return
  }
}

const syncTemplate = async (
  resend: Resend,
  existing: TemplateListItem[],
  definition: ResendTemplateDefinition,
  from: string,
  replyTo?: string
) => {
  const byAlias = existing.find((entry) => entry.alias === definition.alias)
  const byName = existing.find((entry) => entry.name === definition.name)
  const match = byAlias ?? byName

  if (match) {
    const templatesApi = getTemplatesApi(resend)
    const updateResponse = await templatesApi.update(match.id, {
      name: definition.name,
      alias: definition.alias,
      subject: definition.subject,
      html: definition.html,
      from,
      ...(replyTo ? { replyTo } : {}),
      variables: definition.variables,
    })

    if (updateResponse.error) {
      throw new Error(
        `Failed to update template ${definition.alias}: ${JSON.stringify(
          updateResponse.error
        )}`
      )
    }

    await tryPublishTemplate(resend, match.id)
    return { id: match.id, action: "updated" as const }
  }

  const templatesApi = getTemplatesApi(resend)
  const createResponse = await templatesApi.create({
    name: definition.name,
    alias: definition.alias,
    subject: definition.subject,
    html: definition.html,
    from,
    ...(replyTo ? { replyTo } : {}),
    variables: definition.variables,
  })

  if (createResponse.error || !createResponse.data?.id) {
    throw new Error(
      `Failed to create template ${definition.alias}: ${JSON.stringify(
        createResponse.error
      )}`
    )
  }

  await tryPublishTemplate(resend, createResponse.data.id)
  return { id: createResponse.data.id, action: "created" as const }
}

const writeTemplateIdsFile = (
  filePath: string,
  updates: Record<string, string>
) => {
  let existing: Record<string, string> = {}

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf8")
      const parsed = JSON.parse(raw) as Record<string, unknown>
      existing = Object.fromEntries(
        Object.entries(parsed).filter(
          ([, value]) => typeof value === "string" && value.trim().length > 0
        )
      ) as Record<string, string>
    } catch {
      existing = {}
    }
  }

  const merged = {
    ...existing,
    ...updates,
  }

  fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8")
}

export default async function syncResendTemplates({
  args = [],
}: ScriptArgs) {
  const apiKey = requireEnv("RESEND_API_KEY")
  const from = requireEnv("RESEND_FROM_EMAIL")
  const replyTo = process.env.RESEND_REPLY_TO?.trim()
  const noWriteIds = args.includes("--no-write-ids")

  const resend = new Resend(apiKey)
  const templatesApi = getTemplatesApi(resend)

  const paymentHuProps = withTemplatePlaceholders(
    withLanguage(mockOwnDeliveryPaymentNotice, "hu")
  )
  const paymentSkProps = withTemplatePlaceholders(
    withLanguage(mockOwnDeliveryPaymentNotice, "sk")
  )
  const fulfillmentCreatedHuProps = withTemplatePlaceholders(
    withLanguage(mockOwnDeliveryFulfillmentCreated, "hu")
  )
  const fulfillmentCreatedSkProps = withTemplatePlaceholders(
    withLanguage(mockOwnDeliveryFulfillmentCreated, "sk")
  )
  const shippedHuProps = withTemplatePlaceholders(
    withLanguage(mockOwnDeliveryShipped, "hu")
  )
  const shippedSkProps = withTemplatePlaceholders(
    withLanguage(mockOwnDeliveryShipped, "sk")
  )
  const deliveredHuProps = withTemplatePlaceholders(
    withLanguage(mockOwnDeliveryDelivered, "hu")
  )
  const deliveredSkProps = withTemplatePlaceholders(
    withLanguage(mockOwnDeliveryDelivered, "sk")
  )
  const pickupReadyHuProps = withTemplatePlaceholders(
    withLanguage(mockOrderPickupReady, "hu")
  )
  const pickupReadySkProps = withTemplatePlaceholders(
    withLanguage(mockOrderPickupReady, "sk")
  )
  const pickupCompletedHuProps = withTemplatePlaceholders(
    withLanguage(mockOrderPickupCompleted, "hu")
  )
  const pickupCompletedSkProps = withTemplatePlaceholders(
    withLanguage(mockOrderPickupCompleted, "sk")
  )
  const glsBaseProps: GlsLabelCancelledEmailProps = {
    order: {
      id: "order_123",
      display_id: 42,
      email: "partner@teherguminet.hu",
      currency_code: "HUF",
      shipping_address: {
        first_name: "Partner",
        country_code: "hu",
      },
    },
    parcelNumbers: ["987654321"],
    showSupportCta: true,
    brand: {
      name: "TEHERGUMINET",
      domain: "Teherguminet.hu",
      logoUrl: "https://teherguminet.hu/assets/email/teherguminet-mark.png",
      logoAlt: "Teherguminet",
    },
  }
  const glsCancelledHuProps = withTemplatePlaceholders(
    withLanguage(glsBaseProps, "hu")
  )
  const glsCancelledSkProps = withTemplatePlaceholders(
    withLanguage(glsBaseProps, "sk")
  )

  const definitions: ResendTemplateDefinition[] = [
    {
      key: "own-delivery-payment-notice",
      language: "hu",
      name: "Teherguminet - own-delivery-payment-notice",
      alias: "teherguminet-own-delivery-payment-notice",
      subject: "Saját szállítás visszaigazolva – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(OwnDeliveryPaymentNoticeEmail, paymentHuProps)
        ),
        "hu"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "own-delivery-payment-notice",
      language: "sk",
      name: "Teherguminet - own-delivery-payment-notice (SK)",
      alias: "teherguminet-own-delivery-payment-notice-sk",
      subject: "Vlastné doručenie potvrdené – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(OwnDeliveryPaymentNoticeEmail, paymentSkProps)
        ),
        "sk"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "own-delivery-fulfillment-created",
      language: "hu",
      name: "Teherguminet - own-delivery-fulfillment-created",
      alias: "teherguminet-own-delivery-fulfillment-created",
      subject: "Saját szállítás előkészítve – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(
            OwnDeliveryFulfillmentCreatedEmail,
            fulfillmentCreatedHuProps
          )
        ),
        "hu"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "own-delivery-fulfillment-created",
      language: "sk",
      name: "Teherguminet - own-delivery-fulfillment (SK)",
      alias: "teherguminet-own-delivery-fulfillment-created-sk",
      subject: "Vlastná doprava pripravená – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(
            OwnDeliveryFulfillmentCreatedEmail,
            fulfillmentCreatedSkProps
          )
        ),
        "sk"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "own-delivery-shipped",
      language: "hu",
      name: "Teherguminet - own-delivery-shipped",
      alias: "teherguminet-own-delivery-shipped",
      subject: "A szállítás elindult – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(OwnDeliveryShippedEmail, shippedHuProps)
        ),
        "hu"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "own-delivery-shipped",
      language: "sk",
      name: "Teherguminet - own-delivery-shipped (SK)",
      alias: "teherguminet-own-delivery-shipped-sk",
      subject: "Doručenie je na ceste – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(OwnDeliveryShippedEmail, shippedSkProps)
        ),
        "sk"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "own-delivery-delivered",
      language: "hu",
      name: "Teherguminet - own-delivery-delivered",
      alias: "teherguminet-own-delivery-delivered",
      subject: "A szállítás sikeresen megtörtént – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(OwnDeliveryDeliveredEmail, deliveredHuProps)
        ),
        "hu"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "own-delivery-delivered",
      language: "sk",
      name: "Teherguminet - own-delivery-delivered (SK)",
      alias: "teherguminet-own-delivery-delivered-sk",
      subject: "Doručenie prebehlo úspešne – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(OwnDeliveryDeliveredEmail, deliveredSkProps)
        ),
        "sk"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "order-pickup-ready",
      language: "hu",
      name: "Teherguminet - order-pickup-ready",
      alias: "teherguminet-order-pickup-ready",
      subject: "A rendelésed átvehető – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(React.createElement(OrderPickupReadyEmail, pickupReadyHuProps)),
        "hu"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "order-pickup-ready",
      language: "sk",
      name: "Teherguminet - order-pickup-ready (SK)",
      alias: "teherguminet-order-pickup-ready-sk",
      subject: "Objednávka je pripravená na odber – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(React.createElement(OrderPickupReadyEmail, pickupReadySkProps)),
        "sk"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "order-pickup-completed",
      language: "hu",
      name: "Teherguminet - pickup-completed",
      alias: "teherguminet-pickup-completed",
      subject: "Átvétel sikeresen megtörtént – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(OrderPickupCompletedEmail, pickupCompletedHuProps)
        ),
        "hu"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "order-pickup-completed",
      language: "sk",
      name: "Teherguminet - pickup-completed (SK)",
      alias: "teherguminet-pickup-completed-sk",
      subject: "Prevzatie bolo úspešne dokončené – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(OrderPickupCompletedEmail, pickupCompletedSkProps)
        ),
        "sk"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "gls-label-cancelled",
      language: "hu",
      name: "Teherguminet - gls-label-cancelled",
      alias: "teherguminet-gls-label-cancelled",
      subject: "GLS címke törölve – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(GlsLabelCancelledEmail, glsCancelledHuProps)
        ),
        "hu"
      ),
      variables: TEMPLATE_VARIABLES,
    },
    {
      key: "gls-label-cancelled",
      language: "sk",
      name: "Teherguminet - gls-label-cancelled (SK)",
      alias: "teherguminet-gls-label-cancelled-sk",
      subject: "GLS štítok bol zrušený – Teherguminet.hu",
      html: normalizeHtmlForResendVariables(
        await render(
          React.createElement(GlsLabelCancelledEmail, glsCancelledSkProps)
        ),
        "sk"
      ),
      variables: TEMPLATE_VARIABLES,
    },
  ]

  const existingTemplates = await listAllTemplates(templatesApi)
  const idMap: Record<string, string> = {}

  for (const definition of definitions) {
    const result = await syncTemplate(
      resend,
      existingTemplates,
      definition,
      from,
      replyTo
    )

    const mapKey =
      definition.language === "sk"
        ? `${definition.key}.sk`
        : definition.key
    idMap[mapKey] = result.id
    console.log(
      `${result.action.toUpperCase()} ${definition.name} (${definition.alias}) -> ${result.id}`
    )
  }

  if (!noWriteIds) {
    const target = path.resolve(process.cwd(), TEMPLATE_IDS_FILE)
    writeTemplateIdsFile(target, idMap)
    console.log(`Template IDs written to ${target}`)
  } else {
    console.log("Skipped writing .resend-template-ids.json (--no-write-ids).")
  }
}

if (require.main === module) {
  syncResendTemplates({
    args: process.argv.slice(2),
  } as ScriptArgs).catch((error) => {
    const message =
      error instanceof Error ? error.message : String(error)
    console.error(`Template sync failed: ${message}`)
    process.exitCode = 1
  })
}
