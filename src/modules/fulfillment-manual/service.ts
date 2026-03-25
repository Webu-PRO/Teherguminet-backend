import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceContext,
  CreateFulfillmentResult,
  FulfillmentOption,
  ValidateFulfillmentDataContext,
  Logger,
} from "@medusajs/types"

type InjectedDependencies = {
  logger?: Logger
}

type ManualFulfillmentOptions = Record<string, unknown>

type ShippingWeightItem = {
  quantity?: number | string | { value?: unknown; numeric?: unknown } | null
  weight?: number | string | null
  variant?: {
    weight?: number | string | null
  } | null
  metadata?: Record<string, unknown> | null
}

class ManualFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "manual"

  protected logger_?: Logger
  protected options_: ManualFulfillmentOptions

  constructor(
    { logger }: InjectedDependencies = {},
    options: ManualFulfillmentOptions = {}
  ) {
    super()
    this.logger_ = logger
    this.options_ = options
  }

  private resolveNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }

    if (typeof value === "string" && value.trim().length) {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }

    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>
      const numeric = record.numeric
      if (typeof numeric === "number" && Number.isFinite(numeric)) {
        return numeric
      }

      const raw = record.value
      if (raw !== undefined) {
        const parsed = this.resolveNumber(raw)
        if (parsed !== null) {
          return parsed
        }
      }

      const valueOf = (value as { valueOf?: () => unknown }).valueOf
      if (typeof valueOf === "function") {
        const parsed = valueOf.call(value)
        if (parsed !== value) {
          const resolved = this.resolveNumber(parsed)
          if (resolved !== null) {
            return resolved
          }
        }
      }

      const toJson = (value as { toJSON?: () => unknown }).toJSON
      if (typeof toJson === "function") {
        const parsed = toJson.call(value)
        if (parsed !== value) {
          const resolved = this.resolveNumber(parsed)
          if (resolved !== null) {
            return resolved
          }
        }
      }
    }

    return null
  }

  private resolvePricePerKg(optionData: Record<string, unknown>) {
    const candidate =
      optionData.price_per_kg ??
      optionData.pricePerKg ??
      this.options_["price_per_kg"] ??
      process.env.MANUAL_PRICE_PER_KG
    const resolved = this.resolveNumber(candidate)
    return resolved ?? 40
  }

  private resolveWeightUnit(optionData: Record<string, unknown>) {
    const unit =
      optionData.weight_unit ??
      optionData.weightUnit ??
      this.options_["weight_unit"] ??
      process.env.MANUAL_WEIGHT_UNIT ??
      "g"

    const normalized = typeof unit === "string" ? unit.toLowerCase() : unit
    return normalized === "kg" ? "kg" : "g"
  }

  private resolveContextItems(
    context: CalculateShippingOptionPriceContext
  ): ShippingWeightItem[] {
    if (!Array.isArray(context?.items)) {
      return []
    }

    return context.items as ShippingWeightItem[]
  }

  private resolveDataTotalWeightKg(
    data: Record<string, unknown>,
    optionData: Record<string, unknown>
  ): number | null {
    if (!data || typeof data !== "object") {
      return null
    }

    const record = data as Record<string, unknown>
    const direct = this.resolveNumber(
      record.total_weight_kg ?? record.totalWeightKg
    )

    if (direct !== null) {
      return direct
    }

    const fallback = this.resolveNumber(
      record.total_weight ?? record.totalWeight ?? record.weight
    )

    if (fallback === null) {
      return null
    }

    const unitCandidate = record.weight_unit ?? record.weightUnit
    const unit =
      typeof unitCandidate === "string"
        ? unitCandidate.toLowerCase()
        : this.resolveWeightUnit(optionData)

    return unit === "g" ? fallback / 1000 : fallback
  }

  private resolveItemWeight(item: ShippingWeightItem) {
    const metadata =
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : null

    const weightCandidate =
      item.variant?.weight ??
      item.weight ??
      metadata?.weight ??
      metadata?.weight_kg ??
      metadata?.weightKg ??
      metadata?.weight_g ??
      metadata?.weightG

    return this.resolveNumber(weightCandidate) ?? 0
  }

  private resolveTotalWeightKg(
    context: CalculateShippingOptionPriceContext,
    optionData: Record<string, unknown>
  ): number {
    const unit = this.resolveWeightUnit(optionData)
    const items: ShippingWeightItem[] = this.resolveContextItems(context)
    let totalWeight = 0

    for (const item of items) {
      const quantity = this.resolveNumber(item.quantity) ?? 1
      const weight = this.resolveItemWeight(item)
      totalWeight += weight * quantity
    }

    const weightKg = unit === "kg" ? totalWeight : totalWeight / 1000

    if (items.length && weightKg === 0) {
      this.logger_?.warn(
        "Manual pricing: computed cart weight is 0; check variant weight or item metadata weight fields."
      )
    }

    return weightKg
  }

  private resolveTaxInclusive() {
    const optionValue =
      this.options_["is_calculated_price_tax_inclusive"] ??
      process.env.MANUAL_CALCULATED_PRICE_TAX_INCLUSIVE
    return optionValue === true || optionValue === "true"
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "manual",
        name: "Manual",
      },
    ]
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: any
  ): Promise<Record<string, unknown>> {
    return data
  }

  async calculatePrice(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: any
  ): Promise<CalculatedShippingOptionPrice> {
    const providedWeightKg = this.resolveDataTotalWeightKg(data, optionData)
    const totalWeightKg =
      providedWeightKg ?? this.resolveTotalWeightKg(context, optionData)
    const pricePerKg = this.resolvePricePerKg(optionData)
    const calculatedAmount = Math.round(totalWeightKg * pricePerKg)

    return {
      calculated_amount: calculatedAmount,
      is_calculated_price_tax_inclusive: this.resolveTaxInclusive(),
    }
  }

  async canCalculate(): Promise<boolean> {
    return true
  }

  async validateOption(_data: Record<string, unknown>): Promise<boolean> {
    return true
  }

  async createFulfillment(): Promise<CreateFulfillmentResult> {
    return {
      data: {},
      labels: [],
    }
  }

  async cancelFulfillment(): Promise<Record<string, unknown>> {
    return {}
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    return {
      data: {},
      labels: [],
    }
  }
}

export default ManualFulfillmentService
