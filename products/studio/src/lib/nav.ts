import { useEffect, useState } from "react";

export function navigate(path: string) {
  const url = new URL(path, window.location.origin);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (here === next) return;
  window.history.pushState({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return path;
}

export type Route =
  | { name: "home" }
  | { name: "films" }
  | { name: "film"; id: string }
  | { name: "voices" }
  | { name: "library" }
  | { name: "missing"; path: string };

export function parseRoute(path: string): Route {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/") return { name: "home" };
  if (clean === "/films") return { name: "films" };
  if (clean === "/voices") return { name: "voices" };
  if (clean === "/library") return { name: "library" };
  const film = /^\/f\/([^/]+)$/.exec(clean);
  if (film?.[1]) return { name: "film", id: decodeURIComponent(film[1]) };
  return { name: "missing", path };
}
