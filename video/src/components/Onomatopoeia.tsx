import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { display, palette } from "../theme";

// Big comic word that spring-pops onto the frame with a tilt and a few frames
// of shake on land. Bone fill, lacquer stroke, hard halftone-style shadow.
export const Onomatopoeia: React.FC<{
  word: string;
  tilt?: number;
  size?: number;
  x?: number; // center, % of width
  y?: number; // center, % of height
}> = ({ word, tilt = -5, size = 300, x = 50, y = 44 }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const pop = spring({ frame, fps, config: { damping: 9, stiffness: 180, mass: 0.6 } });
  const overshoot = interpolate(pop, [0, 0.6, 1], [0.2, 1.12, 1]);

  // Punch out over the last 8 frames so a brief flash does not linger.
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitScale = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 7-frame land shake.
  const shakeAmt = interpolate(frame, [0, 7], [1, 0], { extrapolateRight: "clamp" });
  const sx = (random(`sx${Math.floor(frame)}`) - 0.5) * 22 * shakeAmt;
  const sy = (random(`sy${Math.floor(frame)}`) - 0.5) * 22 * shakeAmt;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", pointerEvents: "none", opacity: exit }}>
      <div
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(-50%, -50%) translate(${sx}px, ${sy}px) rotate(${tilt}deg) scale(${overshoot * exitScale})`,
          fontFamily: display,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1,
          color: palette.bone,
          WebkitTextStroke: `10px ${palette.lacquer}`,
          paintOrder: "stroke fill",
          // Hard offset shadow reads as the halftone drop.
          textShadow: `10px 12px 0 ${palette.ink}, 18px 22px 0 rgba(213,170,82,0.5)`,
          letterSpacing: 2,
          whiteSpace: "nowrap",
        }}
      >
        {word}
      </div>
    </AbsoluteFill>
  );
};
