import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils";
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceContext,
  CreateFulfillmentResult,
  FulfillmentOption,
  ValidateFulfillmentDataContext,
  Logger,
} from "@medusajs/types";

type InjectedDependencies = {
  logger?: Logger;
};

type MagyarPostaFulfillmentOptions = Record<string, unknown>;

type WeightTier = {
  max_kg: number;
  amount: number;
};

type WeightTierItem = {
  quantity?: number | null;
  variant?: {
    weight?: number | null;
  } | null;
};

const DEFAULT_WEIGHT_TIERS: WeightTier[] = [
  { max_kg: 10, amount: 1567 },
  { max_kg: 20, amount: 2354 },
  { max_kg: 40, amount: 4717 },
];

class MagyarPostaFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "magyar-posta";

  protected logger_?: Logger;
  protected options_: MagyarPostaFulfillmentOptions;

  constructor(
    { logger }: InjectedDependencies = {},
    options: MagyarPostaFulfillmentOptions = {}
  ) {
    super();
    this.logger_ = logger;
    this.options_ = options;
  }

  private resolveNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private resolveCalculatedAmount(
    optionData?: Record<string, unknown> | null,
    data?: Record<string, unknown> | null
  ) {
    const safeOptionData =
      optionData && typeof optionData === "object" ? optionData : {};
    const safeData = data && typeof data === "object" ? data : {};

    const candidates = [
      safeData.calculated_price,
      safeData.price,
      safeData.amount,
      safeOptionData.calculated_price,
      safeOptionData.price,
      safeOptionData.amount,
      this.options_["calculated_price"],
      process.env.MAGYAR_POSTA_CALCULATED_PRICE,
    ];

    for (const candidate of candidates) {
      const resolved = this.resolveNumber(candidate);
      if (resolved !== null) {
        return resolved;
      }
    }

    return 0;
  }

  private normalizeWeightTiers(value: unknown): WeightTier[] | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const tiers = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const maxKg = this.resolveNumber(record.max_kg ?? record.maxKg);
        const amount = this.resolveNumber(record.amount);

        if (maxKg === null || amount === null) {
          return null;
        }

        return {
          max_kg: maxKg,
          amount,
        };
      })
      .filter((entry): entry is WeightTier => Boolean(entry))
      .sort((a, b) => a.max_kg - b.max_kg);

    return tiers.length ? tiers : null;
  }

  private resolveWeightTiers(optionData: Record<string, unknown>) {
    const fromOptionData = this.normalizeWeightTiers(
      optionData.weight_tiers ?? optionData.weightTiers
    );
    if (fromOptionData) {
      return fromOptionData;
    }

    const fromOptions = this.normalizeWeightTiers(
      this.options_["weight_tiers"] ?? this.options_["weightTiers"]
    );
    if (fromOptions) {
      return fromOptions;
    }

    return DEFAULT_WEIGHT_TIERS;
  }

  private resolveWeightUnit(optionData: Record<string, unknown>) {
    const unit =
      optionData.weight_unit ??
      this.options_["weight_unit"] ??
      process.env.MAGYAR_POSTA_WEIGHT_UNIT;

    return unit === "kg" ? "kg" : "g";
  }

  /**
   * Weight in kg, or null when the item does not declare one.
   *
   * Unknown is not zero. Returning 0 for a missing weight put every item in
   * the lightest tier, so a cart of four truck tyres — none of which carries a
   * weight — was quoted 4 x 1567 = 6268 HUF for a carrier with a 40 kg parcel
   * limit. The number looked deliberate and was entirely fabricated.
   */
  private resolveItemWeightKg(weight: number | null, unit: "g" | "kg") {
    if (weight === null || weight === undefined || !Number.isFinite(weight)) {
      return null;
    }

    if (weight <= 0) {
      return null;
    }

    return unit === "kg" ? weight : weight / 1000;
  }

  private resolveTierAmount(weightKg: number, tiers: WeightTier[]) {
    for (const tier of tiers) {
      if (weightKg <= tier.max_kg) {
        return tier.amount;
      }
    }

    return tiers.length ? tiers[tiers.length - 1].amount : 0;
  }

  private resolveTieredAmount(
    context: CalculateShippingOptionPriceContext,
    optionData: Record<string, unknown>
  ) {
    // Medusa's context.items is loosely typed; cast to the fields we need.
    const items = Array.isArray(context?.items)
      ? (context.items as WeightTierItem[])
      : [];
    if (!items.length) {
      return null;
    }

    const tiers = this.resolveWeightTiers(optionData);
    const unit = this.resolveWeightUnit(optionData);

    // One unweighed item makes the whole quote a guess, so decline the tier
    // calculation entirely and let the caller fall back to the configured
    // amount. A quote invented from missing data is worse than a flat one:
    // it is wrong in the shop's favour and nothing downstream can tell.
    let total = 0;
    for (const item of items) {
      const quantity =
        typeof item.quantity === "number" && Number.isFinite(item.quantity)
          ? item.quantity
          : 1;
      const weightKg = this.resolveItemWeightKg(
        item.variant?.weight ?? null,
        unit
      );
      if (weightKg === null) {
        return null;
      }
      total += this.resolveTierAmount(weightKg, tiers) * quantity;
    }

    return total;
  }

  private resolveTaxInclusive() {
    const optionValue =
      this.options_["is_calculated_price_tax_inclusive"] ??
      process.env.MAGYAR_POSTA_CALCULATED_PRICE_TAX_INCLUSIVE;
    return optionValue === true || optionValue === "true";
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "magyar-posta-standard",
        name: "Magyar Posta",
      },
    ];
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: any
  ): Promise<Record<string, unknown>> {
    return data;
  }

  async calculatePrice(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: any
  ): Promise<CalculatedShippingOptionPrice> {
    const tieredAmount = this.resolveTieredAmount(context, optionData);
    const calculatedAmount =
      typeof tieredAmount === "number"
        ? tieredAmount
        : this.resolveCalculatedAmount(optionData, data);

    return {
      calculated_amount: calculatedAmount,
      is_calculated_price_tax_inclusive: this.resolveTaxInclusive(),
    };
  }

  async canCalculate(): Promise<boolean> {
    return true;
  }

  async validateOption(_data: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async createFulfillment(): Promise<CreateFulfillmentResult> {
    return {
      data: {},
      labels: [],
    };
  }

  async cancelFulfillment(): Promise<Record<string, unknown>> {
    return {};
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    return {
      data: {},
      labels: [],
    };
  }
}

export default MagyarPostaFulfillmentService;
