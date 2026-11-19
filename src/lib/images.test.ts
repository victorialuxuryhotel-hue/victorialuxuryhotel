import { describe, expect, it } from "vitest";
import { detectImage } from "./images";

const bytes = (...xs: number[]) => new Uint8Array([...xs, ...new Array(16).fill(0)]);

describe("detectImage", () => {
  it("recognises JPEG, PNG and WebP by signature", () => {
    expect(detectImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.ext).toBe("jpg");
    expect(detectImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.ext).toBe("png");
    expect(detectImage(new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 "), 0, 0]))?.ext).toBe("webp");
  });
  it("rejects anything else, whatever the file is called", () => {
    expect(detectImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(detectImage(new TextEncoder().encode("%PDF-1.7 ......."))).toBeNull();
    expect(detectImage(new TextEncoder().encode("GIF89a.........."))).toBeNull();
  });
});
