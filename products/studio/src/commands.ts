import type { StudioCommand } from "./desktop";

export type { StudioCommand };

export function isComposingEvent(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === 229;
}

export function isTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function shortcutCommand(event: KeyboardEvent): StudioCommand | null {
  if (isComposingEvent(event)) return null;
  const mod = event.metaKey || event.ctrlKey;
  if (!mod || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "s" && !event.shiftKey) return "save";
  if (key === "f" && !event.shiftKey) {
    if (isTextField(event.target)) return null;
    return "find";
  }
  if (key === "," && !event.shiftKey) return "settings";
  if (key === "o" && !event.shiftKey && !isTextField(event.target)) return "import";
  return null;
}

const listeners = new Set<(command: StudioCommand) => void>();

export function onStudioCommand(handler: (command: StudioCommand) => void) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function runCommand(command: StudioCommand) {
  for (const listener of listeners) listener(command);
}
