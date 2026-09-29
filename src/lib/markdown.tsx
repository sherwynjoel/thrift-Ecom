import ReactMarkdown from "react-markdown";

export function Markdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      components={{
        h2: ({ children }) => <h2 className="mt-6 text-2xl">{children}</h2>,
        h3: ({ children }) => <h3 className="mt-4 text-xl">{children}</h3>,
        p: ({ children }) => <p className="my-3 leading-relaxed text-text-muted">{children}</p>,
        ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 text-text-muted">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5 text-text-muted">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
        a: ({ href, children }) => <a href={href} className="text-brand underline-offset-4 hover:underline">{children}</a>,
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
