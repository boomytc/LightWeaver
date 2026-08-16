import { Link } from "./components/Link";
import { Shell } from "./components/Shell";
import { parseRoute, usePath } from "./lib/nav";
import { Film } from "./pages/Film";
import { Films } from "./pages/Films";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { Methods } from "./pages/Methods";
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
      {route.name === "methods" ? <Methods /> : null}
      {route.name === "missing" ? (
        <div className="page-width page">
          <p className="eyebrow">404</p>
          <h1 className="page-title">没有这个页面</h1>
          <p className="lede">
            找不到 {route.path}。回 <Link href="/">工作台</Link>，或去 <Link href="/films">片子</Link>。
          </p>
        </div>
      ) : null}
    </Shell>
  );
}
