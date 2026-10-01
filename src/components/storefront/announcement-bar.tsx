"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { isExternalHref, isSafeHref } from "@/lib/safe-href";
import type { Announcement } from "@/server/services/banners";

const KEY = "announcement-dismissed";
const BAR = "flex min-h-11 flex-1 items-center justify-center py-2 text-center text-sm font-medium";

/** Dismissal lasts for the browser session and only for this exact text, so a new announcement shows again. */
export function AnnouncementBar({ announcement }: { announcement: Announcement }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) === announcement.text) setHidden(true);
    } catch {}
  }, [announcement.text]);
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(KEY, announcement.text);
    } catch {}
  };
  const text = <span className="line-clamp-2">{announcement.text}</span>;
  // Validated on save, re-checked here so a bad stored value can never become a javascript: link.
  const href = announcement.href && isSafeHref(announcement.href) ? announcement.href : null;
  return (
    <div className="bg-brand text-brand-ink" data-testid="announcement-bar">
      <div className="container-x flex items-center gap-2">
        <span className="size-11 shrink-0" aria-hidden="true" />
        {!href ? (
          <p className={BAR}>{text}</p>
        ) : isExternalHref(href) ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={`${BAR} underline-offset-4 hover:underline`}>{text}</a>
        ) : (
          <Link href={href} className={`${BAR} underline-offset-4 hover:underline`}>{text}</Link>
        )}
        <button type="button" onClick={dismiss} aria-label="Dismiss announcement" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-black/10" data-testid="announcement-dismiss">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
