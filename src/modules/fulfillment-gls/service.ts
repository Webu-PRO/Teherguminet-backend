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

type GlsFulfillmentOptions = Record<string, unknown>

class GlsFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "gls"

  protected logger_?: Logger
  protected options_: GlsFulfillmentOptions

  constructor(
    { logger }: InjectedDependencies = {},
    options: GlsFulfillmentOptions = {}
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

    return null
  }

  private resolveCalculatedAmount(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>
  ) {
    const candidates = [
      data.calculated_price,
      data.price,
      data.amount,
      optionData.calculated_price,
      optionData.price,
      optionData.amount,
      this.options_["calculated_price"],
      process.env.GLS_CALCULATED_PRICE,
    ]

    for (const candidate of candidates) {
      const resolved = this.resolveNumber(candidate)
      if (resolved !== null) {
        return resolved
      }
    }

    return 0
  }

  private resolveTaxInclusive() {
    const optionValue =
      this.options_["is_calculated_price_tax_inclusive"] ??
      process.env.GLS_CALCULATED_PRICE_TAX_INCLUSIVE
    return optionValue === true || optionValue === "true"
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "gls-home-delivery",
        name: "GLS Home Delivery",
      },
      {
        id: "gls-pickup",
        name: "GLS Pickup Point",
      },
    ]
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: ValidateFulfillmentDataContext
  ): Promise<Record<string, unknown>> {
    return data
  }

  async calculatePrice(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: CalculateShippingOptionPriceContext
  ): Promise<CalculatedShippingOptionPrice> {
    return {
      calculated_amount: this.resolveCalculatedAmount(optionData, data),
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

export default GlsFulfillmentService
