import { describe, expect, it } from "vitest";
import { buildXlsx, crc32, zipStore } from "./xlsx";

/** Reads back a stored (uncompressed) zip, checking each file's CRC. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Record<string, string> = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const data = bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    expect(crc32(data), `crc of ${name}`).toBe(crc);
    out[name] = new TextDecoder().decode(data);
    at += 30 + nameLen + size;
  }
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  expect(view.getUint16(bytes.length - 12, true)).toBe(Object.keys(out).length);
  return out;
}

describe("xlsx", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes a valid stored zip", () => {
    const files = unzip(zipStore([{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "b/c.txt", data: new Uint8Array() }]));
    expect(files).toEqual({ "a.txt": "hello", "b/c.txt": "" });
  });

  it("contains a workbook with a bold, frozen header, numbers as numbers and text as text", () => {
    const files = unzip(buildXlsx("Income", ["Date", "Amount (NGN)"], [["2026-11-24", 80000.5], ["Café & <bar>", -1200], [null, 0]]));
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    const sheet = files["xl/worksheets/sheet1.xml"]!;
    expect(files["xl/workbook.xml"]).toContain('<sheet name="Income"');
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Date</t></is></c>');
    expect(sheet).toContain('<c r="B2"><v>80000.5</v></c>');
    expect(sheet).toContain('<c r="B3"><v>-1200</v></c>');
    expect(sheet).toContain('<c r="B4"><v>0</v></c>');
    expect(sheet).toContain("Café &amp; &lt;bar&gt;");
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:B4"/>');
    expect(sheet).not.toContain('<c r="A4"');
  });

  it("never turns text into a formula", () => {
    const sheet = unzip(buildXlsx("x", ["Note"], [["=HYPERLINK(\"http://evil\")"], ["+1"], ["@SUM(A1)"]]))["xl/worksheets/sheet1.xml"]!;
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://evil&quot;)</t>');
  });

  it("keeps sheet names within Excel's rules and drops characters XML can't hold", () => {
    const files = unzip(buildXlsx("Sales / by: item? [restaurant & bar] long name", ["A"], [["bad\u0001char"]]));
    const name = files["xl/workbook.xml"]!.match(/<sheet name="([^"]*)"/)![1]!.replaceAll("&amp;", "&");
    expect(name).toBe("Sales   by  item   restaurant &");
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[\\/?*[\]:]/);
    expect(files["xl/worksheets/sheet1.xml"]).toContain(">badchar<");
  });

  it("names columns past Z correctly", () => {
    const header = Array.from({ length: 28 }, (_, i) => `H${i}`);
    const sheet = unzip(buildXlsx("wide", header, []))["xl/worksheets/sheet1.xml"]!;
    expect(sheet).toContain('r="Z1"');
    expect(sheet).toContain('r="AA1"');
    expect(sheet).toContain('r="AB1"');
  });
});
