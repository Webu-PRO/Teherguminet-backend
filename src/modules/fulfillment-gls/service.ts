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
    _optionData: Record<string, unknown>,
    _data: Record<string, unknown>,
    _context: CalculateShippingOptionPriceContext
  ): Promise<CalculatedShippingOptionPrice> {
    throw new Error("GLS fulfillment does not support price calculation")
  }

  async canCalculate(): Promise<boolean> {
    return false
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
