import { describe, expect, it } from "vitest";
import { fromPhotoStore, isMediaKey } from "./media";

describe("photos from the photo store", () => {
  it("skip the optimiser (it can't read the store on Cloudflare); everything else is optimised", () => {
    expect(fromPhotoStore("/media/rooms/a/b.jpg")).toBe(true);
    expect(fromPhotoStore("/_next/static/media/logo.png")).toBe(false);
    expect(fromPhotoStore({ src: "/x.png" })).toBe(false);
  });
  it("only accepts keys in the app's own format", () => {
    expect(isMediaKey("site/hero/3f0e6a2b-1111-4000-8000-000000000000.jpg")).toBe(true);
    expect(isMediaKey("../secrets.txt")).toBe(false);
  });
});
