import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Normalises a user supplied phone number to E.164 digits without "+"
 * (the format WhatsApp uses for user ids). Returns null when invalid.
 */
export function normalizePhone(input: string, defaultCountry = "US"): string | null {
  // Spreadsheet exports often drop the "+" or prefix international numbers with "00".
  const cleaned = String(input ?? "")
    .trim()
    .replace(/^00/, "+")
    .replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  const local = parsePhoneNumberFromString(cleaned, defaultCountry as CountryCode);
  if (local?.isValid()) return local.number.slice(1);

  // A number without "+" may already be in international form, e.g. "447700900123".
  if (!cleaned.startsWith("+")) {
    const intl = parsePhoneNumberFromString(`+${cleaned}`);
    if (intl?.isValid()) return intl.number.slice(1);
  }
  return null;
}

export function formatPhone(digits: string): string {
  const parsed = parsePhoneNumberFromString(`+${digits}`);
  return parsed ? parsed.formatInternational() : `+${digits}`;
}
