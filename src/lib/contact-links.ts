export function telLink(phone10: string): string {
  return `tel:+91${phone10}`;
}

export function whatsappLink(phone10: string, text: string): string {
  return `https://wa.me/91${phone10}?text=${encodeURIComponent(text)}`;
}

export function orderWhatsappText({ number, name, brand }: { number: string; name: string; brand: string }): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  return `Hi ${first}, this is ${brand} about your order ${number}.`;
}
