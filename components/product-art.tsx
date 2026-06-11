// The catalog has no image URLs, so every product gets a deliberate,
// deterministic art tile instead: a category-tinted gradient, two soft motif
// circles positioned by a hash of the sku, and the product's initials. The
// same sku always renders the same tile (grid, detail, cart agree), and the
// grid reads as designed rather than as missing photos.

const PALETTES: Record<string, { from: string; to: string }> = {
  books: { from: "#b45309", to: "#78350f" }, // amber
  kitchen: { from: "#be123c", to: "#881337" }, // rose
  home: { from: "#0f766e", to: "#134e4a" }, // teal
  stationery: { from: "#6d28d9", to: "#4c1d95" }, // violet
  garden: { from: "#15803d", to: "#14532d" }, // green
  office: { from: "#0369a1", to: "#0c4a6e" }, // sky
  hardware: { from: "#c2410c", to: "#7c2d12" }, // orange
};
const FALLBACK = { from: "#57534e", to: "#292524" }; // stone

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function ProductArt({
  sku,
  name,
  category,
  className,
}: {
  sku: string;
  name: string;
  category: string;
  className?: string;
}) {
  const palette = PALETTES[category] ?? FALLBACK;
  const h = hash(sku);
  // Motif geometry varies per sku but stays inside tasteful bounds.
  const cx1 = 60 + (h % 280);
  const cy1 = 40 + ((h >> 4) % 160);
  const r1 = 90 + ((h >> 8) % 70);
  const cx2 = 340 - ((h >> 6) % 280);
  const cy2 = 260 - ((h >> 10) % 160);
  const r2 = 110 + ((h >> 12) % 80);
  const gradId = `art-${sku}`;

  return (
    <svg
      viewBox="0 0 400 300"
      role="img"
      aria-label={name}
      className={className}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.from} />
          <stop offset="100%" stopColor={palette.to} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${gradId})`} />
      <circle cx={cx1} cy={cy1} r={r1} fill="#ffffff" opacity="0.10" />
      <circle cx={cx2} cy={cy2} r={r2} fill="#ffffff" opacity="0.07" />
      <text
        x="200"
        y="150"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        opacity="0.9"
        fontSize="88"
        fontWeight="600"
        letterSpacing="2"
        fontFamily="var(--font-geist-sans), system-ui, sans-serif"
      >
        {initials(name)}
      </text>
    </svg>
  );
}
