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

type WeightBand = {
  id: string
  min_kg: number
  max_kg: number | null
}

type PackageBand = {
  id: string
  min_packages: number
  max_packages: number | null
}

type GlsPriceRow = {
  id?: string
  weight_band_id: string
  package_band_id: string
  price_huf: number
}

type GlsPriceMatrix = {
  weight_bands: WeightBand[]
  package_bands: PackageBand[]
  prices: GlsPriceRow[]
}

type ShippingWeightItem = {
  quantity?: number | null
  variant?: {
    weight?: number | null
  } | null
}

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

  private resolveJsonRecord(value: unknown): Record<string, unknown> | null {
    if (!value) {
      return null
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown>
        }
      } catch {
        return null
      }
    }

    if (typeof value === "object") {
      return value as Record<string, unknown>
    }

    return null
  }

  private normalizeWeightBands(value: unknown): WeightBand[] | null {
    if (!Array.isArray(value)) {
      return null
    }

    const bands = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null
        }

        const record = entry as Record<string, unknown>
        const id =
          typeof record.id === "string" && record.id.trim().length
            ? record.id.trim()
            : null
        const minKg = this.resolveNumber(record.min_kg ?? record.minKg)
        const maxRaw = record.max_kg ?? record.maxKg
        let maxKg: number | null = null
        if (maxRaw !== null && maxRaw !== undefined) {
          const parsed = this.resolveNumber(maxRaw)
          if (parsed === null) {
            return null
          }
          maxKg = parsed
        }

        if (!id || minKg === null) {
          return null
        }

        return {
          id,
          min_kg: minKg,
          max_kg: maxKg,
        }
      })
      .filter((entry): entry is WeightBand => Boolean(entry))
      .sort((a, b) => a.min_kg - b.min_kg)

    return bands.length ? bands : null
  }

  private normalizePackageBands(value: unknown): PackageBand[] | null {
    if (!Array.isArray(value)) {
      return null
    }

    const bands = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null
        }

        const record = entry as Record<string, unknown>
        const id =
          typeof record.id === "string" && record.id.trim().length
            ? record.id.trim()
            : null
        const minPackages = this.resolveNumber(
          record.min_packages ?? record.minPackages
        )
        const maxRaw = record.max_packages ?? record.maxPackages
        let maxPackages: number | null = null
        if (maxRaw !== null && maxRaw !== undefined) {
          const parsed = this.resolveNumber(maxRaw)
          if (parsed === null) {
            return null
          }
          maxPackages = parsed
        }

        if (!id || minPackages === null) {
          return null
        }

        return {
          id,
          min_packages: minPackages,
          max_packages: maxPackages,
        }
      })
      .filter((entry): entry is PackageBand => Boolean(entry))
      .sort((a, b) => a.min_packages - b.min_packages)

    return bands.length ? bands : null
  }

  private normalizePrices(value: unknown): GlsPriceRow[] | null {
    if (!Array.isArray(value)) {
      return null
    }

    const prices = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null
        }

        const record = entry as Record<string, unknown>
        const weightBandId =
          typeof record.weight_band_id === "string"
            ? record.weight_band_id.trim()
            : typeof record.weightBandId === "string"
            ? record.weightBandId.trim()
            : null
        const packageBandId =
          typeof record.package_band_id === "string"
            ? record.package_band_id.trim()
            : typeof record.packageBandId === "string"
            ? record.packageBandId.trim()
            : null
        const price = this.resolveNumber(
          record.price_huf ??
            record.priceHuf ??
            record.price ??
            record.amount
        )

        if (!weightBandId || !packageBandId || price === null) {
          return null
        }

        const id =
          typeof record.id === "string" && record.id.trim().length
            ? record.id.trim()
            : undefined

        return {
          ...(id ? { id } : {}),
          weight_band_id: weightBandId,
          package_band_id: packageBandId,
          price_huf: price,
        }
      })
      .filter((entry): entry is GlsPriceRow => Boolean(entry))

    return prices.length ? prices : null
  }

  private resolvePriceMatrix(
    optionData: Record<string, unknown>
  ): GlsPriceMatrix | null {
    const candidates = [
      optionData.gls_price_matrix,
      optionData.glsPriceMatrix,
      optionData.price_matrix,
      optionData.priceMatrix,
      this.options_["gls_price_matrix"],
      this.options_["glsPriceMatrix"],
      this.options_["price_matrix"],
      this.options_["priceMatrix"],
      process.env.GLS_PRICE_MATRIX,
    ]

    for (const candidate of candidates) {
      const record = this.resolveJsonRecord(candidate)
      if (!record) {
        continue
      }

      const weightBands = this.normalizeWeightBands(
        record.weight_bands ?? record.weightBands
      )
      const packageBands = this.normalizePackageBands(
        record.package_bands ?? record.packageBands
      )
      const prices = this.normalizePrices(
        record.prices ?? record.price_rows ?? record.priceRows
      )

      if (weightBands && packageBands && prices) {
        return {
          weight_bands: weightBands,
          package_bands: packageBands,
          prices,
        }
      }
    }

    return null
  }

  private resolveWeightUnit(optionData: Record<string, unknown>) {
    const unit =
      optionData.weight_unit ??
      this.options_["weight_unit"] ??
      process.env.GLS_WEIGHT_UNIT

    return unit === "kg" ? "kg" : "g"
  }

  private resolveContextItems(
    context: CalculateShippingOptionPriceContext
  ): ShippingWeightItem[] {
    if (!Array.isArray(context?.items)) {
      return []
    }

    return context.items as ShippingWeightItem[]
  }

  private resolveTotalWeightKg(
    context: CalculateShippingOptionPriceContext,
    optionData: Record<string, unknown>
  ): number {
    const unit = this.resolveWeightUnit(optionData)
    const items: ShippingWeightItem[] = this.resolveContextItems(context)
    let totalWeight = 0

    for (const item of items) {
      const quantity =
        typeof item.quantity === "number" && Number.isFinite(item.quantity)
          ? item.quantity
          : 1
      const weight =
        typeof item.variant?.weight === "number"
          ? item.variant.weight
          : 0

      totalWeight += weight * quantity
    }

    return unit === "kg" ? totalWeight : totalWeight / 1000
  }

  private resolvePackagesCount(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: CalculateShippingOptionPriceContext,
    totalWeightKg: number
  ) {
    const explicit =
      this.resolveNumber(data.packages_count ?? data.packagesCount) ??
      this.resolveNumber(
        optionData.packages_count ?? optionData.packagesCount
      )

    if (explicit !== null) {
      return Math.max(1, Math.ceil(explicit))
    }

    const maxWeight = this.resolveNumber(
      optionData.max_package_weight_kg ??
        optionData.maxPackageWeightKg ??
        this.options_["max_package_weight_kg"] ??
        process.env.GLS_MAX_PACKAGE_WEIGHT_KG
    )

    if (maxWeight && totalWeightKg > 0) {
      return Math.max(1, Math.ceil(totalWeightKg / maxWeight))
    }

    const items: ShippingWeightItem[] = this.resolveContextItems(context)
    let quantityTotal = 0

    for (const item of items) {
      const quantity =
        typeof item.quantity === "number" && Number.isFinite(item.quantity)
          ? item.quantity
          : 1
      quantityTotal += quantity
    }

    return Math.max(1, quantityTotal)
  }

  private resolveWeightBand(
    totalWeightKg: number,
    bands: WeightBand[]
  ) {
    return bands.find(
      (band) =>
        totalWeightKg >= band.min_kg &&
        (band.max_kg === null || totalWeightKg <= band.max_kg)
    )
  }

  private resolvePackageBand(
    packagesCount: number,
    bands: PackageBand[]
  ) {
    return bands.find(
      (band) =>
        packagesCount >= band.min_packages &&
        (band.max_packages === null ||
          packagesCount <= band.max_packages)
    )
  }

  private calculateMatrixPrice(
    totalWeightKg: number,
    packagesCount: number,
    matrix: GlsPriceMatrix
  ) {
    const weightBand = this.resolveWeightBand(
      totalWeightKg,
      matrix.weight_bands
    )

    if (!weightBand) {
      throw new Error("GLS pricing: no matching weight band")
    }

    const packageBand = this.resolvePackageBand(
      packagesCount,
      matrix.package_bands
    )

    if (!packageBand) {
      throw new Error("GLS pricing: no matching package band")
    }

    const priceRow = matrix.prices.find(
      (row) =>
        row.weight_band_id === weightBand.id &&
        row.package_band_id === packageBand.id
    )

    if (!priceRow) {
      throw new Error("GLS pricing: no matching price row")
    }

    return priceRow.price_huf * packagesCount
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
    context: CalculateShippingOptionPriceContext
  ): Promise<CalculatedShippingOptionPrice> {
    const matrix = this.resolvePriceMatrix(optionData)

    if (!matrix) {
      throw new Error("GLS pricing matrix is not configured")
    }

    const totalWeightKg = this.resolveTotalWeightKg(context, optionData)
    const packagesCount = this.resolvePackagesCount(
      optionData,
      data,
      context,
      totalWeightKg
    )
    const calculatedAmount = this.calculateMatrixPrice(
      totalWeightKg,
      packagesCount,
      matrix
    )

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

export default GlsFulfillmentService
