import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="py-20">
      <h1 className="text-4xl">Not found</h1>
      <p className="mt-2 text-text-muted">That record does not exist or was deleted.</p>
      <Link href="/admin" className="mt-4 inline-block text-sm underline-offset-4 hover:underline">Back to dashboard</Link>
    </div>
  );
}
