"use client";

import { useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type ReactNode } from "react";

export type FooterLink = { label: string; href: string };
export type FooterColumn = { title: string; links: FooterLink[] };
export type FooterSocial = { label: string; href: string; icon: ReactNode };

export type DitheredFooterProps = {
    brand?: string;
    /** Optional visual mark (e.g. an SVG logo) shown at the top instead of the plain brand text. */
    brandMark?: ReactNode;
    /** Where the wordmark links to. */
    brandHref?: string;
    tagline?: string;
    columns?: FooterColumn[];
    socials?: FooterSocial[];
    legal?: FooterLink[];
    copyright?: string;
    /** Link to your real status page, shown with a green dot. Off unless you pass one. */
    status?: FooterLink | null;
    /** Extra content in the bottom bar, after the legal links (e.g. a credit). */
    extra?: ReactNode;
    /** Colour of the dot field. It is the footer's only colour, so it carries the brand. */
    accent?: string;
    /** Label above the email field. */
    subscribeLabel?: string;
    /** Called with the email address. Resolve to show the success message. */
    onSubscribe?: (email: string) => void | Promise<void>;
    className?: string;
    testId?: string;
};

// Stochastic dither: vertical noise, sparse at the top and dense at the bottom,
// thresholded to on/off in one inline SVG filter. Used as a mask, so the dots
// take whatever accent colour you pass.
const DITHER =
    "url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27360%27%20height%3D%27240%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27g%27%20x1%3D%270%27%20y1%3D%270%27%20x2%3D%270%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270.04%27%20stop-color%3D%27%23000%27%2F%3E%3Cstop%20offset%3D%270.96%27%20stop-color%3D%27%23fff%27%2F%3E%3C%2FlinearGradient%3E%3Cfilter%20id%3D%27f%27%20x%3D%270%27%20y%3D%270%27%20width%3D%27100%25%27%20height%3D%27100%25%27%20color-interpolation-filters%3D%27sRGB%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%270.45%27%20numOctaves%3D%272%27%20seed%3D%277%27%20stitchTiles%3D%27stitch%27%20result%3D%27n%27%2F%3E%3CfeColorMatrix%20in%3D%27n%27%20type%3D%27matrix%27%20values%3D%271%200%200%200%200%201%200%200%200%200%201%200%200%200%200%200%200%200%200%201%27%20result%3D%27ng%27%2F%3E%3CfeComposite%20in%3D%27SourceGraphic%27%20in2%3D%27ng%27%20operator%3D%27arithmetic%27%20k2%3D%270.5%27%20k3%3D%270.5%27%20result%3D%27s%27%2F%3E%3CfeComponentTransfer%20in%3D%27s%27%20result%3D%27t%27%3E%3CfeFuncR%20type%3D%27discrete%27%20tableValues%3D%270%201%27%2F%3E%3C%2FfeComponentTransfer%3E%3CfeColorMatrix%20in%3D%27t%27%20type%3D%27matrix%27%20values%3D%270%200%200%200%201%200%200%200%200%200.5%200%200%200%200%200%201%200%200%200%200%27%2F%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%3Crect%20width%3D%27100%25%27%20height%3D%27100%25%27%20fill%3D%27url%28%23g%29%27%20filter%3D%27url%28%23f%29%27%2F%3E%3C%2Fsvg%3E')";

const GRID = "radial-gradient(circle, #000 0.9px, transparent 1.3px)";

// Scoped by the df- prefix. Masks and motion live here rather than in utility
// classes, so the component renders the same on Tailwind v3 and v4.
const STYLES = `
.df-field { position: absolute; inset: 0; }
.df-field.df-lit {
  -webkit-mask-image: radial-gradient(circle 190px at var(--df-x, 50%) var(--df-y, 50%), #000 35%, rgb(0 0 0 / .22) 100%);
  mask-image: radial-gradient(circle 190px at var(--df-x, 50%) var(--df-y, 50%), #000 35%, rgb(0 0 0 / .22) 100%);
}
.df-dots {
  position: absolute; top: 0; bottom: 0; left: 0;
  width: calc(100% + 360px);
  background: var(--df-accent);
  -webkit-mask-image: ${GRID}, ${DITHER};
  mask-image: ${GRID}, ${DITHER};
  -webkit-mask-size: 4px 4px, 360px 240px;
  mask-size: 4px 4px, 360px 240px;
  -webkit-mask-repeat: repeat, repeat-x;
  mask-repeat: repeat, repeat-x;
  -webkit-mask-position: 0 0, left bottom;
  mask-position: 0 0, left bottom;
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}
@media (prefers-reduced-motion: no-preference) {
  .df-dots { animation: df-drift 40s linear infinite; }
  @supports (animation-timeline: view()) {
    .df-band { view-timeline: --df-band; }
    .df-mark { animation: df-rise linear both; animation-timeline: --df-band; animation-range: entry 20% entry 100%; }
  }
}
@keyframes df-drift { to { translate: -360px 0; } }
@keyframes df-rise { from { translate: 0 30%; } }
`;

const toLinks = (labels: string[]): FooterLink[] =>
    labels.map((label) => ({ label, href: "/" + label.toLowerCase().replace(/\s+/g, "-") }));

const icon = (d: string) => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
);

const DEFAULT_SOCIALS: FooterSocial[] = [
    { label: "X", href: "https://x.com", icon: icon("M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z") },
    { label: "GitHub", href: "https://github.com", icon: icon("M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5") },
    { label: "LinkedIn", href: "https://linkedin.com", icon: icon("M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z") },
];

const DEFAULT_COLUMNS: FooterColumn[] = [
    { title: "Product", links: toLinks(["Features", "Pricing", "Changelog", "Roadmap"]) },
    { title: "Resources", links: toLinks(["Docs", "Guides", "Community", "Blog"]) },
    { title: "Company", links: toLinks(["About", "Careers", "Contact", "Press"]) },
];

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--df-accent)]";
const coarse = "[@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center";

export default function DitheredFooter({
    brand = "Acme",
    brandMark,
    brandHref = "/",
    tagline = "Tools for teams who ship. Built in the open, one release at a time.",
    columns = DEFAULT_COLUMNS,
    socials = DEFAULT_SOCIALS,
    legal = toLinks(["Privacy", "Terms"]),
    copyright = `© ${new Date().getFullYear()} Acme, Inc.`,
    status = null,
    extra,
    accent = "#ff6a00",
    subscribeLabel = "Get product updates by email",
    onSubscribe,
    className = "",
    testId,
}: DitheredFooterProps) {
    const [email, setEmail] = useState("");
    const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
    const field = useRef<HTMLDivElement>(null);
    const frame = useRef(0);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setState("sending");
        try {
            await onSubscribe?.(email);
            setState("done");
            setEmail("");
        } catch {
            setState("error");
        }
    };

    // Spotlight: dots under a mouse pointer stay at full strength and the rest dim.
    // Touch and pen get the plain field; there is no hover to follow.
    const onMove = (e: PointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== "mouse" || !field.current) return;
        const el = field.current;
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            el.style.setProperty("--df-x", `${x}px`);
            el.style.setProperty("--df-y", `${y}px`);
            el.classList.add("df-lit");
        });
    };
    const onLeave = () => {
        cancelAnimationFrame(frame.current);
        field.current?.classList.remove("df-lit");
    };

    const toTop = () =>
        window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

    return (
        <footer
            className={`overflow-hidden border-t border-border bg-background text-foreground ${className}`}
            style={{ "--df-accent": accent } as CSSProperties}
            data-testid={testId}
        >
            <style>{STYLES}</style>

            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-12 px-6 pb-16 pt-16 sm:gap-x-10 sm:px-8 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
                <div className="col-span-2 md:col-span-1">
                    <a href={brandHref} aria-label={`${brand} home`} className={`inline-flex rounded-sm text-base font-semibold tracking-tight ${focus}`}>{brandMark ?? brand}</a>
                    <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">{tagline}</p>

                    <form className="mt-8 max-w-sm" onSubmit={submit}>
                        {/* A visible label, not a placeholder: placeholders vanish while you type. */}
                        <label htmlFor="df-email" className="block text-sm font-medium">{subscribeLabel}</label>
                        <div className="mt-2 flex gap-2">
                            <input
                                id="df-email"
                                type="email"
                                required
                                autoComplete="email"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); setState("idle"); }}
                                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm transition-colors focus:border-[var(--df-accent)] focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-[var(--df-accent)] [@media(pointer:coarse)]:h-11"
                            />
                            <button
                                disabled={state === "sending"}
                                className={`h-10 shrink-0 rounded-md bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 active:scale-[0.97] disabled:opacity-60 ${focus} [@media(pointer:coarse)]:h-11`}
                            >
                                {state === "sending" ? "Subscribing…" : "Subscribe"}
                            </button>
                        </div>
                        <p role="status" className="mt-2 min-h-5 text-sm text-muted-foreground">
                            {state === "done" && "Thanks. You're on the list."}
                            {state === "error" && "That didn't go through. Please try again."}
                        </p>
                    </form>
                </div>

                {columns.map((col) => (
                    <nav key={col.title} aria-label={col.title}>
                        <p className="text-sm font-medium text-foreground">{col.title}</p>
                        <ul className="mt-4 space-y-3 [@media(pointer:coarse)]:space-y-0">
                            {col.links.map((l) => (
                                <li key={l.label}>
                                    <a href={l.href} className={`rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground ${focus} ${coarse}`}>{l.label}</a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                ))}
            </div>

            {/* The name is not drawn: it is the gap in the dots. It is solid where the
                field is dense and dissolves as the dots thin out towards the top. */}
            <div aria-hidden="true" className="df-band relative h-60 overflow-hidden" onPointerMove={onMove} onPointerLeave={onLeave}>
                <div ref={field} className="df-field">
                    {/* One tile wider than the band, slid left by exactly one tile, so the loop is seamless. */}
                    <div className="df-dots" />
                </div>
                <p className="df-mark pointer-events-none absolute -bottom-[0.05em] left-3 select-none text-[clamp(5rem,21vw,13rem)] font-bold leading-[0.8] tracking-[-0.06em] text-background sm:left-5">
                    {brand}
                </p>
            </div>

            <div className="border-t border-border">
                <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <p>{copyright}</p>
                        {legal.map((l) => (
                            <a key={l.label} href={l.href} className={`rounded-sm transition-colors hover:text-foreground ${focus} ${coarse}`}>{l.label}</a>
                        ))}
                        {status && (
                            <a href={status.href} className={`inline-flex items-center gap-2 rounded-sm transition-colors hover:text-foreground ${focus} ${coarse}`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                {status.label}
                            </a>
                        )}
                        {extra}
                    </div>
                    <div className="-mr-2 flex items-center gap-1">
                        {socials.map((s) => (
                            <a
                                key={s.label}
                                href={s.href}
                                aria-label={s.label}
                                target="_blank"
                                rel="noreferrer"
                                className={`grid h-9 w-9 place-items-center rounded-md transition-colors hover:bg-foreground/5 hover:text-foreground ${focus} [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11`}
                            >
                                {s.icon}
                            </a>
                        ))}
                        {socials.length > 0 && <span className="mx-2 h-4 w-px bg-border" aria-hidden="true" />}
                        <button type="button" onClick={toTop} className={`inline-flex items-center gap-1.5 rounded-sm px-1 transition-colors hover:text-foreground ${focus} ${coarse}`}>
                            Back to top
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    );
}

export { DitheredFooter };
