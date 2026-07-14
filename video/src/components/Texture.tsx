import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

// Halftone dot field: a tiled radial-gradient of ink dots, multiplied over the
// scene at low opacity. A faint per-frame flicker keeps it alive.
export const Halftone: React.FC<{ opacity?: number; flicker?: boolean; size?: number }> = ({
  opacity = 0.14,
  flicker = false,
  size = 6,
}) => {
  const frame = useCurrentFrame();
  const f = flicker
    ? opacity * interpolate(Math.sin(frame / 3), [-1, 1], [0.75, 1.15])
    : opacity;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: "multiply",
        opacity: f,
        backgroundImage: `radial-gradient(#25341f ${size * 0.28}px, transparent ${
          size * 0.29
        }px)`,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
};

// Deterministic film grain. The noise tile is a static SVG turbulence data URI;
// we jitter its offset from the frame number so it crawls instead of freezing,
// which a CSS animation cannot do under Remotion's frame-by-frame render.
const NOISE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>` +
      `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>` +
      `<feColorMatrix type='saturate' values='0'/></filter>` +
      `<rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  );

export const FilmGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => {
  const frame = useCurrentFrame();
  // Cheap deterministic pseudo-random offsets per frame.
  const x = (Math.sin(frame * 12.9898) * 43758.5453) % 90;
  const y = (Math.sin(frame * 78.233) * 12543.877) % 90;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: "overlay",
        opacity,
        backgroundImage: `url("${NOISE}")`,
        backgroundRepeat: "repeat",
        backgroundPosition: `${x}px ${y}px`,
      }}
    />
  );
};

// Common texture stack used across scenes 1,2,4,5,6.
export const ComicTexture: React.FC<{ halftone?: number; flicker?: boolean }> = ({
  halftone = 0.14,
  flicker = false,
}) => (
  <>
    <Halftone opacity={halftone} flicker={flicker} />
    <FilmGrain />
  </>
);
