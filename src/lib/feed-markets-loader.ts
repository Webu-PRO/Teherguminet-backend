import type { IRegionModuleService } from "@medusajs/types"
import { Modules } from "@medusajs/utils"

import { deriveFeedMarketsFromRegions, type FeedMarket } from "./feed-markets"

type ScopeLike = {
  resolve: <T = unknown>(key: string) => T
}

export const listFeedMarketsFromRegions = async (scope: ScopeLike) => {
  const regionService = scope.resolve<IRegionModuleService>(Modules.REGION)
  const pageSize = 100

  let offset = 0
  let total = 0
  const regions: Parameters<typeof deriveFeedMarketsFromRegions>[0] = []

  do {
    const [chunk, count] = await regionService.listAndCountRegions(
      {},
      {
        relations: ["countries"],
        take: pageSize,
        skip: offset,
      }
    )

    if (Array.isArray(chunk) && chunk.length) {
      regions.push(...chunk)
      offset += chunk.length
    } else {
      offset += pageSize
    }

    total = count ?? 0
  } while (offset < total)

  return deriveFeedMarketsFromRegions(regions)
}

export const listSupportedFeedPairs = (markets: FeedMarket[]) => {
  const pairs = new Set<string>()

  for (const market of markets) {
    pairs.add(`${market.country_code}+${market.currency_code}`)
  }

  return [...pairs].sort()
}
