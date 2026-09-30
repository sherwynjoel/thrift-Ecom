import { code128Bars } from "@/lib/barcode128";

const QUIET = 10;

export function Barcode({ value, height = 56, moduleWidth = 2, className }: { value: string; height?: number; moduleWidth?: number; className?: string }) {
  const { bars, modules } = code128Bars(value);
  const total = modules + QUIET * 2;
  return (
    <svg role="img" aria-label={`Barcode ${value}`} className={className} width={total * moduleWidth} height={height}
      viewBox={`0 0 ${total} 50`} preserveAspectRatio="none" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width={total} height={50} fill="#fff" />
      {bars.map((b) => <rect key={b.x} x={b.x + QUIET} y={0} width={b.width} height={50} fill="#000" />)}
    </svg>
  );
}
