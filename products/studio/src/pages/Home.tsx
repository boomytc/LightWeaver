import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { BriefPanel } from "../components/BriefPanel";
import { Link } from "../components/Link";
import type { OutputHome } from "../lib/brief";
import { kindLabel } from "../lib/labels";
import { langLabel } from "../lib/langs";
import { methodExpandOf, recipeIdOfMethod } from "../lib/method-brief";
import { listVoicePacks } from "../lib/voices";
import type { Asset } from "../types";

export function Home() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const { flash, error } = useFlash();
  const [recipeId, setRecipeId] = useState("");
  const [voiceRef, setVoiceRef] = useState("");
  const [langs, setLangs] = useState<string[]>(["zh", "en"]);
  const [kit, setKit] = useState<string[]>([]);
  const [outputHome, setOutputHome] = useState<OutputHome | "">("");

  useEffect(() => {
    api
      .library()
      .then((nextLibrary) => {
        setLibrary(nextLibrary);
        const wanted = new URLSearchParams(window.location.search).get("recipe") ?? "";
        if (wanted) setRecipeId(wanted);
      })
      .catch((err: Error) => error(err.message));
  }, []);

  const voicePacks = listVoicePacks(library);
  const materials = library.filter((asset) => asset.kind === "element" || asset.kind === "reference");
  const methods = library.filter((asset) => asset.kind === "method");
  const selectedMethod = methods.find((asset) => recipeIdOfMethod(asset) === recipeId);
  const selectedVoice = voicePacks.find((asset) => `library:${asset.id}` === voiceRef);

  const voiceLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const asset of voicePacks) {
      map[`library:${asset.id}`] = asset.label ?? asset.id;
    }
    return map;
  }, [voicePacks]);

  const kitLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const asset of materials) {
      map[`library:${asset.id}`] = asset.label ?? asset.id;
    }
    return map;
  }, [materials]);

  function addMaterial(ref: string) {
    if (!ref || kit.includes(ref)) return;
    setKit((current) => [...current, ref]);
  }

  function dropMaterial(ref: string) {
    setKit((current) => current.filter((item) => item !== ref));
  }

  return (
    <div className="page-width page">
      <h1 className="sr">组合</h1>
      <p className="lede">
        方法、音色、素材都是可选增强，点上的才约束 agent。再点要出的语言，和成片写到哪。说明只在这里复制。
      </p>
      <Toast flash={flash} />

      <section>
        <h2 className="h">要出的语言</h2>
        <ul className="kit-list lang-picks">
          {["zh", "en"].map((item) => {
            const on = langs.includes(item);
            return (
              <li key={item}>
                <label className={on ? "kit-item is-on" : "kit-item"}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setLangs((current) =>
                        current.includes(item) ? current.filter((locale) => locale !== item) : [...current, item],
                      )
                    }
                  />
                  <span className="item-title">{langLabel(item)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="h">产物写到哪</h2>
        <div className="pick-grid pick-grid-row">
          <button
            type="button"
            className={outputHome === "user" ? "pick is-on" : "pick"}
            onClick={() => setOutputHome(outputHome === "user" ? "" : "user")}
          >
            <strong>data/projects</strong>
            <span className="item-meta">data/projects/&lt;id&gt;/assets/outputs/</span>
          </button>
          <button
            type="button"
            className={outputHome === "first-party" ? "pick is-on" : "pick"}
            onClick={() => setOutputHome(outputHome === "first-party" ? "" : "first-party")}
          >
            <strong>data/first-party</strong>
            <span className="item-meta">data/first-party/&lt;id&gt;/assets/outputs/</span>
          </button>
        </div>
      </section>

      <section className="compose-fields" aria-label="可选增强">
        <label className="field compose-field">
          <span>方法</span>
          <select
            value={recipeId}
            disabled={methods.length === 0}
            onChange={(event) => setRecipeId(event.target.value)}
          >
            <option value="">{methods.length ? "不指定" : "库里还没有方法"}</option>
            {methods.map((asset) => {
              const id = recipeIdOfMethod(asset);
              return (
                <option key={asset.id} value={id}>
                  {asset.label ?? id}
                </option>
              );
            })}
          </select>
          {methods.length === 0 ? (
            <span className="item-meta">
              <Link href="/methods">去方法页</Link>
            </span>
          ) : null}
        </label>

        <label className="field compose-field">
          <span>音色</span>
          <select
            value={voiceRef}
            disabled={voicePacks.length === 0}
            onChange={(event) => setVoiceRef(event.target.value)}
          >
            <option value="">{voicePacks.length ? "不指定" : "库里还没有音色"}</option>
            {voicePacks.map((asset) => (
              <option key={asset.id} value={`library:${asset.id}`}>
                {asset.label ?? asset.id}
              </option>
            ))}
          </select>
          {voicePacks.length === 0 ? (
            <span className="item-meta">
              <Link href="/voices">去音色页</Link>
            </span>
          ) : null}
        </label>

        <div className="field compose-field">
          <span>素材</span>
          <div className="compose-kit">
            <select
              aria-label="素材"
              value=""
              disabled={materials.length === 0 || kit.length === materials.length}
              onChange={(event) => addMaterial(event.target.value)}
            >
              <option value="">
                {materials.length === 0 ? "库里还没有素材" : kit.length ? "再加一件" : "不指定"}
              </option>
              {materials
                .filter((asset) => !kit.includes(`library:${asset.id}`))
                .map((asset) => (
                  <option key={asset.id} value={`library:${asset.id}`}>
                    {asset.label ?? asset.id} · {kindLabel(asset.kind)}
                  </option>
                ))}
            </select>
            {kit.map((ref) => (
              <button
                key={ref}
                type="button"
                className="compose-chip"
                aria-label={`去掉 ${kitLabels[ref] ?? ref}`}
                onClick={() => dropMaterial(ref)}
              >
                {kitLabels[ref] ?? ref}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
          {materials.length === 0 ? (
            <span className="item-meta">
              <Link href="/library">去素材页</Link>
            </span>
          ) : null}
        </div>
      </section>

      <BriefPanel
        input={{
          task: "study-explainer",
          recipeId: recipeId || undefined,
          recipeTitle: selectedMethod?.label,
          requiresList: selectedMethod ? methodExpandOf(selectedMethod) === "list" : undefined,
          voices: Object.fromEntries(langs.map((locale) => [locale, voiceRef])),
          voiceLabels,
          voiceSet: selectedVoice ? { ref: voiceRef, label: selectedVoice.label ?? selectedVoice.id } : undefined,
          langs,
          langLabels: Object.fromEntries(langs.map((locale) => [locale, langLabel(locale)])),
          kit,
          kitLabels,
          outputHome: outputHome || undefined,
        }}
      />
    </div>
  );
}
