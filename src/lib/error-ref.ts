// A short code staff can read out over the phone ("Ref K7Q2"), the same in the log line and on screen.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, so it reads aloud cleanly
const refs = new WeakMap<object, string>();

function make(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** The reference for this error, created on first use; the same error object always gets the same code. */
export function errorRef(err: unknown): string {
  if (!err || typeof err !== "object") return make();
  let ref = refs.get(err);
  if (!ref) {
    ref = make();
    refs.set(err, ref);
  }
  return ref;
}

/** What staff see when something unexpected fails: what to do now, what to do if it repeats, and the code to quote. */
export function unexpectedMessage(ref: string, lead = "Something went wrong."): string {
  return `${lead} Try again. If it happens again, contact support and quote Ref ${ref}.`;
}
