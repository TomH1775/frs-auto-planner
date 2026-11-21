# FRS Auto Planner

Draw autonomous routines for all three FRS games, **2026 Rebuilt**, **2025 Reefscape** and **2024 Crescendo** (frsim.com), and have them actually drive your robot in Auto.

Pick the game with the switcher in the planner's top bar. Each game has its own field, Auto length (Rebuilt 20 s, Reefscape and Crescendo 15 s), and buttons (Reefscape's L1–L4 setpoints and poles, Crescendo's amp, and so on, under **Press button**). One bookmark works on every game's site, and the panel shows the autos for the game you're on.

- **Planner app** (`app/`): draw a path on the field, set robot headings, and drop action items on the path: intake on/off, intake for N s, shoot, climb, any button, and wait. A timeline shows when everything happens and warns if the routine runs past the 20 s auto period.
- **In-game runtime** (`runtime/`): loaded into the FRS tab by a bookmarklet. It reads the robot's position from the game and follows the path closed-loop. It drives through a virtual gamepad (the same input a real controller gives) and presses the mechanism buttons at the right moments.

Runs in **Singleplayer** and regular **Multiplayer** rooms (allowed by the FRS devs). It is disabled in **Ranked**, events/tournaments, and while spectating. The panel shows which mode it detected and which robot is yours; if it can't tell, it stays off.

## Open the planner

**Online:** https://maxthecobbler.github.io/frs-auto-planner/ (updates automatically on every push to `main`).

**Locally:**

```bash
npm install
npm run dev        # builds the runtime, then serves the app at http://localhost:5173
```

## Use it in FRS

1. In the planner, click **Send to FRS** and drag the **⚡ FRS Auto** button to your bookmarks bar. **You only do this once.** The bookmark is a tiny loader that fetches the newest version from the website every time you click it.
2. Open the game (rebuilt.frsim.com, reefscape.frsim.com or crescendo.frsim.com), start a **Singleplayer** match or join a **Multiplayer** room, and click the bookmark. The FRS AUTO panel appears.
3. Click **↻ Sync** in the panel to pull your latest autos from the planner website. A small window opens for a moment and closes itself; if the browser blocks it, allow pop-ups for frsim.com. Sync again after you edit an auto.
4. The first time in each game: open **Setup & calibration**, drive to open space, and click **Calibrate**.
5. Pick your routine and click **Arm for Auto** before the match starts. The routine runs when Auto begins and the panel re-arms itself for the next match. In Singleplayer you can press **R** to restart and run it again.

No internet, or want a frozen copy? Send to FRS also has an **offline bookmark** with the code and your autos built in (it doesn't update itself). **Load routine** (paste JSON) and **Copy console script** still work too.

Taking over: press any key (Esc works) or touch a real controller, and the runtime lets go instantly.

## Record an auto in FRS

Instead of drawing a routine, you can drive it yourself and import the recording:

1. In the FRS AUTO panel, open **Record a drive**.
2. Click **⏺ Record next Auto**, then press **R** to restart the match (or click **⏺ Now** to start right away and **⏹ Stop** when done).
3. Drive your auto normally. The panel records your path, where you stop, and every mechanism button you use (intake, shoot, climb, outtake, …). The minimap shows the recorded path in red.
4. When Auto ends, click **Download .json** (or **Copy JSON**), then in the planner click **Import** and choose the file (or paste). **Add to my autos** saves it straight into the panel so you can replay it immediately.

How it's converted: the path is simplified to a few waypoints with your headings. Places where you stopped become waypoints, and the corners stay sharp. Holding intake while driving becomes Intake on/off. Shooting or climbing while stopped becomes a stop action with the same duration. Shooting while moving becomes a moving Shoot at the speed you drove. Leftover standing time becomes a Wait. Speed limits are set from how fast you actually drove.

Keyboard presses are read using FRS's default keys (Shift intake, Space/K score, Q outtake, F climb, I special, E intake-in, Z hood). If you rebound keys in FRS, record with a controller, or update `KEY_BINDINGS` in `runtime/recorder.ts`.

## Editing controls

| | |
|---|---|
| `P` Draw path | Click empty field to add a point. Click on the path to insert one. |
| `V` Select | Drag points, the square curve handles, the blue heading knob, or action markers. Hold Shift to snap. |
| `1`–`7` | Action tools. Click the path or a waypoint to place an action. |
| Right-click / Delete | Remove a point or action. |
| `Space` | Play the preview. |
| `⌘Z` / `⇧⌘Z` | Undo / redo. |

Square action markers stop the robot while they run. Round ones happen while driving.

**Shooting on the move:** select a Shoot action and uncheck *Stop the robot while doing this*. The robot automatically slows to a percentage of the routine's max speed for the whole time it shoots (default 50%, adjustable with the slider). The slowed stretch shows as a thick orange band on the path and a striped "slow" block on the timeline.

Coordinates are WPILib-style, in meters, with the origin at the blue wall. Heading 0° faces the red wall. The robot's *front* is its intake side. Routines drawn on one alliance are moved to the other automatically when you play it. Rebuilt and Reefscape are rotated 180°, and Crescendo is mirrored left-to-right, matching each field.

Crescendo's **first-person** camera drives robot-relative. FRS Auto detects the camera mode and converts automatically.

## Notes

- The routine follows the path by time. If the robot falls behind at a stop or at the end of the path, the clock waits up to 1 s for it to catch up.
- Button mapping defaults to FRS's controller layout. If you rebind controls in FRS, change the pad numbers under *Setup & calibration*.
- Recon details (scene coordinates, input mapping, match phases) are in `docs/recon.md`. If an FRS update breaks auto, start there. Robot front axis was verified on 2910's robot. If another robot's front looks backwards, change **Robot front axis** in the panel.

## Development

```bash
npm test             # path / trajectory / schedule / stick-mapping unit tests
npm run typecheck
npm run build        # runtime + app production build into dist/
```
