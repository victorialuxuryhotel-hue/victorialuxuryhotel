import { describe, expect, it } from "vitest";
import { avatarTone, AVATAR_TONES, initials } from "./initials";

describe("guest initials (I11)", () => {
  it("first and last name; one name; extra spaces and accents", () => {
    expect(initials("Grace Adeyemi")).toBe("GA");
    expect(initials("  funmi   ade   bayo ")).toBe("FB");
    expect(initials("Madonna")).toBe("M");
    expect(initials("Ọlá Àdìsá")).toBe("ỌÀ");
    expect(initials("Dr. (Mrs) Bisi Ojo")).toBe("DO");
    expect(initials("   ")).toBe("?");
  });
  it("the same name always gets the same neutral tone", () => {
    expect(avatarTone("Grace Adeyemi")).toBe(avatarTone(" grace adeyemi "));
    expect(AVATAR_TONES).toContain(avatarTone("Emeka Obi"));
  });
});
