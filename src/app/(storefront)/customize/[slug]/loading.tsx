import { StudioSkeleton } from "@/components/studio/studio-loader";

export default function Loading() {
  return (
    <div className="container-x py-4 pb-40 md:py-8 md:pb-10">
      <StudioSkeleton />
    </div>
  );
}
