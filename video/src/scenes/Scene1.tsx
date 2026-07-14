import { AbsoluteFill, Sequence } from "remotion";
import { SlamPanel } from "../components/SlamPanel";
import { ComicTexture } from "../components/Texture";
import { palette, s1Panels, sceneById } from "../timing";

const DUR = sceneById("s1").duration;

// The problem: three noir panels slam in one by one, each holding on a slow
// push. Hand over the machine, puppet-string balls, the server's single eye.
const panels = [
  { src: "stills/a1-shadow-hand.png", focusX: 60, focusY: 38 },
  { src: "stills/a2-puppet-balls.png", focusX: 48, focusY: 32 },
  { src: "stills/a3-server-eye.png", focusX: 56, focusY: 50 },
];

export const Scene1: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: palette.felt }}>
    {panels.map((p, i) => {
      const start = s1Panels[i];
      const end = i < panels.length - 1 ? s1Panels[i + 1] : DUR;
      return (
        <Sequence key={i} from={start} durationInFrames={end - start}>
          <SlamPanel src={p.src} index={i} focusX={p.focusX} focusY={p.focusY} />
        </Sequence>
      );
    })}
    <ComicTexture halftone={0.16} flicker />
  </AbsoluteFill>
);
