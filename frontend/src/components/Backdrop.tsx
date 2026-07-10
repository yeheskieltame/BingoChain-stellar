/**
 * Decorative arcade backdrop: drifting neon glow blobs, a halftone dot grid
 * (the "dauber" motif), scanline sheen and grain. All CSS — see .bg-* rules.
 */
export default function Backdrop() {
  return (
    <div className="bg" aria-hidden>
      <div className="bg-glow bg-glow--pink" />
      <div className="bg-glow bg-glow--lime" />
      <div className="bg-glow bg-glow--cyan" />
      <div className="bg-halftone" />
      <div className="bg-scan" />
      <div className="bg-grain" />
    </div>
  );
}
