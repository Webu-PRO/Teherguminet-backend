import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CubeSolid } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  StatusBadge,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"

import { sdk } from "../../lib/client"

type TireType = { code: string; label: string }

type ImportPreviewRow = {
  sku: string
  handle: string
  title: string
  producer: string
  type: string
  stock: number
  priceHuf: number
  priceEur: number
  costEurNet: number
}

type ImportResult = {
  dryRun: boolean
  country: string
  durationMs: number
  feed: { rows: number; unparseable: number }
  eligible: number
  created: number
  updated: number
  failed: Array<{ sku: string; reason: string }>
  preview: ImportPreviewRow[]
}

type RunStatus = {
  state: "idle" | "running" | "done" | "error"
  mode: "import" | "dry-run" | "stock-sync"
  startedAt: string | null
  finishedAt: string | null
  message: string | null
  log: string[]
  result: ImportResult | null
  error: string | null
}

type TomketStatusResponse = {
  configured: boolean
  missing: string[]
  country: string
  pricing: {
    eur_huf_rate: number
    margin_percent_huf: number
    margin_percent_eur: number
    include_shipping: boolean
    huf_rounding: number
  } | null
  catalog: { imported_variants: number; producers: number }
  tire_types: TireType[]
  status: RunStatus
}

const POLL_INTERVAL_MS = 3000

const formatHuf = (value: number) =>
  `${new Intl.NumberFormat("hu-HU").format(value)} Ft`

const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) {
    return `${seconds} mp`
  }
  return `${Math.floor(seconds / 60)} p ${seconds % 60} mp`
}

const readErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) {
      return message
    }
  }
  return fallback
}

const TomketPage = () => {
  const [data, setData] = useState<TomketStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const [dryRun, setDryRun] = useState(true)
  const [limit, setLimit] = useState("50")
  const [types, setTypes] = useState<string[]>([])
  const [skipOutOfStock, setSkipOutOfStock] = useState(true)

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const payload = (await sdk.client.fetch("/admin/tomket", {
        method: "GET",
      })) as TomketStatusResponse

      setData(payload)
    } catch (error) {
      toast.error(readErrorMessage(error, "Nem sikerült betölteni a Tomket állapotot."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Poll while an import is running so the operator sees live progress.
  useEffect(() => {
    if (data?.status.state !== "running") {
      return
    }

    pollRef.current = setTimeout(() => {
      void load()
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current)
      }
    }
  }, [data, load])

  const startImport = useCallback(async () => {
    setStarting(true)
    try {
      const parsedLimit = Number(limit)
      await sdk.client.fetch("/admin/tomket/import", {
        method: "POST",
        body: {
          dry_run: dryRun,
          limit:
            Number.isFinite(parsedLimit) && parsedLimit > 0
              ? parsedLimit
              : undefined,
          types: types.length ? types : undefined,
          skip_out_of_stock: skipOutOfStock,
        },
      })

      toast.success(
        dryRun ? "Száraz futtatás elindult." : "Import elindult."
      )
      await load()
    } catch (error) {
      toast.error(readErrorMessage(error, "Az import indítása nem sikerült."))
    } finally {
      setStarting(false)
    }
  }, [dryRun, limit, load, skipOutOfStock, types])

  const toggleType = useCallback((code: string) => {
    setTypes((current) =>
      current.includes(code)
        ? current.filter((value) => value !== code)
        : [...current, code]
    )
  }, [])

  const status = data?.status
  const running = status?.state === "running"

  const statusTone = useMemo(() => {
    switch (status?.state) {
      case "running":
        return "orange" as const
      case "done":
        return "green" as const
      case "error":
        return "red" as const
      default:
        return "grey" as const
    }
  }, [status?.state])

  if (loading) {
    return (
      <Container className="p-6">
        <Text>Betöltés…</Text>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Container className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Heading level="h1">Tomket Dropship</Heading>
            <Text className="text-ui-fg-subtle mt-1">
              A Tomket beszállítói katalógus importja és készlet-szinkronja.
              Ország: <Badge size="2xsmall">{data?.country}</Badge>
            </Text>
          </div>
          <StatusBadge color={data?.configured ? "green" : "red"}>
            {data?.configured ? "Beállítva" : "Nincs beállítva"}
          </StatusBadge>
        </div>

        {!data?.configured && (
          <div className="bg-ui-bg-subtle rounded-lg p-4">
            <Text weight="plus">Hiányzó környezeti változók</Text>
            <Text className="text-ui-fg-subtle mt-1" size="small">
              Állítsd be ezeket az <code>apps/backend/.env</code> fájlban, majd
              indítsd újra a backendet:
            </Text>
            <ul className="mt-2 flex flex-wrap gap-2">
              {data?.missing.map((key) => (
                <li key={key}>
                  <Badge size="2xsmall" color="red">
                    {key}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bg-ui-bg-subtle rounded-lg p-4">
            <Text size="small" className="text-ui-fg-subtle">
              Importált Tomket variánsok
            </Text>
            <Heading level="h2">{data?.catalog.imported_variants ?? 0}</Heading>
          </div>
          <div className="bg-ui-bg-subtle rounded-lg p-4">
            <Text size="small" className="text-ui-fg-subtle">
              Gyártók
            </Text>
            <Heading level="h2">{data?.catalog.producers ?? 0}</Heading>
          </div>
          <div className="bg-ui-bg-subtle rounded-lg p-4">
            <Text size="small" className="text-ui-fg-subtle">
              Árazás
            </Text>
            {data?.pricing ? (
              <Text size="small" className="mt-1">
                {data.pricing.eur_huf_rate} Ft/EUR · +
                {data.pricing.margin_percent_huf}% (HUF) · +
                {data.pricing.margin_percent_eur}% (EUR)
                {data.pricing.include_shipping ? " · szállítás beépítve" : ""}
              </Text>
            ) : (
              <Text size="small" className="text-ui-fg-muted mt-1">
                Nincs beállítva
              </Text>
            )}
          </div>
        </div>
      </Container>

      <Container className="flex flex-col gap-4 p-6">
        <Heading level="h2">Import indítása</Heading>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id="tomket-dry-run"
              checked={dryRun}
              onCheckedChange={setDryRun}
              disabled={running}
            />
            <Label htmlFor="tomket-dry-run">
              Száraz futtatás (nem hoz létre terméket)
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="tomket-skip-oos"
              checked={skipOutOfStock}
              onCheckedChange={setSkipOutOfStock}
              disabled={running}
            />
            <Label htmlFor="tomket-skip-oos">
              Készleten nem lévők kihagyása
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="tomket-limit">Darabszám korlát</Label>
            <Input
              id="tomket-limit"
              className="w-28"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              placeholder="üres = mind"
              disabled={running}
            />
          </div>
        </div>

        <div>
          <Text size="small" className="text-ui-fg-subtle mb-2">
            Gumitípusok — ha egyet sem jelölsz, a teljes kínálat jön.
          </Text>
          <div className="flex flex-wrap gap-2">
            {(data?.tire_types ?? []).map((type) => {
              const active = types.includes(type.code)
              return (
                <Button
                  key={type.code}
                  size="small"
                  variant={active ? "primary" : "secondary"}
                  onClick={() => toggleType(type.code)}
                  disabled={running}
                >
                  {type.code} · {type.label}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={startImport}
            isLoading={starting}
            disabled={running || !data?.configured}
          >
            {dryRun ? "Száraz futtatás" : "Import indítása"}
          </Button>
          <Button variant="secondary" onClick={load} disabled={starting}>
            Frissítés
          </Button>
        </div>
      </Container>

      <Container className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <Heading level="h2">Futtatás állapota</Heading>
          <StatusBadge color={statusTone}>
            {status?.state === "running"
              ? "Fut"
              : status?.state === "done"
                ? "Kész"
                : status?.state === "error"
                  ? "Hiba"
                  : "Nincs futtatás"}
          </StatusBadge>
        </div>

        {status?.message && <Text>{status.message}</Text>}
        {status?.error && (
          <Text className="text-ui-fg-error">{status.error}</Text>
        )}

        {status?.result && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div>
              <Text size="small" className="text-ui-fg-subtle">
                Feed sorok
              </Text>
              <Text weight="plus">{status.result.feed.rows}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">
                Feldolgozható
              </Text>
              <Text weight="plus">{status.result.eligible}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">
                Létrehozva
              </Text>
              <Text weight="plus">{status.result.created}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">
                Frissítve
              </Text>
              <Text weight="plus">{status.result.updated}</Text>
            </div>
            <div>
              <Text size="small" className="text-ui-fg-subtle">
                Időtartam
              </Text>
              <Text weight="plus">
                {formatDuration(status.result.durationMs)}
              </Text>
            </div>
          </div>
        )}

        {status?.result?.failed?.length ? (
          <div className="bg-ui-bg-subtle rounded-lg p-4">
            <Text weight="plus" className="text-ui-fg-error">
              {status.result.failed.length} hibás tétel
            </Text>
            <ul className="mt-2 flex flex-col gap-1">
              {status.result.failed.slice(0, 10).map((failure) => (
                <li key={failure.sku}>
                  <Text size="small">
                    {failure.sku}: {failure.reason}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {status?.result?.preview?.length ? (
          <div className="overflow-x-auto">
            <Text weight="plus" className="mb-2">
              Minta az első tételekből
            </Text>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>SKU</Table.HeaderCell>
                  <Table.HeaderCell>Megnevezés</Table.HeaderCell>
                  <Table.HeaderCell>Gyártó</Table.HeaderCell>
                  <Table.HeaderCell>Típus</Table.HeaderCell>
                  <Table.HeaderCell>Készlet</Table.HeaderCell>
                  <Table.HeaderCell>Beszerzés</Table.HeaderCell>
                  <Table.HeaderCell>Eladási ár</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {status.result.preview.map((row) => (
                  <Table.Row key={row.sku}>
                    <Table.Cell>{row.sku}</Table.Cell>
                    <Table.Cell>{row.title}</Table.Cell>
                    <Table.Cell>{row.producer}</Table.Cell>
                    <Table.Cell>{row.type}</Table.Cell>
                    <Table.Cell>{row.stock}</Table.Cell>
                    <Table.Cell>{row.costEurNet} €</Table.Cell>
                    <Table.Cell>
                      {formatHuf(row.priceHuf)} / {row.priceEur} €
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        ) : null}

        {status?.log?.length ? (
          <div className="bg-ui-bg-subtle max-h-64 overflow-y-auto rounded-lg p-4">
            <Text size="small" weight="plus" className="mb-2">
              Napló
            </Text>
            {status.log.map((line, index) => (
              <Text
                key={`${index}-${line.slice(0, 24)}`}
                size="small"
                className="text-ui-fg-subtle font-mono"
              >
                {line}
              </Text>
            ))}
          </div>
        ) : null}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Tomket Dropship",
  icon: CubeSolid,
})

export default TomketPage
