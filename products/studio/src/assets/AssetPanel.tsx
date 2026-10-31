import { useEffect, useState } from "react";
import { z, refKey } from "@lightweaver/weaver/contracts";
import { api, mediaUrl, requestId } from "../api";
import { desktop, pathForFile } from "../desktop";
import { useSession } from "../session/context";
import { Field } from "../ui/Field";

export function AssetPanel({
  selectedKey,
  onSelect,
}: {
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const session = useSession();
  const draft = session.draft;
  const ctx = session.ctx;
  const [dragging, setDragging] = useState(false);
  const importPaths = async (paths: string[]) => {
    if (!draft) return;
    await session.act(async () => {
      for (const file of paths) {
        await api(`/projects/${draft.id}/assets/path`, z.unknown(), {
          method: "POST",
          body: {
            file,
            expectedRevision: session.currentBase(),
            requestId: requestId(),
          },
        });
        await session.reload();
      }
    });
  };

  const importFiles = async (files: File[]) => {
    if (!draft) return;
    await session.act(async () => {
      for (const file of files) {
        const disk = pathForFile(file);
        if (disk) {
          await api(`/projects/${draft.id}/assets/path`, z.unknown(), {
            method: "POST",
            body: {
              file: disk,
              name: file.name,
              expectedRevision: session.currentBase(),
              requestId: requestId(),
            },
          });
        } else {
          const form = new FormData();
          form.append("file", file);
          form.append("expectedRevision", session.currentBase());
          form.append("requestId", requestId());
          await api(`/projects/${draft.id}/assets`, z.unknown(), { method: "POST", body: form });
        }
        await session.reload();
      }
    });
  };

  useEffect(() => {
    const onImport = (event: Event) => {
      event.preventDefault();
      void (async () => {
        const picked = await desktop()?.pickMedia?.();
        if (picked?.length) await importPaths(picked);
        else document.querySelector<HTMLInputElement>('input[aria-label="上传项目素材"]')?.click();
      })();
    };
    window.addEventListener("lightweaver-import", onImport);
    return () => window.removeEventListener("lightweaver-import", onImport);
  }, [draft, session]);

  if (!draft || !ctx) return null;

  return (
    <div
      className={`min-w-0 ${dragging ? "bg-accent/10" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = [...event.dataTransfer.files];
        if (files.length) void importFiles(files);
      }}
    >
      <div className="section-title">
        <b>素材</b>
        <button
          type="button"
          onClick={() =>
            void desktop()?.pickMedia?.().then((paths) => {
              if (paths?.length) return importPaths(paths);
            })
          }
        >
          选择文件
        </button>
      </div>
      <Field label="上传项目素材">
        <input
          aria-label="上传项目素材"
          type="file"
          multiple
          onChange={(event) => {
            const files = [...(event.target.files || [])];
            event.target.value = "";
            if (files.length) void importFiles(files);
          }}
        />
      </Field>
      <p className="hint">有桌面路径时按路径导入，不会把视频读成文本。</p>
      <ul className="m-0 list-none p-0">
        {ctx.assets.map((asset) => {
          const key = refKey(asset);
          return (
            <li key={asset.version}>
              <button
                type="button"
                className={`my-1 w-full text-left ${selectedKey === key ? "border-accent" : ""}`}
                onClick={() => onSelect(key)}
              >
                <b>{asset.name}</b>
                <small>
                  {asset.kind} · {asset.version.slice(0, 8)}
                </small>
              </button>
            </li>
          );
        })}
      </ul>
      {ctx.assets.length === 0 && <p className="hint">还没有受管素材。</p>}
      <Field label="可选方法">
        <select
          value={draft.method ? `${draft.method.itemId}@${draft.method.version}` : ""}
          onChange={(event) => {
            const version = session.library.find((item) => `${item.itemId}@${item.version}` === event.target.value);
            session.edit({
              ...draft,
              method: version ? { itemId: version.itemId, version: version.version } : undefined,
            });
          }}
        >
          <option value="">不指定方法</option>
          {session.library
            .filter((item) => item.payload.kind === "method")
            .map((item) => (
              <option key={item.itemId} value={`${item.itemId}@${item.version}`}>
                {item.payload.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="从素材库采用">
        <select
          defaultValue=""
          aria-label="从素材库采用"
          disabled={session.dirty}
          onChange={(event) => {
            const version = session.library.find((item) => item.itemId === event.target.value);
            event.target.value = "";
            if (!version) return;
            void session.act(async () => {
              await api(`/projects/${draft.id}/adopt`, z.unknown(), {
                method: "POST",
                body: {
                  itemId: version.itemId,
                  version: version.version,
                  expectedRevision: session.currentBase(),
                  requestId: requestId(),
                },
              });
              await session.reload();
            });
          }}
        >
          <option value="">选择可复用素材</option>
          {session.library
            .filter((item) => item.payload.kind === "material")
            .map((item) => (
              <option key={item.itemId} value={item.itemId}>
                {item.payload.name}
              </option>
            ))}
        </select>
      </Field>
      {selectedKey && (
        <p className="sr-only">预览地址 {mediaUrl(ctx.assets.find((asset) => refKey(asset) === selectedKey)?.digest || "")}</p>
      )}
    </div>
  );
}
