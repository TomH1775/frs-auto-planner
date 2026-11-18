# FRS Auto Planner

Draw autonomous routines for **FRS 2026 Rebuilt** (rebuilt.frsim.com) and have them actually drive your robot in Auto.

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

1. In the app, click **Send to FRS** and drag the **⚡ FRS Auto** button to your bookmarks bar.
2. Open rebuilt.frsim.com, start a **Singleplayer** match or join a **Multiplayer** room, and click the bookmark. The FRS AUTO panel appears.
3. The first time only: open **Setup & calibration**, drive to open space (for example the neutral zone), and click **Calibrate**.
4. Pick your routine and click **Arm for Auto** before the match starts. The routine runs when Auto begins and the panel re-arms itself for the next match. In Singleplayer you can press **R** to restart and run it again.

To update a routine without re-dragging the bookmark, click **Copy routine** in the app. Then in the game panel, choose **Load routine**, paste, and click **Load**.

Taking over: press any key (Esc works) or touch a real controller, and the runtime lets go instantly.

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

Coordinates are WPILib-style, in meters, with the origin at the blue wall. Heading 0° faces the red wall. The robot's *front* is its intake side. Routines drawn on one alliance are mirrored automatically when you play the other one.

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
