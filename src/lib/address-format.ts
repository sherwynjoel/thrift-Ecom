export interface AddressLike { line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string }

export function addressLines(a: AddressLike): string[] {
  const landmark = a.landmark ? `Near ${a.landmark.replace(/^near\s+/i, "")}` : null;
  return [a.line1, a.line2, landmark, `${a.city}, ${a.state} ${a.pincode}`].filter((s): s is string => Boolean(s));
}

export function formatPhone(tenDigits: string): string {
  return /^\d{10}$/.test(tenDigits) ? `${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}` : tenDigits;
}

export function addressText(name: string, phone: string, a: AddressLike): string {
  return [name, ...addressLines(a), `Phone: ${formatPhone(phone)}`].join("\n");
}
