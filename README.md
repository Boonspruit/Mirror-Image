# Mirror Image

Mirror Image is a browser computer-vision lab and portfolio for face and hand tracking, expression matching, meme profile training, and debugging. The webcam, MediaPipe processing, matching, and saved library stay in the browser.

## Run locally

```sh
npm ci
npm run dev
```

Use a current desktop browser and allow camera access. `localhost` and HTTPS are required. Stop the camera in the app to release it.

## Explore

- **Mirror:** live face/hand tracking with an optional landmark overlay and best meme match.
- **Library:** add, remove, and train meme profiles against your expression; the live preview stays visible while training.
- **Settings:** calibrate a neutral face, inspect feature scores and diagnostics, and export or import profile backups.

The browser uses versioned profile storage under the same origin. Profile transfers use the existing `mirror-image-profiles` version 1 format, including trained vectors, custom images, and hidden built-ins. The app does not upload camera frames or expression features.

## Architecture

- React + Vite + TypeScript.
- MediaPipe Face and Hand Landmarkers run in the browser.
- Matching, normalization, smoothing, calibration, and profile validation come from the versioned `@mimic/core` package in `vendor/`. Its source lives in the private Mimic repository and is included as a built archive, so this public project installs without private repository credentials.
- Training edits and custom memes remain in browser IndexedDB/localStorage. Import/export is the transfer path between Mirror Image and Mimic.

Meme images retain their credits in `public/memes/CREDITS.md`. Run `npm run build`, `npm run lint`, `npm run typecheck`, and `npm test` before a release.
