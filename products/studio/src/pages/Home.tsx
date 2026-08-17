import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { BriefPanel } from "../components/BriefPanel";
import { Link } from "../components/Link";
import type { OutputHome } from "../lib/brief";
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

  function toggleMaterial(ref: string) {
    setKit((current) => (current.includes(ref) ? current.filter((item) => item !== ref) : [...current, ref]));
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">选出一组，复制给 agent。</h1>
      <p className="lede">
        方法、音色、素材都是可选增强，点上的才约束 agent。再点要出的语言，和成片写到哪。说明只在这里复制。
      </p>
      <Toast flash={flash} />

      <section>
        <h2 className="h">要出的语言</h2>
        <p className="item-meta">可选中文、英文，或两个都出。音色还是一套，不必两种都勾。</p>
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
                  <span>
                    <span className="item-title">{langLabel(item)}</span>
                    <span className="item-meta">{item}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="h">产物写到哪</h2>
        <p className="item-meta">成片只进本仓 data/ 对应任务目录。没点就让 agent 先问。不要默认拷到仓库外。</p>
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

      <div className="compose-grid">
        <section>
          <h2 className="h">方法</h2>
          <p className="item-meta">可选。库里的成片骨架，不点就让 agent 自己铺场。</p>
          {methods.length === 0 ? (
            <p className="item-meta">
              库里还没有方法。<Link href="/methods">去方法页</Link>
            </p>
          ) : null}
          <div className="pick-grid">
            {methods.map((asset) => {
              const id = recipeIdOfMethod(asset);
              return (
                <button
                  key={asset.id}
                  type="button"
                  className={id === recipeId ? "pick is-on" : "pick"}
                  onClick={() => setRecipeId(id === recipeId ? "" : id)}
                >
                  <strong>{asset.label ?? id}</strong>
                  <span className="item-meta">{asset.text?.trim() ?? ""}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="h">音色</h2>
          <p className="item-meta">可选。点上的那套，出片就用它克隆。</p>
          <div className="pick-grid">
            {voicePacks.map((asset) => {
              const ref = `library:${asset.id}`;
              return (
                <button
                  key={asset.id}
                  type="button"
                  className={voiceRef === ref ? "pick is-on" : "pick"}
                  onClick={() => setVoiceRef(voiceRef === ref ? "" : ref)}
                >
                  <strong>{asset.label ?? asset.id}</strong>
                  <span className="item-meta">Hi-Fi clone</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="h">素材</h2>
          <p className="item-meta">可选。点上的给 agent 作参考，不强制。</p>
          {materials.length === 0 ? (
            <p className="item-meta">
              库里还没有素材。<Link href="/library">去素材页</Link>
            </p>
          ) : (
            <ul className="kit-list">
              {materials.map((asset) => {
                const ref = `library:${asset.id}`;
                const on = kit.includes(ref);
                return (
                  <li key={asset.id}>
                    <label className={on ? "kit-item is-on" : "kit-item"}>
                      <input type="checkbox" checked={on} onChange={() => toggleMaterial(ref)} />
                      <span>
                        <span className="item-title">{asset.label ?? asset.id}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

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
