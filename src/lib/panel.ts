// The booking side panel (interface brief I7) lives in the page's URL: ?booking=VL-…, alongside the
// page's own params, so back and refresh work and closing returns to the same page state.

type Params = Record<string, string | string[] | undefined>;

function build(path: string, params: Params, booking?: string) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (k !== "booking" && typeof v === "string" && v) q.set(k, v);
  if (booking) q.set("booking", booking);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export const withBooking = (path: string, params: Params, reference: string) => build(path, params, reference);
export const withoutBooking = (path: string, params: Params) => build(path, params);
/** Links that only open or close the panel keep the page where it is. */
export const opensPanel = (href: string) => /[?&]booking=/.test(href);
