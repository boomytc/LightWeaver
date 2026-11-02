import { useEffect, useId, useRef, useState } from "react";
import { VerifyResult } from "@lightweaver/weaver/contracts";
import { ApiError } from "../api";
import { Button } from "../ui/Button";
import { InputWithActions } from "../ui/InputWithActions";

type PathChoice =
  | { kind: "idle" }
  | { kind: "choosing" }
  | { kind: "checking"; value: string }
  | { kind: "error"; message: string };

function pathError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.protocol.code === "MODEL_VERIFY_FAILED") {
      const result = VerifyResult.safeParse(error.protocol.details);
      return result.success && result.data.state === "missing"
        ? "所选路径没有模型文件，请重新选择。"
        : "所选模型文件不完整或版本不匹配，请重新选择。";
    }
    if (error.protocol.code === "CONFIG_CONFLICT") return "模型设置已变化，请重新选择路径。";
    if (error.protocol.code === "INVALID_INPUT") return "请选择此模型的文件或完整目录。";
  }
  return "无法保存此模型路径，请重试。";
}

export function ModelPathField({
  value,
  disabled,
  pickFile,
  pickDirectory,
  onAdopt,
}: {
  value: string;
  disabled: boolean;
  pickFile: (() => Promise<string | null>) | undefined;
  pickDirectory: (() => Promise<string | null>) | undefined;
  onAdopt: (path: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState<PathChoice>({ kind: "idle" });
  const pending = useRef(false), mounted = useRef(true), messageId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const choose = async (pick: (() => Promise<string | null>) | undefined) => {
    if (!pick || pending.current || disabled) return;
    pending.current = true;
    setChoice({ kind: "choosing" });
    try {
      const picked = await pick();
      if (!mounted.current) return;
      if (!picked) { setChoice({ kind: "idle" }); return; }
      setChoice({ kind: "checking", value: picked });
      await onAdopt(picked);
      if (mounted.current) setChoice({ kind: "idle" });
    } catch (error) {
      if (mounted.current) setChoice({ kind: "error", message: pathError(error) });
    } finally {
      pending.current = false;
    }
  };

  const checking = choice.kind === "checking", locked = disabled || checking || choice.kind === "choosing";
  return (
    <InputWithActions
      label="模型路径"
      aria-label="模型路径"
      value={checking ? choice.value : value}
      title={checking ? choice.value : value}
      placeholder="未选择模型"
      readOnly
      aria-busy={checking}
      aria-describedby={choice.kind === "error" || checking ? messageId : undefined}
      actions={<>
        <Button disabled={locked || !pickFile} title={!pickFile ? "请在桌面客户端中选择" : undefined} onClick={() => void choose(pickFile)}>选择文件</Button>
        <Button disabled={locked || !pickDirectory} title={!pickDirectory ? "请在桌面客户端中选择" : undefined} onClick={() => void choose(pickDirectory)}>选择目录</Button>
      </>}
      hint={checking ? <span id={messageId} role="status">检查中…</span>
        : choice.kind === "error" ? <span id={messageId} className="error" role="alert">{choice.message}</span> : undefined}
    />
  );
}
