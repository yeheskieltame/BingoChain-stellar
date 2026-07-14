import { AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { ComicTexture } from "../components/Texture";
import { mono, palette, sceneById } from "../timing";

const DUR = sceneById("s5").duration;

// Slow drifting dust motes over the felt.
const Motes: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: 16 }).map((_, i) => {
        const x = random(`mx${i}`) * 100;
        const speed = 0.15 + random(`ms${i}`) * 0.3;
        const y = (100 - ((f * speed + random(`mo${i}`) * 120) % 120)) % 100;
        const size = 2 + random(`md${i}`) * 4;
        const op = 0.08 + random(`ma${i}`) * 0.22;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: palette.bone,
              opacity: op,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// The key innovation: the split panel (wax envelope, tape reel, brass thread).
// A gentle push, not a slam, with dust in the light.
export const Scene5: React.FC = () => {
  const f = useCurrentFrame();
  const fade = interpolate(f, [0, 22], [0, 1], { extrapolateRight: "clamp" });
  const ken = interpolate(f, [0, DUR], [1.02, 1.08], { extrapolateRight: "clamp" });
  const captionIn = interpolate(f, [70, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: palette.felt }}>
      <div
        style={{
          position: "absolute",
          inset: 54,
          borderRadius: 6,
          overflow: "hidden",
          border: `4px solid ${palette.bone}`,
          boxShadow: `14px 16px 0 rgba(0,0,0,0.45)`,
          backgroundColor: palette.ink,
          opacity: fade,
        }}
      >
        <Img
          src={staticFile("stills/a8-innovation-split.png")}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${ken})`, transformOrigin: "50% 50%" }}
        />
        <AbsoluteFill style={{ pointerEvents: "none", boxShadow: `inset 0 0 220px 60px rgba(5,12,8,0.5)` }} />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 90,
          width: "100%",
          textAlign: "center",
          fontFamily: mono,
          fontSize: 30,
          letterSpacing: 10,
          color: palette.brass,
          opacity: captionIn,
        }}
      >
        COMMIT. THEN REVEAL.
      </div>

      <Motes />
      <ComicTexture halftone={0.12} />
    </AbsoluteFill>
  );
};
