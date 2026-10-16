/** Didar's provider-independent aggregate contract. NOT a claimed Tahesab OpenAPI mapping. */
export const ADAPTER_VERSION = "didar-aggregate-v1";
export function canonical(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function jalaliDate(at: string) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)?.value)
    .join("/");
}
export function validateAggregate(p: any) {
  const keys = [
    "version",
    "mode",
    "merchant",
    "period",
    "Factor_Code",
    "groups",
  ];
  if (
    !p ||
    typeof p !== "object" ||
    Object.keys(p).some((k) => !keys.includes(k)) ||
    p.version !== ADAPTER_VERSION ||
    !["MOCK", "DRY_RUN"].includes(p.mode) ||
    !/^DIDAR_QA_[a-f0-9]{32}$/.test(p.Factor_Code)
  )
    throw new Error("INVALID_AGGREGATE");
  if (
    !p.merchant ||
    Object.keys(p.merchant).sort().join(",") !==
      "account_code,gold_code,id,invoice_reference,rial_code" ||
    !Object.values(p.merchant).every(
      (v) => typeof v === "string" && v.length > 0 && v.length <= 250,
    )
  )
    throw new Error("INVALID_MERCHANT_MAPPING");
  if (
    !p.period ||
    Object.keys(p.period).sort().join(",") !== "end_at,start_at,timezone" ||
    p.period.timezone !== "Asia/Tehran" ||
    !Number.isFinite(Date.parse(p.period.start_at)) ||
    !Number.isFinite(Date.parse(p.period.end_at)) ||
    Date.parse(p.period.start_at) >= Date.parse(p.period.end_at)
  )
    throw new Error("INVALID_CLOSE_PERIOD");
  if (
    !Array.isArray(p.groups) ||
    p.groups.length < 1 ||
    p.groups.length > 10000
  )
    throw new Error("INVALID_GROUPS");
  for (const g of p.groups) {
    if (
      Object.keys(g).sort().join(",") !==
        "account,credit,debit,event_type,instrument,jalali_date,metal_basis,party_role,purity" ||
      !["IRR", "GOLD_UG", "MEMO_GOLD_UG"].includes(g.instrument) ||
      !["MERCHANT", "DIDAR", "COUNTERPARTY"].includes(g.party_role) ||
      !/^\d{4}\/\d{2}\/\d{2}$/.test(g.jalali_date) ||
      g.metal_basis !== "FINE_GOLD_UG" ||
      !Number.isInteger(g.purity) ||
      g.purity < 1 ||
      g.purity > 1000 ||
      !/^\d{1,30}$/.test(g.debit) ||
      !/^\d{1,30}$/.test(g.credit) ||
      typeof g.event_type !== "string" ||
      typeof g.account !== "string"
    )
      throw new Error("INVALID_GROUP");
  }
  for (const instrument of ["IRR", "GOLD_UG", "MEMO_GOLD_UG"]) {
    const sum = p.groups
      .filter((g: any) => g.instrument === instrument)
      .reduce(
        (n: bigint, g: any) => n + BigInt(g.debit) - BigInt(g.credit),
        0n,
      );
    if (sum !== 0n) throw new Error("INVALID_UNBALANCED_EXPORT");
  }
  return p;
}
export function concreteTahesabRequest(_aggregate: any): never {
  throw new Error("BLOCKED_BY_SPEC");
}
/** Mixed positional values are tested only as a mock-provider envelope, not a vendor endpoint. */
export function validateMockEnvelope(
  headers: Record<string, string | undefined>,
  body: any,
) {
  if (
    headers.authorization !== "Bearer DIDAR_LOCAL_MOCK_ONLY" ||
    !/^QA_[A-Za-z0-9_-]{1,80}$/.test(headers.DBname || headers.dbname || "") ||
    !Array.isArray(body) ||
    body.length !== 3 ||
    typeof body[0] !== "string" ||
    body[1] !== 1
  )
    throw new Error("INVALID_MOCK_ENVELOPE");
  const payload = validateAggregate(body[2]);
  if (body[0] !== payload.Factor_Code) throw new Error("INVALID_MOCK_FACTOR");
  return payload;
}
