"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudioProps } from "./studio";

// The studio (and Fabric, loaded inside it) never renders on the server.
const Studio = dynamic(() => import("./studio").then((m) => m.Studio), {
  ssr: false,
  loading: () => <StudioSkeleton />,
});

export function StudioSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_380px] md:gap-8" aria-busy="true" aria-label="Loading the design studio">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-[52px] w-[200px] rounded-full" />
        </div>
        <Skeleton className="-mx-4 aspect-[4/5] rounded-none sm:mx-auto sm:w-full sm:max-w-[640px] sm:rounded-md md:max-w-[min(640px,calc((100dvh-16rem)*0.8))]" />
      </div>
      <Skeleton className="hidden h-[480px] md:block" />
    </div>
  );
}

export function StudioLoader(props: StudioProps) {
  // A new ?design= on the same route must start a fresh editor (the canvas reads its initial design once).
  return <Studio key={props.initialDesign?.designId ?? "new"} {...props} />;
}
