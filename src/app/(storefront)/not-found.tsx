import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-x flex min-h-[60dvh] flex-col items-start justify-center gap-4" data-testid="not-found">
      <p className="font-display text-[20vw] leading-none text-surface-raised sm:text-[10rem]">404</p>
      <h1 className="text-4xl">That page walked off</h1>
      <p className="text-text-muted">The link is dead or the tee sold out for good.</p>
      <Button render={<Link href="/" />} nativeButton={false}>Back home</Button>
    </div>
  );
}
