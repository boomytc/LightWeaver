import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { UploadIcon } from "./Icons";

function matchesAccept(file: File, accept?: string) {
  if (!accept) return true;
  const patterns = accept.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!patterns.length) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return patterns.some((pattern) =>
    pattern.startsWith(".")
      ? name.endsWith(pattern)
      : pattern.endsWith("/*")
        ? type.startsWith(pattern.slice(0, -1))
        : type === pattern,
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024 / 1024)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function Dropzone({
  inputAriaLabel,
  onFiles,
  onBrowse,
  accept,
  maxBytes,
  multiple = false,
  disabled = false,
  title,
  description,
  browseLabel = "选择文件",
  className = "",
}: {
  inputAriaLabel: string;
  onFiles: (files: File[]) => void;
  onBrowse?: () => void;
  accept?: string;
  maxBytes?: number;
  multiple?: boolean;
  disabled?: boolean;
  title: ReactNode;
  description?: ReactNode;
  browseLabel?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState("");
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (!matchesAccept(file, accept)) rejected.push(`${file.name}（类型不符）`);
      else if (maxBytes && file.size > maxBytes) rejected.push(`${file.name}（超过 ${formatBytes(maxBytes)}）`);
      else accepted.push(file);
    }
    setRejection(rejected.length ? `已忽略：${rejected.join("、")}` : "");
    if (accepted.length) onFiles(accepted);
  };
  return (
    <div
      className={`dropzone ${className}`}
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={drop}
    >
      <span className="dropzone-icon"><UploadIcon /></span>
      <div className="dropzone-copy">
        <b className="block">{title}</b>
        {description && <small className="mt-0.5 block">{description}</small>}
        {rejection && <p className="error m-0 mt-1 text-xs" role="alert">{rejection}</p>}
      </div>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => onBrowse ? onBrowse() : input.current?.click()}
      >
        {browseLabel}
      </Button>
      <input
        ref={input}
        className="hidden"
        type="file"
        aria-label={inputAriaLabel}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = [...(event.target.files || [])];
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
