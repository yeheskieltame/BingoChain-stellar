import { AbsoluteFill, Sequence } from "remotion";
import { captions } from "../timing";
import { CaptionBox } from "./CaptionBox";

// Global overlay of the comic caption boxes. Rendered above every scene (and
// above the scene-3 zoom transform) so the boxes stay pinned to the felt margin
// while the imagery moves. Each box runs for its chunk length plus the hold; the
// boxes never overlap in time, so only one is on screen at a time.
export const Captions: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {captions.map((c) => (
      <Sequence key={c.id} from={c.start} durationInFrames={c.hold} name={`cap-${c.id}`}>
        <AbsoluteFill>
          <CaptionBox text={c.text} variant={c.variant} rotate={c.rotate} pos={c.pos} maxWidth={c.maxWidth} />
        </AbsoluteFill>
      </Sequence>
    ))}
  </AbsoluteFill>
);
