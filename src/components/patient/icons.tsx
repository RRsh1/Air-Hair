/** One icon family for the patient app: 20px grid, 1.6 stroke, round joins, currentColor. */
type IconProps = { className?: string };
const base = "shrink-0";

function Svg({ className = "h-5 w-5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" className={`${base} ${className}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 7.2c0-.9.7-1.6 1.6-1.6h1.7l1.1-1.6h4.2l1.1 1.6h1.7c.9 0 1.6.7 1.6 1.6v6.9c0 .9-.7 1.6-1.6 1.6H5.1c-.9 0-1.6-.7-1.6-1.6z" />
    <circle cx="10" cy="10.4" r="2.7" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 10.3 3 3 6-6.6" />
  </Svg>
);

/** Points toward the reading start (right in Hebrew): "back"/"previous". */
export const ChevronStartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m8 5 5 5-5 5" />
  </Svg>
);

export const ChevronEndIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 5-5 5 5 5" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.5v8.5M6.5 8.8 10 12.3l3.5-3.5M4 15.8h12" />
  </Svg>
);

export const NoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 3.8h6.3l3 3v9.4H5.5z" />
    <path d="M11.5 3.8v3.3h3.3M7.8 10.3h4.6M7.8 12.9h3.2" />
  </Svg>
);
