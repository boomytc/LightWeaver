import type { ReactNode } from "react";
import { IconMark } from "../icons";
import { usePath } from "../lib/nav";
import { Link } from "./Link";

const NAV = [
  { href: "/films", label: "片子", match: (path: string) => path === "/films" || path.startsWith("/f/") },
  { href: "/voices", label: "音色", match: (path: string) => path === "/voices" },
  { href: "/library", label: "素材", match: (path: string) => path === "/library" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePath();

  return (
    <div className="site">
      <a className="skip" href="#main">
        跳到主内容
      </a>
      <header className="site-bar">
        <div className="page-width site-bar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <IconMark />
            </span>
            LightWeaver
          </Link>
          <nav className="site-nav" aria-label="站点">
            {NAV.map((item) => {
              const active = item.match(path);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  ariaCurrent={active ? "page" : undefined}
                  className={active ? "nav-link is-active" : "nav-link"}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <div className="site-body" id="main">
        {children}
      </div>
    </div>
  );
}
