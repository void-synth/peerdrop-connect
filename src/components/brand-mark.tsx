export function BrandMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" className="stroke-current" strokeWidth="1.5" />
      <path
        d="M8 9.5L12 13.5L16 9.5M12 13.5V7.5M8 14.5H16"
        className="stroke-current"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
