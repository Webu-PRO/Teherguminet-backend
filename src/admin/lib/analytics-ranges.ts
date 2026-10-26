// Időszak-presetek és összehasonlítási tartományok a WooCommerce Analytics
// mintájára. Minden a böngésző helyi naptárában számol; a "ez a …" presetek a
// mai napig tartanak (Woo: period-to-date).

export type PresetKey =
  | "today"
  | "yesterday"
  | "week"
  | "last_week"
  | "month"
  | "last_month"
  | "quarter"
  | "last_quarter"
  | "year"
  | "last_year"
  | "custom"

export type CompareKey = "previous_period" | "previous_year" | "none"

export type Range = { from: Date; to: Date }

type Unit = "day" | "week" | "month" | "quarter" | "year"

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())

/** Hónap eltolása úgy, hogy a nap a célhónap végére szoruljon (márc 31 − 1 hó = febr 28). */
const addMonths = (d: Date, n: number) => {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d.getDate(), last))
  return target
}

const startOf = (d: Date, unit: Unit): Date => {
  switch (unit) {
    case "day":
      return startOfDay(d)
    case "week":
      return addDays(startOfDay(d), -((d.getDay() + 6) % 7))
    case "month":
      return new Date(d.getFullYear(), d.getMonth(), 1)
    case "quarter":
      return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
    case "year":
      return new Date(d.getFullYear(), 0, 1)
  }
}

const shift = (d: Date, unit: Unit, n: number): Date => {
  switch (unit) {
    case "day":
      return addDays(d, n)
    case "week":
      return addDays(d, 7 * n)
    case "month":
      return addMonths(d, n)
    case "quarter":
      return addMonths(d, 3 * n)
    case "year":
      return addMonths(d, 12 * n)
  }
}

const endOfUnit = (start: Date, unit: Unit) => new Date(shift(start, unit, 1).getTime() - 1)

const PRESET_UNIT: Record<Exclude<PresetKey, "custom">, { unit: Unit; back: number }> = {
  today: { unit: "day", back: 0 },
  yesterday: { unit: "day", back: 1 },
  week: { unit: "week", back: 0 },
  last_week: { unit: "week", back: 1 },
  month: { unit: "month", back: 0 },
  last_month: { unit: "month", back: 1 },
  quarter: { unit: "quarter", back: 0 },
  last_quarter: { unit: "quarter", back: 1 },
  year: { unit: "year", back: 0 },
  last_year: { unit: "year", back: 1 },
}

export const presetRange = (preset: Exclude<PresetKey, "custom">, now = new Date()): Range => {
  const { unit, back } = PRESET_UNIT[preset]
  const from = shift(startOf(now, unit), unit, -back)
  const to = back === 0 ? endOfDay(now) : endOfUnit(from, unit)
  return { from, to }
}

/** Egyéni tartomány két `YYYY-MM-DD` dátumból (mindkét nap teljes egészében). */
export const customRange = (fromIso: string, toIso: string): Range | null => {
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number)
    return y && m && d ? new Date(y, m - 1, d) : null
  }
  const a = parse(fromIso)
  const b = parse(toIso)
  if (!a || !b) return null
  return a <= b ? { from: startOfDay(a), to: endOfDay(b) } : { from: startOfDay(b), to: endOfDay(a) }
}

/**
 * Összehasonlító tartomány. Előző év: mindkét vég −1 év. Előző időszak: a
 * naptári presetek egy egységgel visszaléptetve (okt 1–26 → szept 1–26), az
 * egyéni tartomány a saját hosszával közvetlenül előtte.
 */
export const compareRange = (range: Range, preset: PresetKey, compare: CompareKey): Range | null => {
  if (compare === "none") return null
  if (compare === "previous_year") return { from: shift(range.from, "year", -1), to: shift(range.to, "year", -1) }
  if (preset !== "custom") {
    const { unit } = PRESET_UNIT[preset]
    const from = shift(range.from, unit, -1)
    const end = endOfUnit(from, unit)
    // Teljes egység (pl. szeptember) → a teljes előző egység (az egész augusztus).
    const full = range.to.getTime() >= endOfUnit(range.from, unit).getTime()
    const to = full ? end : new Date(Math.min(shift(range.to, unit, -1).getTime(), end.getTime()))
    return { from, to }
  }
  const days = Math.round((startOfDay(range.to).getTime() - startOfDay(range.from).getTime()) / 86_400_000) + 1
  const from = addDays(range.from, -days)
  return { from, to: endOfDay(addDays(from, days - 1)) }
}

export const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
