import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function BrandIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 17V7l5 10V7l5 10V7l6 10" /></Icon>;
}
export function ProjectIcon(props: IconProps) {
  return <Icon {...props}><path d="M3 7.5h7l2-2h9v13H3z" /><path d="M3 10h18" /></Icon>;
}
export function MethodIcon(props: IconProps) {
  return <Icon {...props}><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></Icon>;
}
export function VoiceIcon(props: IconProps) {
  return <Icon {...props}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></Icon>;
}
export function LibraryIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 3 15-4 1z" /></Icon>;
}
export function JobsIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
}
export function SettingsIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9c.15.6.7 1 1.55 1H21v4h-.08c-.85 0-1.4.4-1.52 1z" /></Icon>;
}
export function SearchIcon(props: IconProps) {
  return <Icon {...props}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></Icon>;
}
export function SunIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></Icon>;
}
export function MoonIcon(props: IconProps) {
  return <Icon {...props}><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2z" /></Icon>;
}
export function SystemIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></Icon>;
}
export function SaveIcon(props: IconProps) {
  return <Icon {...props}><path d="M5 3h12l3 3v15H4V3z" /><path d="M8 3v6h8V3M8 21v-8h8v8" /></Icon>;
}
export function PlayIcon(props: IconProps) {
  return <Icon {...props}><path d="m8 5 11 7-11 7z" /></Icon>;
}
export function PauseIcon(props: IconProps) {
  return <Icon {...props}><path d="M8 5v14M16 5v14" /></Icon>;
}
export function ChevronRightIcon(props: IconProps) {
  return <Icon {...props}><path d="m9 18 6-6-6-6" /></Icon>;
}
export function ChevronDownIcon(props: IconProps) {
  return <Icon {...props}><path d="m6 9 6 6 6-6" /></Icon>;
}
export function PanelLeftCloseIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 9l-3 3 3 3" /></Icon>;
}
export function PanelLeftOpenIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M6 9l3 3-3 3" /></Icon>;
}
export function PanelRightCloseIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16M9 9l3 3-3 3" /></Icon>;
}
export function PanelRightOpenIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16M18 9l-3 3 3 3" /></Icon>;
}
export function PanelBottomCloseIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 15h18M10 9l2-2 2 2" /></Icon>;
}
export function PanelBottomOpenIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 15h18M10 18l2 2 2-2" /></Icon>;
}
export function ArrowLeftIcon(props: IconProps) {
  return <Icon {...props}><path d="M20 12H4M10 6l-6 6 6 6" /></Icon>;
}
export function ArrowUpIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 20V4M6 10l6-6 6 6" /></Icon>;
}
export function ArrowDownIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 4v16M6 14l6 6 6-6" /></Icon>;
}
export function UploadIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 16V3M7 8l5-5 5 5M4 15v5h16v-5" /></Icon>;
}
export function CheckIcon(props: IconProps) {
  return <Icon {...props}><path d="m5 12 4 4L19 6" /></Icon>;
}
export function AlertIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 3 2.5 20h19z" /><path d="M12 9v5M12 17.5v.01" /></Icon>;
}
export function MoreIcon(props: IconProps) {
  return <Icon {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></Icon>;
}
export function PlusIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>;
}
export function TrashIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 7h16M9 3h6l1 4H8zM6 7l1 14h10l1-14M10 11v6M14 11v6" /></Icon>;
}
export function RefreshIcon(props: IconProps) {
  return <Icon {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" /></Icon>;
}
export function FileIcon(props: IconProps) {
  return <Icon {...props}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4" /></Icon>;
}
export function FolderIcon(props: IconProps) {
  return <Icon {...props}><path d="M3 6h7l2 2h9v12H3z" /></Icon>;
}
export function VideoIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2" /></Icon>;
}
export function ImageIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 3-3 5 5" /></Icon>;
}
export function AudioIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 14V10M8 17V7M12 20V4M16 17V7M20 14V10" /></Icon>;
}
export function CardIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h7" /></Icon>;
}
export function CopyIcon(props: IconProps) {
  return <Icon {...props}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></Icon>;
}
export function CloseIcon(props: IconProps) {
  return <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>;
}
export function EyeIcon(props: IconProps) {
  return <Icon {...props}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.5" /></Icon>;
}
