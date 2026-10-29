import Papa from "papaparse";
import { normalizePhone } from "./phone";
import { normalizeKey } from "./template";
import type { ConsentStatus } from "./models";

export interface ParsedContactRow {
  phone: string;
  name: string;
  tags: string[];
  attributes: Record<string, string>;
  consent: ConsentStatus | null; // null when the file has no consent column value for this row
}

export interface CsvRowError {
  row: number; // 1-based, counting the header as row 1
  message: string;
}

export interface CsvParseResult {
  rows: ParsedContactRow[];
  errors: CsvRowError[];
  duplicates: number;
  headers: string[];
}

const PHONE_HEADERS = ["phone", "phone_number", "mobile", "whatsapp", "number", "msisdn", "contact"];
const NAME_HEADERS = ["name", "full_name", "fullname", "contact_name"];
const FIRST_HEADERS = ["first_name", "firstname"];
const LAST_HEADERS = ["last_name", "lastname", "surname"];
const TAG_HEADERS = ["tags", "tag", "groups", "group", "labels"];
const CONSENT_HEADERS = ["consent", "opt_in", "optin", "opted_in", "subscribed", "marketing_consent"];

const YES = new Set(["yes", "y", "true", "1", "opted_in", "opt_in", "optin", "subscribed", "granted"]);
const NO = new Set(["no", "n", "false", "0", "pending", "unknown", ""]);
const OUT = new Set(["opted_out", "opt_out", "optout", "unsubscribed", "stop", "revoked"]);

export function parseConsent(value: string | undefined): ConsentStatus | null {
  if (value === undefined) return null;
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (YES.has(v)) return "opted_in";
  if (OUT.has(v)) return "opted_out";
  if (NO.has(v)) return "pending";
  return null;
}

const MAX_ATTR_LEN = 500;

export function parseContactsCsv(text: string, opts: { defaultCountry: string; maxRows: number }): CsvParseResult {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normalizeKey(h),
  });
  const headers = (result.meta.fields || []).filter(Boolean);
  const errors: CsvRowError[] = [];
  const pick = (cands: string[]) => cands.find((c) => headers.includes(c));
  const phoneKey = pick(PHONE_HEADERS);
  if (!phoneKey) {
    return {
      rows: [],
      errors: [{ row: 1, message: `No phone column found. Expected one of: ${PHONE_HEADERS.join(", ")}` }],
      duplicates: 0,
      headers,
    };
  }
  if (result.data.length > opts.maxRows) {
    return { rows: [], errors: [{ row: 1, message: `File has more than ${opts.maxRows} rows` }], duplicates: 0, headers };
  }
  const nameKey = pick(NAME_HEADERS);
  const firstKey = pick(FIRST_HEADERS);
  const lastKey = pick(LAST_HEADERS);
  const tagKey = pick(TAG_HEADERS);
  const consentKey = pick(CONSENT_HEADERS);
  const reserved = new Set([phoneKey, nameKey, firstKey, lastKey, tagKey, consentKey].filter(Boolean) as string[]);

  const seen = new Set<string>();
  const rows: ParsedContactRow[] = [];
  let duplicates = 0;

  result.data.forEach((record, i) => {
    const rowNo = i + 2;
    const rawPhone = (record[phoneKey] || "").trim();
    if (!rawPhone) {
      errors.push({ row: rowNo, message: "Missing phone number" });
      return;
    }
    const phone = normalizePhone(rawPhone, opts.defaultCountry);
    if (!phone) {
      errors.push({ row: rowNo, message: `Invalid phone number "${rawPhone.slice(0, 40)}"` });
      return;
    }
    if (seen.has(phone)) {
      duplicates++;
      return;
    }
    seen.add(phone);

    let name = (nameKey ? record[nameKey] : "")?.trim() || "";
    if (!name && (firstKey || lastKey)) {
      name = [firstKey ? record[firstKey] : "", lastKey ? record[lastKey] : ""].map((s) => (s || "").trim()).filter(Boolean).join(" ");
    }
    const tags = tagKey
      ? [...new Set((record[tagKey] || "").split(/[;,|]/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20)
      : [];
    const attributes: Record<string, string> = {};
    for (const h of headers) {
      if (reserved.has(h) && h !== firstKey && h !== lastKey) continue;
      const v = (record[h] || "").trim();
      if (v) attributes[h] = v.slice(0, MAX_ATTR_LEN);
    }
    const consentRaw = consentKey ? record[consentKey] : undefined;
    const consent = consentKey ? parseConsent(consentRaw) : null;
    if (consentKey && consent === null && consentRaw?.trim()) {
      errors.push({ row: rowNo, message: `Unrecognised consent value "${consentRaw.slice(0, 20)}" (treated as pending)` });
    }
    rows.push({ phone, name: name.slice(0, 120), tags, attributes, consent: consentKey ? consent ?? "pending" : null });
  });

  return { rows, errors, duplicates, headers };
}
