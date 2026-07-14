import { AbsoluteFill, Sequence } from "remotion";
import { TakeawayCard } from "../components/TakeawayCard";
import { ComicTexture } from "../components/Texture";
import { palette, s4Cards, sceneById } from "../timing";

const DUR = sceneById("s4").duration;

// Three takeaway cards slam onto the felt, left then center then right.
const cards = [
  { title: "Sealed Boards", sub: "Every strategy stays secret.", left: "17%" },
  { title: "Staked in Escrow", sub: "The chain holds the pot.", left: "50%" },
  { title: "Settled by Replay", sub: "Truth is computed, not claimed.", left: "83%" },
];

export const Scene4: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: palette.felt }}>
    {cards.map((c, i) => (
      <Sequence key={i} from={s4Cards[i]} durationInFrames={DUR - s4Cards[i]}>
        <AbsoluteFill>
          <div style={{ position: "absolute", left: c.left, top: "50%", transform: "translate(-50%, -50%)" }}>
            <TakeawayCard title={c.title} sub={c.sub} index={i} />
          </div>
        </AbsoluteFill>
      </Sequence>
    ))}
    <ComicTexture halftone={0.12} />
  </AbsoluteFill>
);
