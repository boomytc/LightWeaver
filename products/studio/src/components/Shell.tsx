import type { ReactNode } from "react";
import { IconGitHub, IconMark, IconMoon, IconSun } from "../icons";
import { usePath } from "../lib/nav";
import { GITHUB_URL, usePrefs } from "../lib/prefs";
import { Link } from "./Link";

const NAV = [
  { href: "/films", label: "片子", match: (path: string) => path === "/films" || path.startsWith("/f/") },
  { href: "/voices", label: "音色", match: (path: string) => path === "/voices" },
  { href: "/library", label: "素材", match: (path: string) => path === "/library" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePath();
  const { theme, toggleTheme } = usePrefs();

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
          <div className="site-tools">
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
              title={theme === "dark" ? "浅色" : "深色"}
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
              <span className="icon-btn-text">{theme === "dark" ? "浅色" : "深色"}</span>
            </button>
            <a
              className="icon-btn"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="在 GitHub 打开 LightWeaver"
              title="GitHub"
            >
              <IconGitHub />
            </a>
          </div>
        </div>
      </header>
      <div className="site-body" id="main">
        {children}
      </div>
      <footer className="site-foot">
        <div className="page-width site-foot-inner">
          <p>本机控制站 · 127.0.0.1 · 人点名组合，复制说明给 agent。</p>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
