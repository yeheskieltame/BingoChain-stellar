import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ComicTexture } from "../components/Texture";
import { display, mono, palette, s6Reveal, sceneById } from "../timing";

const DUR = sceneById("s6").duration;

// Call to action: the bingo ball bursts into halftone confetti behind the
// title, which slams in on the felt. Gentle push through the hold.
export const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const burstScale = interpolate(frame, [s6Reveal, s6Reveal + 30, DUR], [0.65, 1.02, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const burstOpacity = interpolate(frame, [s6Reveal, s6Reveal + 22], [0, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const s = spring({ frame: frame - s6Reveal, fps, config: { damping: 12, stiffness: 130, mass: 0.8 } });
  const titleScale = interpolate(s, [0, 1], [1.16, 1]);
  const titleRise = interpolate(s, [0, 1], [30, 0]);
  const flash = interpolate(frame, [s6Reveal, s6Reveal + 1, s6Reveal + 2], [0.85, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const push = interpolate(frame, [s6Reveal, DUR], [1, 1.03], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: palette.felt }}>
      {/* Confetti burst behind the type. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Img
          src={staticFile("stills/a9-cta-burst.png")}
          style={{
            width: "78%",
            objectFit: "contain",
            opacity: burstOpacity,
            transform: `scale(${burstScale})`,
            mixBlendMode: "screen",
          }}
        />
      </AbsoluteFill>

      <ComicTexture halftone={0.12} />

      {/* Title stack. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            transform: `translateY(${titleRise}px) scale(${titleScale * push})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: display,
              fontWeight: 900,
              fontSize: 132,
              lineHeight: 1,
              color: palette.bone,
              letterSpacing: 2,
              textShadow: `6px 8px 0 ${palette.ink}`,
            }}
          >
            BINGOCHAIN STELLAR
          </div>
          <div style={{ width: 640, height: 8, backgroundColor: palette.brass, margin: "34px 0 30px" }} />
          <div style={{ fontFamily: mono, fontSize: 46, color: palette.brass, letterSpacing: 2 }}>
            bingochain-stellar.vercel.app
          </div>
          <div style={{ fontFamily: mono, fontSize: 30, color: palette.bone, marginTop: 22, opacity: 0.85 }}>
            Practice free. No wallet needed.
          </div>
        </div>
      </AbsoluteFill>

      {/* Final slam flash. */}
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
