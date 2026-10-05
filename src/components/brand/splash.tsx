import { LOGO_BOX_PATH, LOGO_LETTER_PATHS, LOGO_VIEWBOX } from "@/lib/logo";

/**
 * First-visit loading screen: the tbox logo builds itself (t, b, x rise; the lime box stamps in) while the page loads,
 * then the screen wipes upward (skipped for automated browsers, i.e. navigator.webdriver). Pure HTML/CSS + one tiny inline script so it shows from the very first bytes, before any
 * JavaScript bundle arrives. Shown once per browser session, never on /admin, /api or print pages, and at most ~2.5 s.
 * Visibility is driven by `data-splash` on <html> (see globals.css), so nothing the script does disturbs hydration.
 */
const SCRIPT = `(function(){var d=document.documentElement,p=location.pathname,skip=navigator.webdriver||/^\\/(admin|api)(\\/|$)/.test(p)||p.indexOf("/print")>-1||/^\\/invoice\\//.test(p);try{if(sessionStorage.getItem("tbox-splash"))skip=true;else if(!skip)sessionStorage.setItem("tbox-splash","1")}catch(e){}if(skip){d.setAttribute("data-splash","off");return}d.setAttribute("data-splash","on");var t0=Date.now(),done=false;function end(){if(done)return;done=true;setTimeout(function(){d.setAttribute("data-splash","leaving");setTimeout(function(){d.setAttribute("data-splash","off")},700)},Math.max(0,1150-(Date.now()-t0)))}if(document.readyState==="complete")end();else window.addEventListener("load",end);setTimeout(end,2500)})();`;

export function Splash() {
  return (
    <>
      <div className="splash" aria-hidden="true">
        <div className="splash-inner">
          <svg viewBox={LOGO_VIEWBOX} className="splash-logo">
            <path className="splash-letter" style={{ animationDelay: "60ms" }} d={LOGO_LETTER_PATHS.t} fill="currentColor" />
            <path className="splash-letter" style={{ animationDelay: "140ms" }} d={LOGO_LETTER_PATHS.b} fill="currentColor" />
            <path className="splash-box" d={LOGO_BOX_PATH} fill="var(--accent)" fillRule="evenodd" />
            <path className="splash-letter" style={{ animationDelay: "300ms" }} d={LOGO_LETTER_PATHS.x} fill="currentColor" />
          </svg>
          <span className="splash-bar" />
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}
