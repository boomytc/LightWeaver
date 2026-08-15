export function IconMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path d="M5 19 19 5v14Z" fill="#0e1118" fillOpacity="0.35" stroke="#0e1118" strokeWidth="1.4" />
    </svg>
  );
}

export function IconFilm({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 5v14M16 5v14M3 10h18M3 14h18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconImage({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" />
      <path d="m7 17 4-4 3 3 3-4 3 5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconWave({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h2v0M8 8v8M12 5v14M16 9v6M20 11v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
