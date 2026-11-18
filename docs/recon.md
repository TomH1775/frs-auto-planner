# FRS (rebuilt.frsim.com) recon — Beta v35, 2026-11-17

Findings that the runtime (`runtime/`) depends on. If FRS updates and auto breaks, re-check these first.

## Page / bundle
- Next.js app bundled with **Turbopack**; Three.js **r186** (`window.__THREE__ === "186"`).
- The renderer is plain Three.js (not react-three-fiber); the scene is not reachable from React state.
- **Module access:** `TURBOPACK.push([path, id, factory])` registers a module factory;
  `TURBOPACK.push([path, {otherChunks: [], runtimeModuleIds: [id]}])` runs it. The factory receives the
  Turbopack context, whose `.c` is a `Map` of the module cache. The Three module is the export object
  that has `Object3D` / `WebGLRenderer` / `Vector3` (module id was 32009, but don't rely on the id).
- **Scene access:** patch `WebGLRenderer.prototype.render` (or `Object3D.prototype.updateMatrixWorld`)
  and keep the `Scene` that contains an object named `field`.
- Uncaught errors in the page show up as an in-game "SOMETHING WENT WRONG" toast, so all runtime code is wrapped in try/catch.

## Scene coordinates
- Y is up. The field is centered at the origin. X runs along the field length (blue wall at X = -8.27, red at +8.27).
  The guardrails sit at Z = ±4.011.
- Converting to WPILib blue-origin field coordinates: `x = X + 8.27`, `y = 4.011 - Z`.
- Robot node: `robot:<team>` (nested in groups, so use `matrixWorld`). Ignore copies under `shader-warmup-robot`.
- **Robot front = local −X** (`part:intake_arm` is at local x ≈ −0.44). So the front direction in world space is
  `(-m[0], -m[2])` from `matrixWorld.elements`, and field heading = `atan2(m[2], -m[0])`.
- Field elements (scene name → bounding boxes) are recorded in `shared/field.ts`.

## Input
- The game polls `navigator.getGamepads()`. A synthetic `standard`-mapping pad at index 0 shows as
  "Connected" in Settings → Controller and drives the robot. No button press is needed to select it.
- Stick deadzone is 12% (the default) and response is linear ("Fine control" off).
- Drive is **field-relative and driver-perspective**:
  - Blue: stick up (axes[1] < 0) moves +x and stick right (axes[0] > 0) moves −y.
  - Red: both are mirrored (stick up moves −x, stick right moves +y).
  - Right stick right (axes[2] > 0) turns clockwise, so heading decreases.
- Rough speed: 0.6 stick moved 2.2 m in 1 s from a standstill. Use the HUD calibration to measure exact values.
- Default controller mapping (standard gamepad indices):

| Function | Pad | Index | Keyboard |
|---|---|---|---|
| Intake | LT | 6 | Shift |
| Score | RT | 7 | Space / K |
| Outtake | LB | 4 | Q |
| Climb | Y | 3 | F |
| Robot special | RB | 5 | I |
| Intake in | X | 2 | E |
| Hood up | B | 1 | Z |

## Match flow
The phase label is a leaf `<span>` in the scoreboard. Its text goes:
`Ready` → `Starting` (3-2-1, "GO") → **`Auto`** (20 s) → `Auto scoring` → `Transition · 0:10` → `Shift N · m:ss` → `End game`.
- Auto start = the label becomes exactly `Auto`. Auto end = anything else.
- Singleplayer has exactly one `robot:<n>` in the scene. The runtime refuses to run when it sees more than one.
- Blue default start: about (4.44, 7.57) facing −y. Red start is the blue start rotated 180° about the field center.
  The field is rotationally symmetric, so `mirror(x, y, θ) = (16.54 − x, 8.022 − y, θ + π)`.
