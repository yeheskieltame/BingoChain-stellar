import { Composition } from "remotion";

// Placeholder frame for the skeleton. The real film swaps this for the
// scene compositions described in video/storyboard.md.
function Placeholder() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0d1f15",
        color: "#ede5cd",
        fontSize: 64,
        fontFamily: "sans-serif",
      }}
    >
      BingoChain Stellar
    </div>
  );
}

export function RemotionRoot() {
  return (
    <Composition
      id="Film"
      component={Placeholder}
      durationInFrames={30 * 30}
      fps={30}
      width={1920}
      height={1080}
    />
  );
}
