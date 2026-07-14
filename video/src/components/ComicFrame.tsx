import { AbsoluteFill } from "remotion";
import { palette } from "../theme";

// Bone-bordered comic panel on a felt margin with brass corner ticks. Wraps the
// scene-3 gameplay so the screen recording reads as one drawn panel.
export const ComicFrame: React.FC<{ margin?: number; children: React.ReactNode }> = ({
  margin = 46,
  children,
}) => {
  const tick = (pos: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    width: 46,
    height: 46,
    borderColor: palette.brass,
    borderStyle: "solid",
    ...pos,
  });
  return (
    <AbsoluteFill style={{ backgroundColor: palette.felt }}>
      <div
        style={{
          position: "absolute",
          inset: margin,
          border: `4px solid ${palette.bone}`,
          borderRadius: 6,
          overflow: "hidden",
          backgroundColor: "#000",
          boxShadow: `0 0 0 2px rgba(0,0,0,0.4), 16px 18px 0 rgba(0,0,0,0.4)`,
        }}
      >
        {children}
      </div>
      {/* Brass corner ticks just inside the bone border. */}
      <div style={tick({ top: margin + 12, left: margin + 12, borderWidth: "5px 0 0 5px" })} />
      <div style={tick({ top: margin + 12, right: margin + 12, borderWidth: "5px 5px 0 0" })} />
      <div style={tick({ bottom: margin + 12, left: margin + 12, borderWidth: "0 0 5px 5px" })} />
      <div style={tick({ bottom: margin + 12, right: margin + 12, borderWidth: "0 5px 5px 0" })} />
    </AbsoluteFill>
  );
};
