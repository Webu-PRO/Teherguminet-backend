import { useEffect } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useQueryClient } from "@tanstack/react-query"
import { sdk } from "../lib/client"
import { subscribeProductPagePrefetch } from "../lib/prefetch-product-pages"

const ProductListPrefetch = () => {
  const client = useQueryClient()
  useEffect(
    () => subscribeProductPagePrefetch(client, (params) => sdk.admin.product.list(params)),
    [client]
  )
  return null
}

export const config = defineWidgetConfig({ zone: "product.list.before" })
export default ProductListPrefetch
