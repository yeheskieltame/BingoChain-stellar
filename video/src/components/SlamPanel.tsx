import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { palette } from "../theme";

// One comic panel: slams in (spring scale 1.15 -> 1 with a small rotation
// settle and a 2-frame white flash), then a slow Ken Burns push while it holds.
// Frame is local to the panel's Sequence.
export const SlamPanel: React.FC<{
  src: string;
  index?: number; // alternates tilt direction / origin
  inset?: number;
  focusX?: number; // ken burns drift target, 0..100
  focusY?: number;
}> = ({ src, index = 0, inset = 54, focusX = 50, focusY = 45 }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const s = spring({ frame, fps, config: { damping: 12, stiffness: 120, mass: 0.7 } });
  const slamScale = interpolate(s, [0, 1], [1.15, 1]);
  const tiltDir = index % 2 === 0 ? 1 : -1;
  const tiltMax = 2 + (index % 3); // 2..4 degrees
  const rotate = interpolate(s, [0, 1], [tiltDir * tiltMax, 0]);

  // Ken Burns push across the full hold.
  const ken = interpolate(frame, [0, durationInFrames], [1, 1.06], { extrapolateRight: "clamp" });
  const driftX = interpolate(frame, [0, durationInFrames], [0, (focusX - 50) * 0.4], { extrapolateRight: "clamp" });
  const driftY = interpolate(frame, [0, durationInFrames], [0, (focusY - 50) * 0.4], { extrapolateRight: "clamp" });

  const flash = interpolate(frame, [0, 1, 2], [0.9, 0.6, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: palette.felt }}>
      <div
        style={{
          position: "absolute",
          inset,
          borderRadius: 6,
          overflow: "hidden",
          border: `4px solid ${palette.bone}`,
          boxShadow: `14px 16px 0 rgba(0,0,0,0.45)`,
          backgroundColor: palette.ink,
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transformOrigin: `${focusX}% ${focusY}%`,
            transform: `scale(${slamScale * ken}) translate(${driftX}%, ${driftY}%) rotate(${rotate}deg)`,
          }}
        />
        {/* Hard chiaroscuro vignette to sit the still in the noir palette. */}
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            boxShadow: `inset 0 0 220px 60px rgba(5,12,8,0.55)`,
          }}
        />
        {/* 2-frame white slam flash. */}
        <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity: flash, pointerEvents: "none" }} />
      </div>
    </AbsoluteFill>
  );
};
