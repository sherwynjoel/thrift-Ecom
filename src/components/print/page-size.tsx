export function PageSize({ size, margin }: { size: string; margin: string }) {
  return <style>{`@page { size: ${size}; margin: ${margin}; }`}</style>;
}
