import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container-x grid gap-10 py-10 lg:grid-cols-2">
      <Skeleton className="aspect-[4/5]" />
      <div className="space-y-4"><Skeleton className="h-12 w-3/4" /><Skeleton className="h-8 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-12 w-full" /></div>
    </div>
  );
}
