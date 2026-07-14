# BingoChain Stellar, demo film storyboard

Format: 1920x1080, 30 fps, target length about 2:05.
Style: motion comic. Ink-outlined panels, halftone shading, hard shadows, panel-slam
transitions, onomatopoeia cards, Ken Burns pushes on stills. Palette locked to the app:
felt #0d1f15, panel #17301f, bone #ede5cd, brass #d5aa52, lacquer #a63a24, ember #e8927f,
leaf #9ed08a, paper #e9dfc6, ink #25341f. Type: Fraunces for display, mono for labels.
Voice: local Kokoro TTS, British male (bm_fable, fallback bm_george, fallback macOS Daniel),
dramatic, deliberate, clearly articulated. Music and SFX throughout; the cut should feel
like a heist trailer, not a tutorial.

## Scene 1, The problem (0:00 to 0:18)

Visual: three noir comic panels slam in one by one. P1 a giant shadowed hand looming over
a glowing bingo machine. P2 bingo balls dangling from puppet strings. P3 a server rack
with a single glowing eye behind a velvet curtain. Slow push on each, halftone flicker,
film grain. Panel borders in bone on felt.
SFX: low heartbeat under everything, ink slam on each panel, rising drone.
VO:
"Every online game of chance asks the same favour. Trust the house.
But you never see the shuffle. You never see the draw.
Somewhere behind the felt, a server decides your luck. And you simply hope it plays fair."

## Scene 2, The solution (0:18 to 0:38)

Visual: four panels. P1 a wax-sealed envelope stamped shut, brass wax, circuit veins.
P2 a brass vault door closing on stacked coins. P3 a constellation web of nodes over a
felt sky. P4 a gavel striking a reel of tape covered in numbers. Faster cuts than scene 1.
SFX: stamp slam, heavy vault clunk, chain rattle, bass hit on the last line.
VO:
"BingoChain Stellar takes the house out of the game. No dealer. No server randomness. Nothing to rig.
You seal a secret board in a cryptographic envelope. The contract locks every stake in escrow.
And when the round ends, it replays every single call to crown the winner.
Cheating does not lose the argument here. It loses the pot."

## Scene 3, Gameplay demo (0:38 to 1:25)

Visual: real screen recording of the live app inside a comic panel frame with brass
corners. Beats, with speed ramps and punch-in zooms:
1. Lobby, then the practice table opens. (2 s)
2. Board setup, shuffle twice, commit. (4 s)
3. First calls: tap a cell, dauber stamps it, order badge lands. Bot answers. (8 s)
4. First completed line: SVG strike draws, onomatopoeia card "SLASH" flashes. (4 s)
5. Meter fills B, BI, BIN, each letter a bass hit, heartbeat quickens. (10 s)
6. BING at four lines, screen edge vignette pulses lacquer. (5 s)
7. The fifth line lands: strikes blaze, meter reads BINGO, onomatopoeia "BINGO!". (4 s)
8. Auto-claim fires, then the settled screen: "You take the pot." Halftone confetti. (8 s)
SFX: wet dauber thocks per call, whoosh per zoom, riser from beat 5, win fanfare at 8.
VO, sparse, letting the game breathe:
"Arrange your twenty five numbers. Then play.
Every call is a move. Every line, a blade getting closer.
Three lines. Four.
... Bingo. The claim fires itself. The contract checks the tape.
And the pot is yours."

## Scene 4, Key takeaways (1:25 to 1:40)

Visual: three comic cards slam in left, center, right on the felt: SEALED BOARDS,
STAKED IN ESCROW, SETTLED BY REPLAY. Brass caps, paper faces, ink type.
SFX: three escalating slams.
VO:
"Sealed boards keep every strategy secret. Escrowed stakes mean nobody holds your money but the chain.
And settlement by replay means the truth is computed, never claimed."

## Scene 5, The key innovation (1:40 to 1:52)

Visual: split panel, the wax envelope on the left, the tape reel on the right, a brass
thread connecting them. Slow push, dust motes.
SFX: single low piano sting, heartbeat fades out.
VO:
"The trick at the heart of it. Commit, then reveal.
There is no randomness to corrupt, because there is no randomness at all.
Pure strategy, verified after the fact. That is the innovation."

## Scene 6, Call to action (1:52 to 2:05)

Visual: title card on felt. BINGOCHAIN STELLAR in Fraunces bone, brass rule, the URL
bingochain-stellar.vercel.app, subline "Practice free. No wallet needed." A bingo ball
bursts into halftone confetti behind the type.
SFX: final slam, fanfare tail, room tone out.
VO:
"Take a seat at the table. Practice free, no wallet needed.
Then stake a real table on Stellar testnet, if you dare.
Bingochain dash stellar, dot vercel, dot app."

## Asset manifest

Higgsfield stills (all: motion comic panel, bold ink outlines, halftone shading, chiaroscuro,
palette felt green #0d1f15 bone #ede5cd brass #d5aa52 lacquer red #a63a24, noir card table
mood, high contrast, no text, 16:9):
- a1-shadow-hand: giant shadowed hand looming over a glowing bingo cage machine
- a2-puppet-balls: numbered bingo balls hanging from puppet strings out of darkness
- a3-server-eye: ominous server rack with one glowing eye behind a velvet curtain
- a4-sealed-envelope: wax sealed envelope, brass wax stamp, faint circuit veins on paper
- a5-vault: heavy brass vault door closing over stacked glowing coins in a felt green room
- a6-network: constellation web of brass nodes strung over a deep felt sky
- a7-replay-gavel: wooden gavel striking a film tape reel covered in tiny numbers
- a8-innovation-split: split composition, wax envelope left, tape reel right, brass thread between
- a9-cta-burst: single bingo ball exploding into halftone dot confetti
- a10-table-hall: lamplit card table in a private back room, one empty chair facing the viewer

SFX (Higgsfield seed_audio, mono cues, short):
- heartbeat slow loop, tense drone riser, ink panel slam, page whoosh, rubber stamp slam,
  vault door clunk, chain rattle, deep bass hit, wet dauber thock, brass win fanfare,
  low piano sting.
Music beds: tense percussive noir heist loop (about 90 s), triumphant brass tail (about 15 s).

Gameplay capture: Playwright, chromium 1920x1080, records the practice flow to a win.
The runner replays until the player wins, then keeps the winning take. Segments listed in
scene 3 get cut in Remotion from one continuous take using timestamps logged by the runner.

VO renders: one wav per line group, 24 kHz, normalized, filenames vo-s1.wav .. vo-s6.wav.
Remotion sequences are timed to the measured durations of these files.
