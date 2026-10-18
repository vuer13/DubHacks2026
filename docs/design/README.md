# Design

The TrailSense UI design export: every screen and state of the hiker app, low-vision mode, the fall check-in and SOS flow, and the live share page.

[`handoff.md`](./handoff.md) is the source of truth for design tokens (colours, type, spacing, sizes) and component props. If a PNG and `handoff.md` disagree, `handoff.md` wins. Build from it, not from the pictures.

| Path | Holds |
|---|---|
| [`handoff.md`](./handoff.md) | Token table, component inventory with props, the state map that says which data drives each frame, glyph specs, accessibility rules |
| [`png/`](./png/) | 2x renders of every frame, for reference and PR review. Frames are named by the state they show, for example `hiker-sev3-stop.png`, `lowvision-fork.png`, `share-mobile-sos.png`. The design system sheet is downscaled to 1920 px wide and 64 colours, so read exact colours from `handoff.md` |
| [`source/`](./source/) | Claude Design project files: `canvas.json` and one self-contained `.dc.html` per frame. These keep their original names (for example `Hiker05Sev3.dc.html`); the state map in `handoff.md` pairs each source file with its PNG |

Design tokens live in code in `frontend/theme/tokens.ts`. Its raw values are generated from the token block in `handoff.md`, and `npm run check:tokens` in `frontend/` fails if they drift. The light share-page set is exported there too.

The low-vision glyphs are drawn inline with `react-native-svg` in the app's guidance glyph component. The four original SVG files are in `frontend/public/glyphs/` in the old Next.js app; migration Phase 6 moves them back into `docs/design/glyphs/` before that app is removed.

Frontend UI changes go on a step branch with a PR into `front-end-feature-branch`; one PR per step.
