import { useState } from "react";
import { buildAgentBrief, type BriefInput } from "../lib/brief";

export function BriefPanel({ input }: { input: BriefInput }) {
  const [copied, setCopied] = useState(false);
  const text = buildAgentBrief(input);
  const ready = (input.langs?.length ?? 0) > 0;
  const hasOutput = Boolean(input.outputHome);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const box = document.createElement("textarea");
      box.value = text;
      document.body.appendChild(box);
      box.select();
      document.execCommand("copy");
      box.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="surface brief-panel">
      <div className="section-head">
        <h2 className="h">给 agent 的说明</h2>
        <button type="button" className="btn btn-primary" onClick={() => void copy()}>
          {copied ? "已复制" : "一键复制"}
        </button>
      </div>
      <p className="item-meta">
        {ready
          ? hasOutput
            ? "把这段贴给 agent。方法、音色、素材没点的不要代点。"
            : "语言有了。产物位置没点，说明里会让 agent 开始前先问。"
          : "至少点一种要出的语言。方法、音色、素材都是可选增强。"}
      </p>
      <pre className="brief-text">{text}</pre>
    </section>
  );
}
