// Иконки из дизайн-макета (Редизайн.dc.html), 20×20, stroke=currentColor
const PATHS: Record<string, JSX.Element> = {
  home: <path d="M4 8.8l6-5.3 6 5.3v6.7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />,
  check: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M7 10.2l2 2 4-4.4" />
    </>
  ),
  bulb: (
    <>
      <circle cx="10" cy="8" r="4.5" />
      <path d="M8.5 14.5h3M9 17h2" />
    </>
  ),
  note: (
    <>
      <rect x="4.5" y="3.5" width="11" height="13.5" rx="1.5" />
      <path d="M7.5 7.5h5M7.5 10.5h5M7.5 13.5h3" />
    </>
  ),
  folder: (
    <path d="M3.5 6A1.5 1.5 0 0 1 5 4.5h3l1.5 2h5A1.5 1.5 0 0 1 16 8v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 14z" />
  ),
  gear: (
    <>
      <path d="M4 6.5h12M4 13.5h12" />
      <circle cx="8" cy="6.5" r="1.8" />
      <circle cx="12.5" cy="13.5" r="1.8" />
    </>
  ),
  search: (
    <>
      <circle cx="9" cy="9" r="5" />
      <path d="M13 13l3.5 3.5" />
    </>
  ),
  plus: <path d="M10 4.5v11M4.5 10h11" strokeWidth="1.7" />,
  chart: <path d="M5 16V9.5M10 16V4.5M15 16v-4.5" strokeWidth="1.7" />,
  cal: (
    <>
      <rect x="3.5" y="5" width="13" height="11" rx="1.5" />
      <path d="M3.5 8.5h13M7 3.5V6M13 3.5V6" />
    </>
  ),
  flag: <path d="M5.5 17V3.5M5.5 4h8.5l-2.2 3 2.2 3H5.5" />,
  spark: <path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8z" />,
  mic: (
    <>
      <rect x="7.5" y="3" width="5" height="9" rx="2.5" />
      <path d="M4.5 10a5.5 5.5 0 0 0 11 0M10 15.5V18" />
    </>
  ),
  link: (
    <path
      d="M8.5 11.5l3-3M7 13l-1.5 1.5a2.8 2.8 0 0 1-4-4L4.5 7.5M13 7l1.5-1.5a2.8 2.8 0 0 1 4 4L15.5 12.5"
      transform="translate(0.5 0.2) scale(0.92)"
    />
  ),
  clip: (
    <path d="M13.5 8.5l-4.6 4.6a1.8 1.8 0 0 1-2.5-2.5l5.3-5.3a3 3 0 0 1 4.2 4.2l-5.6 5.6a4.2 4.2 0 0 1-6-6l4.9-4.9" />
  ),
  x: <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" strokeWidth="1.6" />,
  moon: (
    <path d="M10 3.5a6.5 6.5 0 1 0 6.5 6.5A5 5 0 0 1 10 3.5z" strokeLinejoin="round" />
  ),
  sun: (
    <>
      <circle cx="10" cy="10" r="4" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 5.5h12M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M6 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4l.7-10" />
      <path d="M8.4 8.5v5M11.6 8.5v5" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName | string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name as string] ?? null}
    </svg>
  );
}
