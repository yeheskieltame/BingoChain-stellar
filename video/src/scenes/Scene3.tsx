import {
  AbsoluteFill,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  Series,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { ComicFrame } from "../components/ComicFrame";
import { Onomatopoeia } from "../components/Onomatopoeia";
import { FPS, palette, s3, s3Segments } from "../timing";

const TAKE = "gameplay/take.mp4";
const cover: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

// Punch-in zoom toward the board on first-call, meter-4 and the settled screen.
const zooms = [
  { at: s3.punchFirstCall, ox: "42%", oy: "56%", last: false },
  { at: s3.punchMeter4, ox: "50%", oy: "48%", last: false },
  { at: s3.punchSettled, ox: "50%", oy: "50%", last: true },
];

const computeZoom = (f: number) => {
  let best = { scale: 1, ox: "50%", oy: "50%" };
  for (const z of zooms) {
    const sc = z.last
      ? interpolate(f, [z.at - 3, z.at + 7], [1, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : interpolate(f, [z.at - 3, z.at + 7, z.at + 26, z.at + 40], [1, 1.15, 1.15, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
    if (sc > best.scale) best = { scale: sc, ox: z.ox, oy: z.oy };
  }
  return best;
};

// Lacquer edge vignette that pulses while the meter fills toward the win.
const EdgePulse: React.FC = () => {
  const f = useCurrentFrame();
  const inWindow = f >= s3.riserAt && f <= s3.bingoAt + 20;
  const pulse = inWindow ? interpolate(Math.sin((f - s3.riserAt) / 3.5), [-1, 1], [0.15, 0.55]) : 0;
  return (
    <AbsoluteFill
      style={{ pointerEvents: "none", boxShadow: `inset 0 0 160px 30px ${palette.lacquer}`, opacity: pulse }}
    />
  );
};

export const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = computeZoom(frame);

  return (
    <AbsoluteFill style={{ backgroundColor: palette.felt }}>
      <ComicFrame margin={46}>
        <AbsoluteFill style={{ transform: `scale(${zoom.scale})`, transformOrigin: `${zoom.ox} ${zoom.oy}` }}>
          <Series>
            {s3Segments.map((seg, i) =>
              seg.kind === "video" ? (
                <Series.Sequence key={i} durationInFrames={seg.dur}>
                  <OffthreadVideo
                    src={staticFile(TAKE)}
                    trimBefore={Math.round(seg.srcStart * FPS)}
                    playbackRate={seg.speed}
                    muted
                    style={cover}
                  />
                </Series.Sequence>
              ) : (
                <Series.Sequence key={i} durationInFrames={seg.dur}>
                  <Img src={staticFile(seg.still)} style={cover} />
                </Series.Sequence>
              ),
            )}
          </Series>
        </AbsoluteFill>
        <EdgePulse />
      </ComicFrame>

      {/* Onomatopoeia land over the whole frame. Both are brief comic flashes
          over their freeze; BINGO! punches out so the claim and settle show. */}
      <Sequence from={s3.slashAt} durationInFrames={46}>
        <Onomatopoeia word="SLASH" tilt={-6} size={280} x={50} y={34} />
      </Sequence>
      <Sequence from={s3.bingoAt} durationInFrames={s3.bingoHold}>
        <Onomatopoeia word="BINGO!" tilt={-5} size={340} x={50} y={44} />
      </Sequence>
    </AbsoluteFill>
  );
};
