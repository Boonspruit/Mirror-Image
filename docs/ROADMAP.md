# Mirror Image roadmap

Mirror Image is the browser-based computer-vision lab and portfolio. It remains independently runnable with React, Vite, TypeScript, MediaPipe Web, and the browser camera. The main app keeps live face and hand tracking, meme matching, profile training and library management, calibration, and diagnostics.

## Project split

- The browser app no longer hosts photobooth screens or mobile build infrastructure.
- The shared TypeScript matching core is maintained in the private [Mimic repository](https://github.com/Boonspruit/Mimic). Mirror Image installs the versioned package archive committed in `vendor/`, so its public checkout does not require access to that private repository.
- Existing meme IDs, browser-storage keys, trained profiles, and `mirror-image-profiles` version 1 import/export format remain stable.
- Meme images and camera adapters stay specific to each app.

## Verification

Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test`. Face and hand tracking runs entirely in the browser; the site does not send camera frames or expression vectors to a server.

Mimic is developed and released separately. Its mobile camera validation, photobooth design, and later friend-room roadmap live in the Mimic repository.
