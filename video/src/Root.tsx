import { Composition } from "remotion";
import "./fonts";
import { Film } from "./Film";
import { FPS, TOTAL_FRAMES } from "./timing";

export function RemotionRoot() {
  return (
    <Composition
      id="Film"
      component={Film}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
}
