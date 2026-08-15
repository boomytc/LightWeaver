export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#17181c" />
      <path
        d="M5 19 19 5v14Z"
        fill="white"
        fillOpacity="0.35"
        stroke="white"
        strokeWidth="1.4"
      />
    </svg>
  );
}
