import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionPos } from "../timing";
import { display, mono, palette } from "../theme";

// A comic narration box: bone paper, ink text, hard ink drop shadow, a slight
// alternating tilt. It stamps in with a small spring at frame 0 (the chunk's
// audio start) and holds for the Sequence's duration. Positioned in a corner or
// third of the frame, never bottom-centered like a subtitle. One shows at a time.
export const CaptionBox: React.FC<{
  text: string;
  variant: "mono" | "serif";
  rotate: number; // settled tilt, 1..3 degrees
  pos: CaptionPos;
  maxWidth: number;
}> = ({ text, variant, rotate, pos, maxWidth }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Stamp spring: quick scale punch with a touch of overshoot.
  const s = spring({ frame, fps, config: { damping: 10, stiffness: 200, mass: 0.6 } });
  const scale = interpolate(s, [0, 0.65, 1], [0.55, 1.06, 1]);
  // Rotate settles from a slightly stronger tilt into the resting angle.
  const rot = interpolate(s, [0, 1], [rotate * 1.9, rotate]);
  // Brief ink flash on the stamp.
  const flash = interpolate(frame, [0, 1, 3], [0.5, 0.28, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isSerif = variant === "serif";

  return (
    <div
      style={{
        position: "absolute",
        ...pos,
        maxWidth,
        transform: `rotate(${rot}deg) scale(${scale})`,
        transformOrigin: pos.right !== undefined ? "top right" : "top left",
        backgroundColor: palette.bone,
        border: `3px solid ${palette.ink}`,
        borderRadius: 4,
        padding: isSerif ? "14px 26px 18px" : "15px 24px",
        // Hard ink drop shadow reads as the comic offset.
        boxShadow: `10px 12px 0 ${palette.ink}`,
        fontFamily: isSerif ? display : mono,
        fontWeight: isSerif ? 900 : 600,
        fontSize: isSerif ? 46 : 30,
        lineHeight: isSerif ? 1.08 : 1.28,
        letterSpacing: isSerif ? 0.5 : 0.3,
        color: palette.ink,
        overflow: "hidden",
      }}
    >
      {text}
      {/* Stamp flash. */}
      <div style={{ position: "absolute", inset: 0, backgroundColor: "#fff", opacity: flash, pointerEvents: "none" }} />
    </div>
  );
};
