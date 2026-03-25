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

type TomketOptions = Record<string, unknown>

class TomketFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "tomket"

  protected logger_?: Logger
  protected options_: TomketOptions

  constructor(
    { logger }: InjectedDependencies = {},
    options: TomketOptions = {}
  ) {
    super()
    this.logger_ = logger
    this.options_ = options
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "tomket",
        name: "Tomket Dropship",
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
    _optionData: Record<string, unknown>,
    _data: Record<string, unknown>,
    _context: any
  ): Promise<CalculatedShippingOptionPrice> {
    throw new Error(
      "Tomket fulfillment does not support price calculation"
    )
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

export default TomketFulfillmentService
