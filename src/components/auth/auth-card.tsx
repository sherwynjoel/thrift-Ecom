export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-md border border-border bg-surface p-8" data-testid="auth-card">
      <h1 className="text-4xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
