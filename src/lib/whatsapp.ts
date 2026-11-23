export function whatsappNumber(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim().replace(/\(0\)/g, ""); // "+44 (0) 7700…": the (0) is dropped when dialling internationally
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) digits = `234${digits.slice(1)}`;
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

export function whatsappLink(phone: string | undefined | null, text: string): string | null {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}
