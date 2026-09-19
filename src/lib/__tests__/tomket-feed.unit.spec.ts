import { describe, expect, it } from "@jest/globals"

import {
  parseTomketFullFeed,
  parseTomketStockFeed,
} from "../tomket-feed"

// The worked example from the Tomket Dropship API docs, section 4.1.
const SAMPLE_ROW =
  "128432;6959956703913;Linglong;GREEN-Max Winter HP;165;70;14;T;81;6.767;" +
  "f/c/2/71;26.7;200;7.9;" +
  "https://img.tomket.com/img/ex/pneudetail/linglong_greenmax_winter_hp.jpg;" +
  "PW;2617-3417;no;no;no;d/a/b/71/1/0;123456;https://eprel.ec.europa.eu/qr/1094564"

describe("parseTomketFullFeed", () => {
  it("maps every documented column of a full feed row", () => {
    const { rows, skippedCount } = parseTomketFullFeed(SAMPLE_ROW)

    expect(skippedCount).toBe(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      internalId: "128432",
      ean: "6959956703913",
      producer: "Linglong",
      design: "GREEN-Max Winter HP",
      width: "165",
      height: "70",
      diameter: "14",
      speedIndex: "T",
      loadIndex: "81",
      weightKg: 6.767,
      priceEurNet: 26.7,
      stock: 200,
      shippingFeeEurNet: 7.9,
      tireType: "PW",
      dot: "2617-3417",
      extraLoad: false,
      runflat: false,
      rimFringeProtector: false,
      eprel: "123456",
    })
  })

  it("reads the new EU label into its six components", () => {
    const { rows } = parseTomketFullFeed(SAMPLE_ROW)

    expect(rows[0].label).toEqual({
      rollingResistance: "d",
      wetGrip: "a",
      noiseClass: "b",
      noiseValue: "71",
      snowGrip: true,
      iceGrip: false,
    })
  })

  it("parses yes/no flags", () => {
    const row = SAMPLE_ROW.split(";")
    row[17] = "yes"
    row[18] = "yes"
    row[19] = "yes"

    const { rows } = parseTomketFullFeed(row.join(";"))

    expect(rows[0]).toMatchObject({
      extraLoad: true,
      runflat: true,
      rimFringeProtector: true,
    })
  })

  it("tolerates columns appended after the documented tail", () => {
    const { rows, skippedCount } = parseTomketFullFeed(
      `${SAMPLE_ROW};future-column;another`
    )

    expect(skippedCount).toBe(0)
    expect(rows[0].internalId).toBe("128432")
  })

  it("skips a header line and rows without a usable price", () => {
    const feed = [
      "internal id;ean code;producer",
      SAMPLE_ROW,
      SAMPLE_ROW.replace(";26.7;200;", ";;200;"),
      SAMPLE_ROW.replace(";26.7;200;", ";0;200;"),
    ].join("\n")

    const { rows, skipped, skippedCount } = parseTomketFullFeed(feed)

    expect(rows).toHaveLength(1)
    expect(skippedCount).toBe(3)
    expect(skipped[0].reason).toBe("internal id is not numeric")
    expect(skipped[1].reason).toBe("missing or non-positive price")
  })

  it("ignores blank lines and trailing CRLF", () => {
    const { rows, skippedCount } = parseTomketFullFeed(
      `${SAMPLE_ROW}\r\n\r\n${SAMPLE_ROW.replace("128432", "128433")}\r\n`
    )

    expect(rows.map((row) => row.internalId)).toEqual(["128432", "128433"])
    expect(skippedCount).toBe(0)
  })
})

describe("parseTomketStockFeed", () => {
  it("parses the four-column stock feed", () => {
    const { rows, skippedCount } = parseTomketStockFeed(
      "128432;26.7;200;7.9\n128433;31.2;0;7.9"
    )

    expect(skippedCount).toBe(0)
    expect(rows).toEqual([
      {
        internalId: "128432",
        priceEurNet: 26.7,
        stock: 200,
        shippingFeeEurNet: 7.9,
      },
      {
        internalId: "128433",
        priceEurNet: 31.2,
        stock: 0,
        shippingFeeEurNet: 7.9,
      },
    ])
  })

  it("reports unparseable lines instead of throwing", () => {
    const { rows, skippedCount } = parseTomketStockFeed("oops;bad\n128432;26.7;5;7.9")

    expect(rows).toHaveLength(1)
    expect(skippedCount).toBe(1)
  })
})
