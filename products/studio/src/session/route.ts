export type Route = {
  page: string;
  projectId: string;
  section: string;
};

const pages = new Set(["projects", "methods", "voices", "library", "jobs", "settings"]);

export function currentRoute(): Route {
  const url = new URL(location.href);
  const path = url.pathname.split("/").filter(Boolean);
  let page = path[0] || "projects";
  if (page === "films") page = "projects";
  if (page === "models") page = "settings";
  if (!pages.has(page)) page = "projects";
  return {
    page,
    projectId: page === "projects" ? path[1] || "" : "",
    section: url.searchParams.get("section") || (page === "settings" ? "models" : ""),
  };
}

export function routeUrl(route: Route) {
  const path = `/${route.page}${route.projectId ? `/${route.projectId}` : ""}`;
  return route.section ? `${path}?section=${encodeURIComponent(route.section)}` : path;
}
