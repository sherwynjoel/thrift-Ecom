import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/lib/markdown";
import { readPage } from "@/server/content";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await readPage(slug);
  return { title: page?.title ?? "Not found" };
}

export default async function StaticPage({ params }: Props) {
  const { slug } = await params;
  const page = await readPage(slug);
  if (!page) notFound();
  return (
    <article className="container-x max-w-3xl py-10" data-testid="static-page">
      <h1 className="mb-6 text-5xl md:text-7xl">{page.title}</h1>
      <Markdown source={page.body} />
    </article>
  );
}
