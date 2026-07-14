import { Audio, interpolate, Sequence, staticFile } from "remotion";
import {
  duckWindows,
  MUSIC_TAIL_BASE,
  MUSIC_TAIL_START,
  MUSIC_TENSE_BASE,
  MUSIC_TENSE_DUCK,
  MUSIC_TENSE_END,
  sfxCues,
  TOTAL_FRAMES,
  vos,
} from "../timing";

const RAMP = 8; // frames to duck in/out around each VO

// Tense bed volume: base 0.22, ducking to 0.12 whenever a VO is under it, with
// 8-frame ramps. Frame is global (the bed starts at frame 0).
const tenseVolume = (f: number): number => {
  let v = MUSIC_TENSE_BASE;
  for (const [a, b] of duckWindows) {
    if (f < a - RAMP || f > b + RAMP) continue;
    let level: number;
    if (f < a) level = interpolate(f, [a - RAMP, a], [MUSIC_TENSE_BASE, MUSIC_TENSE_DUCK]);
    else if (f <= b) level = MUSIC_TENSE_DUCK;
    else level = interpolate(f, [b, b + RAMP], [MUSIC_TENSE_DUCK, MUSIC_TENSE_BASE]);
    v = Math.min(v, level);
  }
  return v;
};

const TAIL_DUR = TOTAL_FRAMES - MUSIC_TAIL_START;
// Finale bed: 0.35, fading to silence 30 frames before the end so the film
// closes on ~1s of clean room tone.
const tailVolume = (f: number): number => {
  const fadeIn = interpolate(f, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(f, [TAIL_DUR - 38, TAIL_DUR - 30], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return MUSIC_TAIL_BASE * fadeIn * fadeOut;
};

export const Mix: React.FC = () => (
  <>
    {/* Tense percussive bed under scenes 1..5, ducking under every VO. */}
    <Sequence from={0} durationInFrames={MUSIC_TENSE_END} name="music-tense">
      <Audio src={staticFile("music/music-tense-loop.wav")} volume={tenseVolume} />
    </Sequence>

    {/* Triumphant brass tail over the CTA, faded to a silent tail. */}
    <Sequence from={MUSIC_TAIL_START} durationInFrames={TAIL_DUR} name="music-tail">
      <Audio src={staticFile("music/music-tail.wav")} loop volume={tailVolume} />
    </Sequence>

    {/* Narration at full level. */}
    {vos.map((v, i) => (
      <Sequence key={`vo${i}`} from={v.start} durationInFrames={v.durFrames} name={v.file}>
        <Audio src={staticFile(v.file)} volume={1} />
      </Sequence>
    ))}

    {/* SFX. Each plays out its own length from its cue frame. */}
    {sfxCues.map((s, i) => (
      <Sequence key={`sfx${i}`} from={s.at} name={s.file}>
        <Audio src={staticFile(s.file)} volume={s.volume} playbackRate={s.playbackRate ?? 1} />
      </Sequence>
    ))}
  </>
);
