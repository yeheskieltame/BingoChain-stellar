import { AbsoluteFill, Sequence } from "remotion";
import { SlamPanel } from "../components/SlamPanel";
import { ComicTexture } from "../components/Texture";
import { palette, s2Panels, sceneById } from "../timing";

const DUR = sceneById("s2").duration;

// The solution: four panels, faster cuts. Sealed envelope, closing vault,
// constellation of nodes, gavel on the tape reel.
const panels = [
  { src: "stills/a4-sealed-envelope.png", focusX: 50, focusY: 45 },
  { src: "stills/a5-vault.png", focusX: 52, focusY: 48 },
  { src: "stills/a6-network.png", focusX: 50, focusY: 40 },
  { src: "stills/a7-replay-gavel.png", focusX: 48, focusY: 52 },
];

export const Scene2: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: palette.felt }}>
    {panels.map((p, i) => {
      const start = s2Panels[i];
      const end = i < panels.length - 1 ? s2Panels[i + 1] : DUR;
      return (
        <Sequence key={i} from={start} durationInFrames={end - start}>
          <SlamPanel src={p.src} index={i} focusX={p.focusX} focusY={p.focusY} />
        </Sequence>
      );
    })}
    <ComicTexture halftone={0.14} />
  </AbsoluteFill>
);
