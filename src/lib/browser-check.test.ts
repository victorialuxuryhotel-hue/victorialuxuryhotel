import { describe, expect, it } from "vitest";
import { browserProblem } from "./browser-check";

const chrome = (v: number, os = "Windows NT 10.0; Win64; x64") => `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;

describe("browser check", () => {
  it("accepts current Chrome and Edge on Windows 10/11, and Chrome on a Mac or Android", () => {
    expect(browserProblem(chrome(140))).toBeNull();
    expect(browserProblem(`${chrome(140)} Edg/140.0.0.0`)).toBeNull();
    expect(browserProblem(chrome(140, "Macintosh; Intel Mac OS X 10_15_7"))).toBeNull();
    expect(browserProblem(chrome(138, "Linux; Android 14"))).toBeNull();
  });

  it("warns on an old Chrome, Windows 7/8, Firefox or Safari", () => {
    expect(browserProblem(chrome(109))).toMatch(/too old/);
    expect(browserProblem(chrome(140, "Windows NT 6.1; Win64; x64"))).toMatch(/Windows 10 or 11/);
    expect(browserProblem(chrome(140, "Windows NT 6.3; Win64; x64"))).toMatch(/too old/);
    expect(browserProblem("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0")).toMatch(/too old/);
    expect(browserProblem("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")).toMatch(/too old/);
  });
});
