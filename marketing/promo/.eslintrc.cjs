// The stage scripts are plain browser scripts loaded by <script> tags in src/stage.html: GSAP and its
// plugins come from node_modules, and engine.js publishes the shared helpers as window.E and window.SCENES.
module.exports = {
  overrides: [
    {
      files: ["src/**/*.js"],
      env: { browser: true },
      globals: { gsap: "readonly", SplitText: "readonly", DrawSVGPlugin: "readonly", MotionPathPlugin: "readonly", CustomEase: "readonly", E: "readonly", SCENES: "readonly" },
    },
  ],
};
