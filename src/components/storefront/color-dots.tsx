export function ColorDots({ colors }: { colors: { name: string; hex: string }[] }) {
  if (!colors.length) return null;
  return (
    <ul className="flex items-center gap-1.5" aria-label="Available colors">
      {colors.slice(0, 5).map((c) => (
        <li key={c.name} title={c.name} className="size-3 rounded-full border border-border" style={{ backgroundColor: c.hex }} />
      ))}
      {colors.length > 5 && <li className="text-xs text-text-muted">+{colors.length - 5}</li>}
    </ul>
  );
}
