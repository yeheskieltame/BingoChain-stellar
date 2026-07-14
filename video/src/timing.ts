// The whole edit, in one place. All frame counts are at 30 fps. Narration is
// now ONE wav per caption chunk (captions.json); chunk frame lengths are the
// ffprobe-measured wav durations, rounded. Each chunk also drives a comic
// caption box (see captions below). Scene lengths are the chunk layout plus
// breathing room; scene 3 is built from the gameplay cues (cues.json) via the
// segment table below.

// Re-exported here so scenes pull palette/type and timing from one config hub.
export { palette, display, mono } from "./theme";

export const FPS = 30;

// The gameplay take is 25 fps but every seek here is expressed in REAL source
// seconds. Remotion trimBefore and ffmpeg -ss both address real time, so the
// mapping into the take is srcSeconds * FPS (composition frames), which lands
// on the same wall-clock moment regardless of the take's own frame rate.

// ---- Scenes -------------------------------------------------------------
type SceneDef = { id: string; duration: number };
const sceneDefs: SceneDef[] = [
  { id: "s1", duration: 560 }, // 18.7s  the problem
  { id: "s2", duration: 812 }, // 27.1s  the solution
  { id: "s3", duration: 1663 }, // 55.4s gameplay (staked take)
  { id: "s4", duration: 469 }, // 15.6s  takeaways
  { id: "s5", duration: 505 }, // 16.8s  innovation
  { id: "s6", duration: 492 }, // 16.4s  cta (last ~30f silent)
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

export const TOTAL_FRAMES = scenes[scenes.length - 1].end; // 4501 = 2:30

// ---- Voice over (one wav per caption chunk) -----------------------------
// localStart is scene-local; global start is derived. durFrames = measured wav
// length. Within a scene the chunks run sequentially with a ~12f pause between
// them, so the narration keeps the pacing the scenes were timed around.
type VoDef = { file: string; scene: string; localStart: number; durFrames: number };
const voDefs: VoDef[] = [
  { file: "vo/vo-s1-01.wav", scene: "s1", localStart: 18, durFrames: 143 },
  { file: "vo/vo-s1-02.wav", scene: "s1", localStart: 173, durFrames: 106 },
  { file: "vo/vo-s1-03.wav", scene: "s1", localStart: 291, durFrames: 115 },
  { file: "vo/vo-s1-04.wav", scene: "s1", localStart: 418, durFrames: 82 },

  { file: "vo/vo-s2-01.wav", scene: "s2", localStart: 15, durFrames: 111 },
  { file: "vo/vo-s2-02.wav", scene: "s2", localStart: 138, durFrames: 121 },
  { file: "vo/vo-s2-03.wav", scene: "s2", localStart: 271, durFrames: 182 },
  { file: "vo/vo-s2-04.wav", scene: "s2", localStart: 465, durFrames: 142 },
  { file: "vo/vo-s2-05.wav", scene: "s2", localStart: 619, durFrames: 127 },

  { file: "vo/vo-s3-01.wav", scene: "s3", localStart: 130, durFrames: 104 },
  { file: "vo/vo-s3-02.wav", scene: "s3", localStart: 280, durFrames: 125 },
  { file: "vo/vo-s3-03.wav", scene: "s3", localStart: 470, durFrames: 129 },
  { file: "vo/vo-s3-04.wav", scene: "s3", localStart: 850, durFrames: 68 },
  { file: "vo/vo-s3-05.wav", scene: "s3", localStart: 1150, durFrames: 88 },
  { file: "vo/vo-s3-06.wav", scene: "s3", localStart: 1410, durFrames: 113 },

  { file: "vo/vo-s4-01.wav", scene: "s4", localStart: 15, durFrames: 99 },
  { file: "vo/vo-s4-02.wav", scene: "s4", localStart: 126, durFrames: 118 },
  { file: "vo/vo-s4-03.wav", scene: "s4", localStart: 256, durFrames: 147 },

  { file: "vo/vo-s5-01.wav", scene: "s5", localStart: 18, durFrames: 105 },
  { file: "vo/vo-s5-02.wav", scene: "s5", localStart: 135, durFrames: 141 },
  { file: "vo/vo-s5-03.wav", scene: "s5", localStart: 288, durFrames: 145 },

  { file: "vo/vo-s6-01.wav", scene: "s6", localStart: 18, durFrames: 128 },
  { file: "vo/vo-s6-02.wav", scene: "s6", localStart: 158, durFrames: 120 },
  { file: "vo/vo-s6-03.wav", scene: "s6", localStart: 290, durFrames: 106 },
];

export type Vo = { file: string; start: number; durFrames: number };
export const vos: Vo[] = voDefs.map((v) => ({
  file: v.file,
  start: sceneById(v.scene).start + v.localStart,
  durFrames: v.durFrames,
}));

// Duck windows for the tense music bed: every VO that plays under scenes 1..5.
// The scene 6 chunks sit over the tail bed instead, so they are excluded here.
export const duckWindows: Array<[number, number]> = vos
  .filter((v) => v.start < sceneById("s6").start)
  .map((v) => [v.start, v.start + v.durFrames]);

// ---- Comic caption boxes ------------------------------------------------
// One paper box per chunk, verbatim text from captions.json. The box stamps in
// at the chunk's audio start and holds until the chunk ends plus CAPTION_HOLD.
// Position is a corner/third inset (px, 1920x1080), never bottom-centered; on
// scene 3 the boxes sit on the felt margin, clear of the board and the meter.
// Exception: the scene 6 URL chunk (vo-s6-03) carries NO box; the title card's
// brass plate already shows the URL.
export const CAPTION_HOLD = 12;

export type CaptionPos = { top?: number; bottom?: number; left?: number; right?: number };
export type Caption = {
  id: string;
  start: number; // global frame
  hold: number; // durFrames + CAPTION_HOLD
  text: string;
  variant: "mono" | "serif";
  rotate: number; // 1..3 degrees, alternating sign
  pos: CaptionPos;
  maxWidth: number;
};

// Text is verbatim from assets/audio/vo/captions.json. No em or en dashes.
type CapDef = {
  id: string;
  text: string;
  variant: "mono" | "serif";
  rotate: number;
  pos: CaptionPos;
  maxWidth?: number;
};
const capDefs: CapDef[] = [
  // Scene 1: noir panels, one at a time, corners and thirds.
  { id: "vo-s1-01", text: "Every online game of chance asks the same favour. Trust the house.", variant: "mono", rotate: 2, pos: { top: 66, left: 96 } },
  { id: "vo-s1-02", text: "But you never see the shuffle. You never see the draw.", variant: "mono", rotate: -2, pos: { top: 66, right: 96 } },
  { id: "vo-s1-03", text: "Somewhere behind the felt, a server decides your luck.", variant: "mono", rotate: 3, pos: { bottom: 150, right: 110 } },
  { id: "vo-s1-04", text: "And you simply hope it plays fair.", variant: "serif", rotate: -2, pos: { top: 250, left: 110 } },

  // Scene 2: four panels, faster.
  { id: "vo-s2-01", text: "BingoChain Stellar takes the house out of the game.", variant: "mono", rotate: 2, pos: { top: 66, left: 96 } },
  { id: "vo-s2-02", text: "No dealer. No server randomness. Nothing to rig.", variant: "mono", rotate: -3, pos: { top: 66, right: 96 } },
  { id: "vo-s2-03", text: "You seal a secret board in a cryptographic envelope. The contract locks every stake in escrow.", variant: "mono", rotate: 2, pos: { bottom: 120, left: 100 }, maxWidth: 620 },
  { id: "vo-s2-04", text: "When the round ends, it replays every call to crown the winner.", variant: "mono", rotate: -2, pos: { top: 250, right: 110 } },
  { id: "vo-s2-05", text: "Cheating does not lose the argument here. It loses the pot.", variant: "serif", rotate: 2, pos: { bottom: 150, right: 110 } },

  // Scene 3: felt margin only, clear of the board (center-left) and the meter.
  { id: "vo-s3-01", text: "Arrange your 25 numbers. Then play.", variant: "mono", rotate: 2, pos: { top: 70, left: 96 }, maxWidth: 440 },
  { id: "vo-s3-02", text: "Two rivals take their seats. Real stakes on the line.", variant: "mono", rotate: -2, pos: { top: 70, right: 96 }, maxWidth: 440 },
  { id: "vo-s3-03", text: "Every call is a move. Every line, a blade getting closer.", variant: "mono", rotate: 3, pos: { bottom: 120, right: 96 }, maxWidth: 440 },
  { id: "vo-s3-04", text: "Three lines. Four.", variant: "serif", rotate: -2, pos: { top: 70, left: 96 }, maxWidth: 360 },
  { id: "vo-s3-05", text: "BINGO. The claim fires itself.", variant: "serif", rotate: 2, pos: { top: 70, right: 96 }, maxWidth: 400 },
  { id: "vo-s3-06", text: "The contract checks the tape. The pot is yours.", variant: "mono", rotate: -2, pos: { bottom: 130, left: 96 }, maxWidth: 440 },

  // Scene 4: three takeaway cards fill the center band; boxes ride the top strip.
  { id: "vo-s4-01", text: "Sealed boards keep every strategy secret.", variant: "mono", rotate: 2, pos: { top: 60, left: 96 } },
  { id: "vo-s4-02", text: "Escrowed stakes: nobody holds your money but the chain.", variant: "mono", rotate: -2, pos: { top: 60, right: 96 } },
  { id: "vo-s4-03", text: "Settlement by replay: the truth is computed, never claimed.", variant: "mono", rotate: 2, pos: { top: 60, left: 96 } },

  // Scene 5: split panel; keep the bottom-center brass label clear.
  { id: "vo-s5-01", text: "The trick at the heart of it: commit, then reveal.", variant: "serif", rotate: 2, pos: { top: 66, left: 96 } },
  { id: "vo-s5-02", text: "No randomness to corrupt, because there is no randomness at all.", variant: "mono", rotate: -2, pos: { top: 66, right: 96 } },
  { id: "vo-s5-03", text: "Pure strategy, verified after the fact. That is the innovation.", variant: "mono", rotate: 2, pos: { top: 250, left: 110 } },

  // Scene 6: title card center; two boxes in the top corners. URL chunk: no box.
  { id: "vo-s6-01", text: "Take a seat at the table. Practice free, no wallet needed.", variant: "mono", rotate: 2, pos: { top: 66, left: 96 } },
  { id: "vo-s6-02", text: "Then stake a real table on Stellar testnet, if you dare.", variant: "mono", rotate: -2, pos: { top: 66, right: 96 } },
];

const voById = (id: string): Vo => {
  const v = vos.find((x) => x.file === `vo/${id}.wav`);
  if (!v) throw new Error(`no vo for caption ${id}`);
  return v;
};

export const captions: Caption[] = capDefs.map((c) => {
  const v = voById(c.id);
  return {
    id: c.id,
    start: v.start,
    hold: v.durFrames + CAPTION_HOLD,
    text: c.text,
    variant: c.variant,
    rotate: c.rotate,
    pos: c.pos,
    maxWidth: c.maxWidth ?? 560,
  };
});

// ---- Scene 3 time remap -------------------------------------------------
// Built from cues.json (a real 3 player staked game, 25 fps take). Video
// segments name a source start (seconds) and a playback speed; their output
// length is (dur/30 * speed) of source. Still segments hold a pre-extracted
// freeze. Cumulative output equals scene 3's duration (1663). Waiting stretches
// are ramped 1.5x..1.9x; the strike and the bingo run in 0.5x slow motion, each
// landing on a freeze under its onomatopoeia card.
export type Seg =
  | { kind: "video"; srcStart: number; speed: number; dur: number; note: string }
  | { kind: "still"; still: string; dur: number; note: string };

export const s3Segments: Seg[] = [
  { kind: "video", srcStart: 0.184, speed: 1.5, dur: 112, note: "lobby -> create table (stake 1 XLM, 3 seats)" },
  { kind: "video", srcStart: 6.802, speed: 1.9, dur: 150, note: "board setup, shuffle, commit sealed board" },
  { kind: "video", srcStart: 16.7, speed: 1.8, dur: 186, note: "rival 1 joins, rival 2 joins, table seals" },
  { kind: "video", srcStart: 30.777, speed: 1.8, dur: 120, note: "turn calls, dauber stamps" },
  { kind: "video", srcStart: 68.0, speed: 1.5, dur: 90, note: "calls building toward the first line" },
  { kind: "video", srcStart: 74.9, speed: 0.5, dur: 60, note: "first strike, slow motion" },
  { kind: "still", still: "gameplay/frame-strike.png", dur: 18, note: "freeze, SLASH lands" },
  { kind: "video", srcStart: 110.5, speed: 1.0, dur: 330, note: "meter fills B BI BIN BING" },
  { kind: "video", srcStart: 151.0, speed: 0.5, dur: 66, note: "bingo, slow motion" },
  { kind: "still", still: "gameplay/frame-bingo.png", dur: 24, note: "freeze, BINGO! lands" },
  { kind: "video", srcStart: 152.2, speed: 1.7, dur: 165, note: "auto-claim, claim signs, hero reveals" },
  { kind: "video", srcStart: 169.8, speed: 1.4, dur: 84, note: "rivals reveal, hero clicks settle" },
  { kind: "video", srcStart: 174.8, speed: 1.0, dur: 72, note: "you take the pot, table settled" },
  { kind: "video", srcStart: 177.6, speed: 1.2, dur: 156, note: "withdraw, real XLM lands in the wallet" },
  { kind: "still", still: "gameplay/frame-withdrawn.png", dur: 30, note: "final hold on the funded wallet" },
];

// Scene-3-local frames for overlays and accents, derived from the segment
// starts above. Kept as named constants so scenes and mix stay in sync.
export const s3 = {
  slashAt: 718, // SLASH freeze start (end of the strike slow-mo)
  bingoAt: 1132, // BINGO freeze start (end of the bingo slow-mo)
  bingoHold: 60, // frames the BINGO! card holds before it punches out
  punchFirstCall: 460, // inside the turn-calls run
  punchMeter4: 1062, // meter-4 lands on screen
  punchSettled: 1462, // settled ("you take the pot")
  bassLetters: [776, 923, 1062], // meter-2, meter-3, meter-4 on screen
  riserAt: 920, // riser building through the meter into the win
  fanfareAt: 1462, // settled
  heartbeats: [700, 900], // tension under the meter run
  thocks: [470, 510, 555, 600, 640], // dauber calls we accent (5)
  whooshes: [460, 1062, 1462], // per punch-in zoom
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
export const s2Panels = [8, 205, 410, 610];
// Scene 1 panel beats (local): hand, puppet, server.
export const s1Panels = [0, 187, 374];
// Scene 4 card slam beats (local), aligned to the three takeaway chunks.
export const s4Cards = [12, 126, 256];
// Scene 6 title reveal beat (local).
export const s6Reveal = 12;

export const sfxCues: Sfx[] = [
  // Scene 1: heartbeat bed (two hits cover ~18.7s) + ink slam per panel.
  { file: "sfx/sfx-heartbeat.wav", at: S1 + 0, volume: 0.3 },
  { file: "sfx/sfx-heartbeat.wav", at: S1 + 280, volume: 0.3 },
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
  { file: "sfx/sfx-heartbeat.wav", at: S3 + s3.heartbeats[0], volume: 0.22 },
  { file: "sfx/sfx-heartbeat.wav", at: S3 + s3.heartbeats[1], volume: 0.22 },
  { file: "sfx/sfx-riser.wav", at: S3 + s3.riserAt, volume: 0.4 },
  { file: "sfx/sfx-bass.wav", at: S3 + s3.bassLetters[0], volume: 0.45 },
  { file: "sfx/sfx-bass.wav", at: S3 + s3.bassLetters[1], volume: 0.45 },
  { file: "sfx/sfx-bass.wav", at: S3 + s3.bassLetters[2], volume: 0.45 },
  ...s3.thocks.map((t) => ({ file: "sfx/sfx-thock.wav", at: S3 + t, volume: 0.6 })),
  ...s3.whooshes.map((w) => ({ file: "sfx/sfx-whoosh.wav", at: S3 + w, volume: 0.35 })),
  { file: "sfx/sfx-slam.wav", at: S3 + s3.slashAt, volume: 0.5 },
  { file: "sfx/sfx-slam.wav", at: S3 + s3.bingoAt, volume: 0.55 },
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
