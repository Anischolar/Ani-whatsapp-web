// Placeholder syntax: {{name}}, {{ first_name }}, {{city|there}} (text after "|" is the fallback).
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_ .-]+?)\s*(?:\|([^}]*))?\}\}/g;

export function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function extractPlaceholders(body: string): string[] {
  const keys = new Set<string>();
  for (const m of body.matchAll(PLACEHOLDER)) keys.add(normalizeKey(m[1]));
  return [...keys];
}

export interface RenderContact {
  name?: string | null;
  phone?: string | null;
  attributes?: Record<string, string> | Map<string, string> | null;
}

export function contactVariables(contact: RenderContact): Record<string, string> {
  const vars: Record<string, string> = {};
  const attrs = contact.attributes instanceof Map ? Object.fromEntries(contact.attributes) : contact.attributes || {};
  for (const [k, v] of Object.entries(attrs)) if (v != null) vars[normalizeKey(k)] = String(v);
  const name = (contact.name || "").trim();
  if (name) {
    vars.name = name;
    vars.first_name = name.split(/\s+/)[0];
  }
  if (contact.phone) vars.phone = `+${contact.phone}`;
  return vars;
}

export function renderTemplate(body: string, contact: RenderContact): { text: string; missing: string[] } {
  const vars = contactVariables(contact);
  const missing = new Set<string>();
  const text = body.replace(PLACEHOLDER, (_m, rawKey: string, fallback?: string) => {
    const key = normalizeKey(rawKey);
    const value = vars[key];
    if (value !== undefined && value !== "") return value;
    if (fallback !== undefined) return fallback.trim();
    missing.add(key);
    return "";
  });
  // Collapse spaces left by empty placeholders ("Hi  ," -> "Hi,").
  const cleaned = text.replace(/[ \t]+([,.!?])/g, "$1").replace(/[ \t]{2,}/g, " ");
  return { text: cleaned, missing: [...missing] };
}

export function withFooter(text: string, footer: string, enabled: boolean): string {
  if (!enabled || !footer.trim()) return text;
  return `${text.trimEnd()}\n\n${footer.trim()}`;
}
