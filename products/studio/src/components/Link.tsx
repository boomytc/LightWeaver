import type { ReactNode } from "react";
import { navigate } from "../lib/nav";

export function Link({
  href,
  className,
  children,
  ariaCurrent,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  ariaCurrent?: "page" | undefined;
}) {
  return (
    <a
      href={href}
      className={className}
      aria-current={ariaCurrent}
      onClick={(event) => {
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
