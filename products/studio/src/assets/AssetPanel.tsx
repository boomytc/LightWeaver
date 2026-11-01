import { z, refKey } from "@lightweaver/weaver/contracts";
import { api, mediaUrl, requestId } from "../api";
import { desktop, pathForFile } from "../desktop";
import { useSession } from "../session/context";
import { AssetImportResult } from "../session/useProjectSession";
import { Field } from "../ui/Field";
import { Dropzone } from "../ui/Dropzone";
import { Badge } from "../ui/Badge";
import { AudioIcon, FileIcon, ImageIcon, VideoIcon } from "../ui/Icons";
import { MediaSourceDetails } from "./MediaSourceDetails";

export function useProjectAssetImport() {
  const session = useSession();
  const draft = session.draft;
  const importBatch = async (
    projectId: string,
    senders: Array<(expectedRevision: string, request: string) => Promise<z.infer<typeof AssetImportResult>>>,
  ) => {
    if (session.dirty && !(await session.save())) {
      session.setError("素材导入前未能保存当前草稿，批量导入未开始");
      return;
    }
    await session.act(async () => {
      const initialSession = session.beginAssetEditSession();
      if (!initialSession || initialSession.projectId !== projectId) throw new Error("素材导入目标项目已变化，请重新选择文件");
      let expectedRevision = session.currentBase();
      let completed = 0;
      try {
        for (const send of senders) {
          const current = session.beginAssetEditSession();
          const editSession = current?.generation === initialSession.generation ? current : initialSession;
          const result = await send(expectedRevision, requestId());
          completed += 1;
          const outcome = session.acceptAssetImport(result, editSession, expectedRevision);
          expectedRevision = result.revision.id;
          if (outcome === "assets-changed") throw new Error("本地素材列表也发生编辑，请核对后重新选择剩余文件");
        }
        await session.reload(projectId);
        session.setNotice(`已导入 ${completed}/${senders.length} 个素材到项目 ${projectId}`);
      } catch (reason) {
        session.setError(`项目 ${projectId} 已导入 ${completed}/${senders.length} 个素材：${reason instanceof Error ? reason.message : String(reason)}`);
      }
    });
  };
  const importPaths = async (paths: string[]) => {
    if (!draft || session.busy || paths.length === 0) return;
    const projectId = draft.id;
    await importBatch(projectId, paths.map((file) => (expectedRevision, request) =>
      api(`/projects/${projectId}/assets/path`, AssetImportResult, {
        method: "POST",
        body: { file, expectedRevision, requestId: request },
      }),
    ));
  };
  const importFiles = async (files: File[]) => {
    if (!draft || session.busy || files.length === 0) return;
    const projectId = draft.id;
    await importBatch(projectId, files.map((file) => (expectedRevision, request) => {
      const disk = pathForFile(file);
      if (disk) return api(`/projects/${projectId}/assets/path`, AssetImportResult, {
        method: "POST",
        body: { file: disk, name: file.name, expectedRevision, requestId: request },
      });
      const form = new FormData();
      form.append("file", file);
      form.append("expectedRevision", expectedRevision);
      form.append("requestId", request);
      return api(`/projects/${projectId}/assets`, AssetImportResult, { method: "POST", body: form });
    }));
  };
  return { importPaths, importFiles };
}

export function AssetPanel({ selectedKey, onSelect }: { selectedKey: string; onSelect: (key: string) => void }) {
  const session = useSession();
  const draft = session.draft;
  const ctx = session.ctx;
  const { importPaths, importFiles } = useProjectAssetImport();
  if (!draft || !ctx) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Dropzone
        className="min-h-0 flex-col items-stretch p-3"
        inputAriaLabel="上传项目素材"
        multiple
        disabled={session.busy}
        onFiles={(files) => void importFiles(files)}
        onBrowse={desktop() ? () => void desktop()?.pickMedia?.().then((paths) => { if (paths?.length) return importPaths(paths); }) : undefined}
        title="拖入或选择素材"
        description="视频、图片与音频；优先按本机路径导入"
      />
      <div className="section-title"><b>项目素材</b><Badge>{ctx.assets.length}</Badge></div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {ctx.assets.map((asset) => {
          const key = refKey(asset);
          return (
            <li key={asset.version}>
              <button type="button" className={`row-item ${selectedKey === key ? "is-on" : ""}`} onClick={() => onSelect(key)}>
                {asset.kind === "video" ? <VideoIcon /> : asset.kind === "image" ? <ImageIcon /> : asset.kind === "audio" ? <AudioIcon /> : <FileIcon />}
                <span className="row-item-copy"><b>{asset.name}</b><small className="numeric">{asset.kind} · {asset.version.slice(0, 8)}</small></span>
              </button>
            </li>
          );
        })}
      </ul>
      {ctx.assets.length === 0 && <p className="hint text-xs">还没有受管素材。</p>}
      <MediaSourceDetails asset={ctx.assets.find((asset) => refKey(asset) === selectedKey)} assets={ctx.assets} />
      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <Field label="可选方法">
          <select value={draft.method ? `${draft.method.itemId}@${draft.method.version}` : ""} onChange={(event) => {
            const version = session.library.find((item) => `${item.itemId}@${item.version}` === event.target.value);
            session.edit({ ...draft, method: version ? { itemId: version.itemId, version: version.version } : undefined });
          }}>
            <option value="">不指定方法</option>
            {session.library.filter((item) => item.payload.kind === "method").map((item) => <option key={item.itemId} value={`${item.itemId}@${item.version}`}>{item.payload.name}</option>)}
          </select>
        </Field>
        <Field label="从素材库采用">
          <select defaultValue="" aria-label="从素材库采用" disabled={session.dirty || session.busy} onChange={(event) => {
            const version = session.library.find((item) => item.itemId === event.target.value);
            event.target.value = "";
            if (!version) return;
            void session.act(async () => {
              await api(`/projects/${draft.id}/adopt`, z.unknown(), {
                method: "POST",
                body: { itemId: version.itemId, version: version.version, expectedRevision: session.currentBase(), requestId: requestId() },
              });
              await session.reload();
            });
          }}>
            <option value="">选择可复用素材</option>
            {session.library.filter((item) => item.payload.kind === "material").map((item) => <option key={item.itemId} value={item.itemId}>{item.payload.name}</option>)}
          </select>
        </Field>
      </div>
      {selectedKey && <p className="sr-only">预览地址 {mediaUrl(ctx.assets.find((asset) => refKey(asset) === selectedKey)?.digest || "")}</p>}
    </div>
  );
}
