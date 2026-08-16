import type { Flash } from "../lib/flash";

export function Toast({ flash }: { flash?: Flash }) {
  if (!flash) return null;
  return (
    <div className={`toast toast-${flash.kind}`} role="status">
      {flash.text}
    </div>
  );
}
