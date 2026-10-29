import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("normalises international numbers", () => {
    expect(normalizePhone("+1 (415) 555-2671")).toBe("14155552671");
    expect(normalizePhone("0044 7911 123456")).toBe("447911123456");
    expect(normalizePhone("447911123456")).toBe("447911123456");
  });
  it("uses the default country for national numbers", () => {
    expect(normalizePhone("07911 123456", "GB")).toBe("447911123456");
    expect(normalizePhone("0300 1234567", "PK")).toBe("923001234567");
  });
  it("rejects garbage", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("hello")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
});
