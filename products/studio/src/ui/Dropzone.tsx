import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { UploadIcon } from "./Icons";

export function Dropzone({
  inputAriaLabel,
  onFiles,
  onBrowse,
  accept,
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
  multiple?: boolean;
  disabled?: boolean;
  title: ReactNode;
  description?: ReactNode;
  browseLabel?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (!disabled && files.length) onFiles(files);
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
