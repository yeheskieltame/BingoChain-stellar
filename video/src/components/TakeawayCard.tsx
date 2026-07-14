import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { display, mono, palette } from "../theme";

// A paper takeaway card that slams onto the felt: spring scale-in with a small
// tilt settle and a 2-frame flash, brass rule under an ink title. Frame is
// local to the card's Sequence.
export const TakeawayCard: React.FC<{
  title: string;
  sub: string;
  index: number;
}> = ({ title, sub, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({ frame, fps, config: { damping: 11, stiffness: 140, mass: 0.7 } });
  const scale = interpolate(s, [0, 1], [1.18, 1]);
  const tilt = interpolate(s, [0, 1], [index % 2 === 0 ? -3 : 3, 0]);
  const rise = interpolate(s, [0, 1], [40, 0]);
  const flash = interpolate(frame, [0, 1, 2], [0.8, 0.5, 0], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "relative",
        width: 460,
        height: 560,
        transform: `translateY(${rise}px) rotate(${tilt}deg) scale(${scale})`,
        backgroundColor: palette.paper,
        border: `4px solid ${palette.ink}`,
        borderRadius: 8,
        boxShadow: `12px 14px 0 rgba(0,0,0,0.45)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        overflow: "hidden",
      }}
    >
      {/* Brass cap bar. */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 22, backgroundColor: palette.brass }} />
      <div style={{ fontFamily: mono, fontSize: 26, color: palette.brass, letterSpacing: 6, marginBottom: 26 }}>
        {String(index + 1).padStart(2, "0")}
      </div>
      <div
        style={{
          fontFamily: display,
          fontWeight: 900,
          fontSize: 62,
          lineHeight: 1.02,
          color: palette.ink,
          textAlign: "center",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      <div style={{ width: 160, height: 6, backgroundColor: palette.brass, margin: "30px 0" }} />
      <div style={{ fontFamily: mono, fontSize: 24, color: palette.ink, textAlign: "center", opacity: 0.8, lineHeight: 1.4 }}>
        {sub}
      </div>
      {/* Slam flash. */}
      <div style={{ position: "absolute", inset: 0, backgroundColor: "#fff", opacity: flash }} />
    </div>
  );
};
