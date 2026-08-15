import { Shell } from "./components/Shell";
import { parseRoute, usePath } from "./lib/nav";
import { Film } from "./pages/Film";
import { Films } from "./pages/Films";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { Voices } from "./pages/Voices";

export function App() {
  const route = parseRoute(usePath());

  return (
    <Shell>
      {route.name === "home" ? <Home /> : null}
      {route.name === "films" ? <Films /> : null}
      {route.name === "film" ? <Film id={route.id} /> : null}
      {route.name === "voices" ? <Voices /> : null}
      {route.name === "library" ? <Library /> : null}
      {route.name === "missing" ? (
        <div className="page-width page">
          <p className="item-meta">没有这个页面：{route.path}</p>
        </div>
      ) : null}
    </Shell>
  );
}
