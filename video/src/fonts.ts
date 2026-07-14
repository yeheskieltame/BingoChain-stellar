import { continueRender, delayRender, staticFile } from "remotion";

// Load the Fraunces variable font before the first frame renders so display
// type is measured correctly. Runs once at module load, and only in a browser
// context (guarded so any Node-side bundle evaluation is a no-op).
if (typeof document !== "undefined" && typeof FontFace !== "undefined") {
  const handle = delayRender("load-fraunces", { timeoutInMilliseconds: 30000, retries: 2 });

  const fraunces = new FontFace(
    "Fraunces",
    `url(${staticFile("fonts/fraunces-latin-var.woff2")}) format("woff2")`,
    { weight: "100 900", style: "normal" },
  );

  fraunces
    .load()
    .then((loaded) => {
      // Cast: the ES2018 DOM lib types FontFaceSet without `add`, which exists at runtime.
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(loaded);
      continueRender(handle);
    })
    .catch((err) => {
      // Fail open to the serif fallback rather than hanging the render.
      console.error("Fraunces failed to load", err);
      continueRender(handle);
    });
}
