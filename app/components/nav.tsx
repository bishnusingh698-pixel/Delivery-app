/**
 * Icon navigation on top of every admin page: the app's 8 sections, one click away.
 * Scrolls sideways on narrow screens (Shopify mobile admin); the current section is marked.
 */
import { Link, useLocation } from "react-router";
import { useT } from "../i18n/react";

export const SECTIONS = [
  { key: "home", href: "/app", icon: "home", match: (p: string) => p === "/app" || p === "/app/" },
  { key: "orders", href: "/app/orders", icon: "order", match: (p: string) => p.startsWith("/app/orders") || p.startsWith("/app/production") },
  { key: "delivery", href: "/app/delivery", icon: "delivery", match: (p: string) => p.startsWith("/app/delivery") },
  { key: "pickup", href: "/app/pickup", icon: "store", match: (p: string) => p.startsWith("/app/pickup") },
  { key: "daysOff", href: "/app/days-off", icon: "calendar-check", match: (p: string) => p.startsWith("/app/days-off") },
  { key: "appearance", href: "/app/appearance", icon: "paint-brush-flat", match: (p: string) => p.startsWith("/app/appearance") },
  {
    key: "settings",
    href: "/app/settings",
    icon: "settings",
    match: (p: string) => p.startsWith("/app/settings") || p.startsWith("/app/notifications") || p.startsWith("/app/plans"),
  },
  { key: "help", href: "/app/help", icon: "question-circle", match: (p: string) => p.startsWith("/app/help") },
] as const;

export function NavBar() {
  const t = useT();
  const { pathname, search } = useLocation();
  // Keep Shopify's embedded-app query (host, shop, locale) on every link.
  const keep = new URLSearchParams(search);
  for (const k of [...keep.keys()]) if (!["host", "shop", "embedded", "locale"].includes(k)) keep.delete(k);
  const q = keep.toString() ? `?${keep}` : "";
  return (
    <nav className="pd-topnav" aria-label={t("nav.label")}>
      <style>{CSS}</style>
      <ul>
        {SECTIONS.map((s) => {
          const active = s.match(pathname);
          return (
            <li key={s.key}>
              <Link to={`${s.href}${q}`} aria-current={active ? "page" : undefined} className={active ? "is-active" : undefined}>
                <s-icon type={s.icon} />
                <span>{t(`nav.${s.key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const CSS = `
.pd-topnav{margin:0 0 12px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
.pd-topnav ul{display:flex;gap:4px;list-style:none;margin:0;padding:4px;background:#fff;border-radius:12px;box-shadow:0 1px 0 rgba(26,26,26,.07),inset 0 0 0 1px rgba(227,227,227,1);min-width:max-content}
.pd-topnav a{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:72px;padding:8px 10px;border-radius:8px;color:#303030;text-decoration:none;font-size:12px;font-weight:550;line-height:1.2;white-space:nowrap}
.pd-topnav a:hover{background:#f1f1f1}
.pd-topnav a:focus-visible{outline:2px solid #005bd3;outline-offset:1px}
.pd-topnav a.is-active{background:#ebebeb;color:#000}
.pd-topnav a.is-active span{font-weight:650}
@media (max-width:490px){.pd-topnav a{min-width:64px;padding:6px 8px;font-size:11px}}
`;
