import { AbsoluteFill, Sequence } from "remotion";
import { Mix } from "./audio/Mix";
import { Captions } from "./components/Captions";
import { Scene1 } from "./scenes/Scene1";
import { Scene2 } from "./scenes/Scene2";
import { Scene3 } from "./scenes/Scene3";
import { Scene4 } from "./scenes/Scene4";
import { Scene5 } from "./scenes/Scene5";
import { Scene6 } from "./scenes/Scene6";
import { palette } from "./theme";
import { scenes } from "./timing";

const sceneComponents: Record<string, React.FC> = {
  s1: Scene1,
  s2: Scene2,
  s3: Scene3,
  s4: Scene4,
  s5: Scene5,
  s6: Scene6,
};

export const Film: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: palette.felt }}>
    {scenes.map((scene) => {
      const Comp = sceneComponents[scene.id];
      return (
        <Sequence key={scene.id} from={scene.start} durationInFrames={scene.duration} name={scene.id}>
          <Comp />
        </Sequence>
      );
    })}
    {/* Comic caption boxes ride above every scene, on the felt margin. */}
    <Captions />
    <Mix />
  </AbsoluteFill>
);
