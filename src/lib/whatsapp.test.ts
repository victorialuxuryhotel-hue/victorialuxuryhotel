import { describe, expect, it } from "vitest";
import { whatsappLink, whatsappNumber } from "./whatsapp";

describe("whatsappNumber", () => {
  it("converts Nigerian local numbers to international", () => {
    expect(whatsappNumber("0803 123 4567")).toBe("2348031234567");
    expect(whatsappNumber("08031234567")).toBe("2348031234567");
  });
  it("keeps international numbers in any common format", () => {
    expect(whatsappNumber("+234 803 123 4567")).toBe("2348031234567");
    expect(whatsappNumber("2348031234567")).toBe("2348031234567");
    expect(whatsappNumber("00447700900123")).toBe("447700900123");
    expect(whatsappNumber("+44 (0) 7700 900123")).toBe("447700900123");
  });
  it("refuses numbers WhatsApp wouldn't accept", () => {
    expect(whatsappNumber(undefined)).toBeNull();
    expect(whatsappNumber("")).toBeNull();
    expect(whatsappNumber("12345")).toBeNull();
    expect(whatsappNumber("0803123456")).toBeNull(); // local but one digit short
  });
});

describe("whatsappLink", () => {
  it("pre-fills the message", () => {
    expect(whatsappLink("08031234567", "Receipt RCT-2026-000001: https://x.test/a?b=1")).toBe(
      "https://wa.me/2348031234567?text=Receipt%20RCT-2026-000001%3A%20https%3A%2F%2Fx.test%2Fa%3Fb%3D1",
    );
    expect(whatsappLink(null, "hi")).toBeNull();
  });
});
