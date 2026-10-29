import { describe, expect, it } from "vitest";
import { parseConsent, parseContactsCsv } from "@/lib/csv";

const opts = { defaultCountry: "US", maxRows: 100 };

describe("parseContactsCsv", () => {
  it("parses phones, names, tags, consent and custom columns", () => {
    const csv = "\uFEFFPhone Number,First Name,Last Name,Tags,Consent,City\n" +
      "+1 415 555 2671,Jane,Doe,VIP; newsletter,yes,Paris\n" +
      "+447911123456,John,,,no,\n" +
      "+447911123457,Ann,,,opted_out,\n";
    const r = parseContactsCsv(csv, opts);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ phone: "14155552671", name: "Jane Doe", tags: ["vip", "newsletter"], consent: "opted_in" });
    expect(r.rows[0].attributes.city).toBe("Paris");
    expect(r.rows[0].attributes.first_name).toBe("Jane");
    expect(r.rows[1].consent).toBe("pending");
    expect(r.rows[2].consent).toBe("opted_out");
  });

  it("reports invalid rows and de-duplicates", () => {
    const r = parseContactsCsv("phone,name\nnot-a-number,X\n+14155552671,A\n(415) 555-2671,B\n,C\n", opts);
    expect(r.rows).toHaveLength(1);
    expect(r.duplicates).toBe(1);
    expect(r.errors.map((e) => e.row)).toEqual([2, 5]);
  });

  it("returns consent null when there is no consent column", () => {
    const r = parseContactsCsv("mobile\n+14155552671\n", opts);
    expect(r.rows[0].consent).toBeNull();
  });

  it("requires a phone column and enforces the row limit", () => {
    expect(parseContactsCsv("name\nA\n", opts).errors[0].message).toMatch(/No phone column/);
    const many = "phone\n" + Array.from({ length: 5 }, (_, i) => `+1415555267${i}`).join("\n");
    expect(parseContactsCsv(many, { ...opts, maxRows: 3 }).errors[0].message).toMatch(/more than 3/);
  });

  it("maps consent values", () => {
    expect(parseConsent("Yes")).toBe("opted_in");
    expect(parseConsent("opt-in")).toBe("opted_in");
    expect(parseConsent("unsubscribed")).toBe("opted_out");
    expect(parseConsent("0")).toBe("pending");
    expect(parseConsent("maybe")).toBeNull();
  });
});
