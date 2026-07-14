// The whole edit, in one place. All frame counts are at 30 fps. VO frame
// lengths are the ffprobe-measured durations of the wavs, rounded. Scene
// lengths are those VO lengths plus breathing room; scene 3 is built from the
// gameplay cues (cues.json) via the segment table below.

// Re-exported here so scenes pull palette/type and timing from one config hub.
export { palette, display, mono } from "./theme";

export const FPS = 30;

// ---- Scenes -------------------------------------------------------------
type SceneDef = { id: string; duration: number };
const sceneDefs: SceneDef[] = [
  { id: "s1", duration: 495 }, // 16.5s  the problem
  { id: "s2", duration: 675 }, // 22.5s  the solution
  { id: "s3", duration: 720 }, // 24.0s  gameplay
  { id: "s4", duration: 435 }, // 14.5s  takeaways
  { id: "s5", duration: 465 }, // 15.5s  innovation
  { id: "s6", duration: 480 }, // 16.0s  cta (last ~30f silent)
];

export type Scene = { id: string; start: number; duration: number; end: number };
export const scenes: Scene[] = (() => {
  let acc = 0;
  return sceneDefs.map((s) => {
    const scene = { id: s.id, start: acc, duration: s.duration, end: acc + s.duration };
    acc += s.duration;
    return scene;
  });
})();

export const sceneById = (id: string): Scene => {
  const s = scenes.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scene ${id}`);
  return s;
};

export const TOTAL_FRAMES = scenes[scenes.length - 1].end; // 3270 = 1:49

// ---- Voice over ---------------------------------------------------------
// start is scene-local; global is derived. durFrames = measured wav length.
type VoDef = { file: string; scene: string; localStart: number; durFrames: number };
const voDefs: VoDef[] = [
  { file: "vo/vo-s1.wav", scene: "s1", localStart: 18, durFrames: 362 },
  { file: "vo/vo-s2.wav", scene: "s2", localStart: 15, durFrames: 553 },
  { file: "vo/vo-s3a.wav", scene: "s3", localStart: 20, durFrames: 104 },
  { file: "vo/vo-s3b.wav", scene: "s3", localStart: 190, durFrames: 129 },
  { file: "vo/vo-s3c.wav", scene: "s3", localStart: 458, durFrames: 68 },
  { file: "vo/vo-s3d.wav", scene: "s3", localStart: 528, durFrames: 175 },
  { file: "vo/vo-s4.wav", scene: "s4", localStart: 15, durFrames: 310 },
  { file: "vo/vo-s5.wav", scene: "s5", localStart: 18, durFrames: 330 },
  { file: "vo/vo-s6.wav", scene: "s6", localStart: 18, durFrames: 294 },
];

export type Vo = { file: string; start: number; durFrames: number };
export const vos: Vo[] = voDefs.map((v) => ({
  file: v.file,
  start: sceneById(v.scene).start + v.localStart,
  durFrames: v.durFrames,
}));

// Duck windows for the tense music bed: every VO that plays under scenes 1..5.
// vo-s6 sits over the tail bed instead, so it is excluded here.
export const duckWindows: Array<[number, number]> = vos
  .filter((v) => v.start < sceneById("s6").start)
  .map((v) => [v.start, v.start + v.durFrames]);

// ---- Scene 3 time remap -------------------------------------------------
// Built from cues.json. Video segments name a source start (seconds) and a
// playback speed; their output length is (span/speed). Freeze segments hold a
// pre-extracted still. Cumulative output must equal scene 3's duration (720).
export type Seg =
  | { kind: "video"; srcStart: number; speed: number; dur: number }
  | { kind: "still"; still: string; dur: number };

export const s3Segments: Seg[] = [
  { kind: "video", srcStart: 0.209, speed: 1.0, dur: 183 }, // lobby -> setup -> commit
  { kind: "video", srcStart: 6.319, speed: 1.4, dur: 136 }, // first calls, mid speed
  { kind: "video", srcStart: 12.643, speed: 0.5, dur: 45 }, // first strike, slow mo
  { kind: "still", still: "gameplay/frame-strike.png", dur: 15 }, // freeze, SLASH lands
  { kind: "video", srcStart: 13.393, speed: 1.4, dur: 106 }, // meter fills B BI BIN
  { kind: "video", srcStart: 18.359, speed: 1.0, dur: 43 }, // meter-3 -> meter-4
  { kind: "video", srcStart: 19.785, speed: 0.5, dur: 37 }, // bingo, slow mo
  { kind: "still", still: "gameplay/frame-bingo.png", dur: 18 }, // freeze, BINGO! lands
  { kind: "video", srcStart: 20.4, speed: 1.0, dur: 34 }, // auto-claim -> settled
  { kind: "still", still: "gameplay/frame-settled.png", dur: 103 }, // hold the win
];

// Scene-3-local frames for overlays and accents, derived from the segment
// starts above. Kept as named constants so scenes and mix stay in sync.
export const s3 = {
  slashAt: 364, // seg4 (strike freeze) start
  bingoAt: 565, // seg8 (bingo freeze) start
  punchFirstCall: 213, // inside seg2, source first-call 7.741s
  punchMeter4: 528, // seg6 end, source meter-4 19.785s
  punchSettled: 583, // seg9 start, source settled
  bassLetters: [424, 485, 528], // meter-2, meter-3, meter-4
  riserAt: 424, // meter-2
  fanfareAt: 583, // settled
  heartbeatAt: 379, // meter run, tension
  thocks: [213, 245, 285, 405, 450], // call beats we accent (5)
  whooshes: [213, 528, 583], // per punch-in zoom
} as const;

// ---- SFX schedule (global frames) --------------------------------------
export type Sfx = { file: string; at: number; volume: number; playbackRate?: number };
const S1 = sceneById("s1").start;
const S2 = sceneById("s2").start;
const S3 = sceneById("s3").start;
const S4 = sceneById("s4").start;
const S5 = sceneById("s5").start;
const S6 = sceneById("s6").start;

// Scene 2 panel beats (local): envelope, vault, network, gavel.
export const s2Panels = [8, 160, 320, 470];
// Scene 1 panel beats (local): hand, puppet, server.
export const s1Panels = [0, 165, 330];
// Scene 4 card slam beats (local).
export const s4Cards = [12, 112, 212];
// Scene 6 title reveal beat (local).
export const s6Reveal = 12;

export const sfxCues: Sfx[] = [
  // Scene 1: heartbeat bed (two hits cover 16.5s) + ink slam per panel.
  { file: "sfx/sfx-heartbeat.wav", at: S1 + 0, volume: 0.3 },
  { file: "sfx/sfx-heartbeat.wav", at: S1 + 255, volume: 0.3 },
  { file: "sfx/sfx-slam.wav", at: S1 + s1Panels[0], volume: 0.5 },
  { file: "sfx/sfx-slam.wav", at: S1 + s1Panels[1], volume: 0.5 },
  { file: "sfx/sfx-slam.wav", at: S1 + s1Panels[2], volume: 0.5 },

  // Scene 2: slam per panel + the storyboard's stamp/vault/chain, bass on last.
  { file: "sfx/sfx-slam.wav", at: S2 + s2Panels[0], volume: 0.5 },
  { file: "sfx/sfx-stamp.wav", at: S2 + s2Panels[0], volume: 0.55 },
  { file: "sfx/sfx-slam.wav", at: S2 + s2Panels[1], volume: 0.5 },
  { file: "sfx/sfx-vault.wav", at: S2 + s2Panels[1], volume: 0.5 },
  { file: "sfx/sfx-slam.wav", at: S2 + s2Panels[2], volume: 0.5 },
  { file: "sfx/sfx-chain.wav", at: S2 + s2Panels[2], volume: 0.5 },
  { file: "sfx/sfx-slam.wav", at: S2 + s2Panels[3], volume: 0.5 },
  { file: "sfx/sfx-bass.wav", at: S2 + s2Panels[3], volume: 0.5 },

  // Scene 3: heartbeat, riser, bass on meter letters, thocks, whooshes,
  // slam on each onomatopoeia land, fanfare at the settle.
  { file: "sfx/sfx-heartbeat.wav", at: S3 + s3.heartbeatAt, volume: 0.22 },
  { file: "sfx/sfx-riser.wav", at: S3 + s3.riserAt, volume: 0.4 },
  { file: "sfx/sfx-bass.wav", at: S3 + s3.bassLetters[0], volume: 0.45 },
  { file: "sfx/sfx-bass.wav", at: S3 + s3.bassLetters[1], volume: 0.45 },
  { file: "sfx/sfx-bass.wav", at: S3 + s3.bassLetters[2], volume: 0.45 },
  ...s3.thocks.map((t) => ({ file: "sfx/sfx-thock.wav", at: S3 + t, volume: 0.6 })),
  ...s3.whooshes.map((w) => ({ file: "sfx/sfx-whoosh.wav", at: S3 + w, volume: 0.35 })),
  { file: "sfx/sfx-slam.wav", at: S3 + s3.slashAt, volume: 0.5 },
  { file: "sfx/sfx-slam.wav", at: S3 + s3.bingoAt, volume: 0.5 },
  { file: "sfx/sfx-fanfare.wav", at: S3 + s3.fanfareAt, volume: 0.6 },

  // Scene 4: three escalating slams under the takeaway cards.
  { file: "sfx/sfx-slam.wav", at: S4 + s4Cards[0], volume: 0.4 },
  { file: "sfx/sfx-slam.wav", at: S4 + s4Cards[1], volume: 0.5 },
  { file: "sfx/sfx-slam.wav", at: S4 + s4Cards[2], volume: 0.6 },

  // Scene 5: single low piano sting.
  { file: "sfx/sfx-sting.wav", at: S5 + 8, volume: 0.5 },

  // Scene 6: final slam on the title, fanfare tail behind the CTA.
  { file: "sfx/sfx-slam.wav", at: S6 + s6Reveal, volume: 0.6 },
  { file: "sfx/sfx-fanfare.wav", at: S6 + s6Reveal + 6, volume: 0.45 },
];

// Music beds.
export const MUSIC_TENSE_START = 0;
export const MUSIC_TENSE_END = sceneById("s6").start; // under scenes 1..5
export const MUSIC_TENSE_BASE = 0.22;
export const MUSIC_TENSE_DUCK = 0.12;
export const MUSIC_TAIL_START = sceneById("s6").start; // finale bed
export const MUSIC_TAIL_BASE = 0.35;
