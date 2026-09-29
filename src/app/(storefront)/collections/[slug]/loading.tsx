import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container-x py-10">
      <Skeleton className="mb-8 h-14 w-64" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}
      </div>
    </div>
  );
}
