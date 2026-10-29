import { describe, expect, it } from "vitest";
import { extractPlaceholders, renderTemplate, withFooter } from "@/lib/template";

describe("renderTemplate", () => {
  const contact = { name: "Jane Doe", phone: "14155550123", attributes: { City: "Paris", coupon_code: "SAVE10" } };

  it("fills built-in and custom placeholders", () => {
    const { text, missing } = renderTemplate("Hi {{first_name}} ({{name}}) from {{ city }}! Code: {{Coupon Code}} {{phone}}", contact);
    expect(text).toBe("Hi Jane (Jane Doe) from Paris! Code: SAVE10 +14155550123");
    expect(missing).toEqual([]);
  });

  it("uses fallbacks and reports missing keys", () => {
    const r = renderTemplate("Hi {{name|there}}, {{unknown}}!", { phone: "1" });
    expect(r.text).toBe("Hi there,!");
    expect(r.missing).toEqual(["unknown"]);
  });

  it("works with Map attributes (mongoose documents)", () => {
    const r = renderTemplate("{{city}}", { attributes: new Map([["city", "Lagos"]]) });
    expect(r.text).toBe("Lagos");
  });

  it("extracts normalised placeholder keys", () => {
    expect(extractPlaceholders("{{Name}} {{ first name }} {{city|x}} {{name}}")).toEqual(["name", "first_name", "city"]);
  });

  it("appends the opt-out footer only when enabled", () => {
    expect(withFooter("Hello  ", "Reply STOP to unsubscribe.", true)).toBe("Hello\n\nReply STOP to unsubscribe.");
    expect(withFooter("Hello", "Reply STOP", false)).toBe("Hello");
  });
});
