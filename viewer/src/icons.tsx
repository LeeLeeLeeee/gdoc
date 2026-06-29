// Minimal inline icon set (lucide-style strokes) used across the viewer.
type P = { size?: number; color?: string };
const s = (n = 16) => ({ width: n, height: n, viewBox: '0 0 24 24' as const });
const stroke = (color = 'currentColor') => ({
  fill: 'none' as const,
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const Logo = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <circle cx="7" cy="7" r="4.3" fill="#1e6bff" />
    <circle cx="17" cy="7" r="4.3" fill="#3b82f6" />
    <circle cx="7" cy="17" r="4.3" fill="#3b82f6" />
    <circle cx="17" cy="17" r="4.3" fill="#1e6bff" />
  </svg>
);
export const Search = ({ size = 14, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
export const Filter = ({ size = 15, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
);
export const SortIcon = ({ size = 13, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="m21 8-4-4-4 4" /><path d="M17 4v16" /></svg>
);
export const Chevron = ({ size = 11, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="m6 9 6 6 6-6" /></svg>
);
export const X = ({ size = 14, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const Mail = ({ size = 15, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);
export const Lock = ({ size = 15, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const Logout = ({ size = 13, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
);
export const Alert = ({ size = 28, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
);
export const Sun = ({ size = 14, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
);
export const Moon = ({ size = 14, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="M20.9 13.5A8.5 8.5 0 1 1 10.5 3.1 6.5 6.5 0 0 0 20.9 13.5Z" /></svg>
);
export const Refresh = ({ size = 14, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="M21 12a9 9 0 0 1-15.5 6.2" /><path d="M3 12A9 9 0 0 1 18.5 5.8" /><path d="M18 2v4h-4" /><path d="M6 22v-4h4" /></svg>
);
export const Up = ({ size = 12, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /></svg>
);
export const Down = ({ size = 12, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="m3 16 4 4 4-4" /><path d="M7 20V4" /></svg>
);
export const Check = ({ size = 13, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="M20 6 9 17l-5-5" /></svg>
);
export const Folder = ({ size = 15, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
);
export const File = ({ size = 14, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /></svg>
);
export const ChevronRight = ({ size = 12, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="m9 6 6 6-6 6" /></svg>
);
export const Pencil = ({ size = 14, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);
export const LinkIcon = ({ size = 14, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" /></svg>
);
export const Copy = ({ size = 14, color }: P) => (
  <svg {...s(size)} {...stroke(color)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
);
