# Mirror Image — Version 1

A React + Vite + JavaScript foundation for a webcam-to-meme application.
This version implements webcam capture, MediaPipe Face Landmarker, an optional face mesh overlay, live raw blendshape values, a simplified expression vector with estimated head angles, twenty-six built-in meme profiles, weighted expression similarity, fast EMA smoothing, immediate matching, neutral-face calibration, face-trained profiles, and a persistent custom meme library.

## Using the interface

- **Mirror** is the main view: your live camera, the winning meme, and its score.
  Open **Match details** only when you want the grouped scores and alternatives.
- **Library** holds all meme profiles. Selecting a card opens an expression editor
  with your mirrored camera and the selected meme side by side. Start the camera
  there, hold your expression, then choose **Match this meme to my face** to save
  its target values. Close or press Escape to return to the collection.
- **Settings** contains the face-mesh toggle, neutral calibration with a live
  preview, tracking status, feature values, and the debugging panels.

The same camera stream is reused across views and previews. Navigation does not
restart inference, request permission again, or reset calibration. Use **Stop
camera** to release it. The face mesh starts off for an uncluttered mirror.

## Run locally

Use Node.js 22.12+ (or a newer supported release), with npm.

```sh
git clone https://github.com/Boonspruit/Mirror-Image.git
cd Mirror-Image
npm install
npm run dev
```

Open the localhost URL printed by Vite (normally http://localhost:5173).
Click **Start camera**, then allow camera access. No microphone is requested.
Chrome or Edge is a good first browser to test; other browsers still need manual verification.

On a fresh checkout, `npm install` also runs the setup script. Setup copies the
installed MediaPipe WASM runtime into `public/mediapipe/wasm` and downloads
Google's pretrained model into `public/models`. This initial setup needs internet.
After setup, the application serves everything locally: no CDN requests,
uploaded frames, backend, API key, or model training.

If installation scripts were disabled or assets are missing:

```sh
npm run setup
```

If the model file is corrupted, remove only `public/models/face_landmarker.task`
and rerun setup. Setup preserves an existing model instead of downloading it every time.

For a production build:

```sh
npm run build
npm run preview
```

The generated `dist/` contains the application, model, and WASM assets and can be
served as a static site. Use HTTPS outside localhost. Opening `index.html`
directly or using an ordinary HTTP LAN address will not work for camera access.

## File guide

| File | Responsibility |
| --- | --- |
| `index.html` | HTML document, page metadata, and React entry point. |
| `src/main.jsx` | Mounts React and imports CSS; StrictMode checks development lifecycle behavior. |
| `src/App.jsx` | Page shell, persistent meme-library state, introduction, camera, and collection. |
| `src/components/Camera.jsx` | Owns the webcam, session state, tracking and matching pipeline, controls, errors, and cleanup. |
| `src/components/MemeGallery.jsx` | Displays the collection and lets the user add, inspect, remove, or restore meme profiles. |
| `src/hooks/useMemeLibrary.js` | Combines built-in records with browser-stored custom profiles and applies face-trained vector overrides. |
| `src/data/memeLibrary.js` | Stores custom images and vectors in IndexedDB, stores hidden built-ins and trained overrides in localStorage, and resizes uploads. |
| `src/data/memes.json` | Twenty-six manually estimated profiles with the exact expression keys, local image paths, notes, and source metadata. |
| `public/memes/*` | Locally bundled meme images plus CREDITS.md listing sources. |
| `public/memes/alma-hamsters/*` | Sixteen locally bundled Almarts27 hamster images, all active in matching. |
| `tests/memes.spec.js` | Checks schema, score ranges, image files/loading, gallery interaction, and operation without external requests or webcam access. |
| `src/components/SimilarityPanel.jsx` | Explains the active weights, formula, feature readiness, and current engine scope. |
| `src/components/MemeDisplay.jsx` | Shows the live winner, image, grouped scores, distance, coverage, and three alternatives. |
| `src/components/MatchMeter.jsx` | Renders the overall percentage and progress bar with an accessible label. |
| `src/matching/similarity.js` | Calculates normalized weighted Euclidean distance, match percentage, and feature coverage. |
| `src/matching/matcher.js` | Ranks meme records by distance and returns the best comparable entry. |
| `src/matching/smoothing.js` | Applies a configurable exponential moving average to expression features and head angles. The live pipeline gives the newest frame 65% weight. |
| `src/matching/matchStabilizer.js` | Holds the winner until a stronger meme leads long enough to replace it. |
| `tests/similarity.spec.js` | Checks formula boundaries, weighting, missing readings, invalid configuration, ranking, ties, and the UI contract. |
| `tests/smoothing.spec.js` | Checks EMA math, pose smoothing, reset behavior, missing values, and validation. |
| `tests/stabilizer.spec.js` | Checks sustained leads, interruptions, margins, and reset behavior. |
| `tests/matching-ui.spec.js` | Checks exact live matches, result switching, clearing on face loss, alternatives, responsive layout, and image fallback. |
| `tests/meme-library.spec.js` | Checks custom upload persistence, removal, and built-in restoration. |
| `src/components/ExpressionPanel.jsx` | Displays ten combined expression values and head yaw/pitch/roll, keeping their different units separate. |
| `src/tracking/featureExtractor.js` | Pure functions that combine raw scores into a fixed named expression schema and pair it with head pose. |
| `src/tracking/faceCalibration.js` | Averages neutral samples and subtracts the saved expression and head-pose baseline. |
| `src/tracking/headPose.js` | Validates and decomposes the column-major transform into signed Euler angles in degrees. |
| `src/components/DebugPanel.jsx` | Groups key raw blendshape scores, renders value meters, and provides an expandable list of all model categories. |
| `src/components/FaceOverlay.jsx` | Draws the mesh, contours, and irises on a transparent canvas; exposes draw/clear methods to the tracking loop. |
| `src/tracking/faceTracker.js` | Creates Face Landmarker, tries GPU then CPU, and runs/cancels the detection loop. It has no React dependency. |
| `src/index.css` | Responsive styling, mirrored preview, layout, focus states, and error styling. |
| `scripts/prepareAssets.js` | Copies matching package WASM assets and downloads the versioned pretrained model. Runs after npm install, or via npm run setup. |
| `public/models/face_landmarker.task` | Generated/downloaded model bundle; used for inference, never trained here. |
| `public/mediapipe/wasm/*` | Generated local JS/WASM runtime files, including browser-compatible variants. |
| `package.json` | Dependencies and commands: setup, dev, build, preview, lint, and test. |
| `package-lock.json` | Locks the installed dependency tree for reproducible installs. |
| `vite.config.js` | Enables React in Vite. |
| `.oxlintrc.json` | JavaScript/React lint configuration. |
| `.gitignore` | Excludes generated dependencies, runtime assets, build output, and test results from Git. |
| `playwright.config.js` | Configures Chromium, a synthetic camera, and a separate Vite test server on port 5174. |
| `tests/features.spec.js` | Numeric tests for averaging, missing data, matrix layout, combined rotations, scale, translation, and gimbal lock. |
| `tests/calibration.spec.js` | Checks baseline averaging, clamped expression deltas, signed pose offsets, and empty input. |
| `tests/camera.spec.js` | Browser checks for lifecycle, errors, responsive layout, and real model inference. |
| `README.md` | This setup guide, architecture walkthrough, and test checklist. |

## How the webcam works

1. Clicking Start calls `navigator.mediaDevices.getUserMedia()` with
   `audio: false` and a preferred front camera at 640 × 480. These dimensions
   are preferences, so the browser can choose supported settings.
2. The browser handles permission and returns a `MediaStream`.
3. The component attaches it to `video.srcObject`, then awaits `video.play()`.
   `muted` and `playsInline` support inline playback. CSS mirrors only the preview;
   MediaPipe receives the original camera frame.
4. Stop cancels the animation loop, removes camera listeners, stops every media
   track, closes the tracker, and clears the video. Cleanup also runs on unmount
   and page exit.
5. Each start gets a session identifier. If permission or model initialization
   finishes after that session has been cancelled, its newly created resources
   are released instead of restarting the camera.
6. Denial, a missing/busy camera, disconnection, insecure context, model loading,
   and inference failures produce actionable UI messages.

Ignoring the browser permission prompt can leave its request pending. Cancel
invalidates the session, but browsers do not provide an API to dismiss their
permission prompt. A stream granted later is stopped immediately.

## How MediaPipe works here

`FilesetResolver.forVisionTasks()` resolves the locally served WebAssembly runtime.
`FaceLandmarker.createFromOptions()` loads Google's pretrained model with:

```js
{
  runningMode: 'VIDEO',
  numFaces: 1,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true
}
```

The app tries the GPU delegate, then retries with CPU if GPU initialization fails.
The Processing field names the requested delegate; MediaPipe may still use CPU
for parts of its pipeline.

A `requestAnimationFrame` loop calls `detectForVideo(video, timestamp)` only when
the video has a new frame, at up to 30 inferences per second. A monotonic timestamp
comes from the animation callback. Inference runs synchronously on the main
thread for this small initial version; a web worker is a later option if
performance measurements justify it.

The results include landmarks, blendshape categories, and transformation matrices.
This milestone draws the face mesh and displays signal counts and live raw blendshape scores. The summary refreshes at
most four times per second to avoid a React render per inference. This UI throttle
is separate from the expression EMA and 100 ms match schedule.

With a detected face, expect 478 landmarks, 52 blendshape categories, and an
available head transform. Looking away can legitimately give zero faces.
The transform is also decomposed into approximate yaw, pitch, and roll. These
angles describe the canonical model relative to the camera; they are not yet
relative to your personal neutral pose.

Separating `faceTracker.js` from `Camera.jsx` gives us a stable data boundary:
the overlay and future feature extractor can consume the same results without
changing permission handling or taking ownership of the video stream.

## How the face overlay works (Step 4)

`FaceOverlay.jsx` places a transparent canvas over the video. MediaPipe's
normalized landmark coordinates are drawn with its `DrawingUtils` and supplied
mesh/contour/iris connections. The canvas uses the actual camera frame dimensions;
video and canvas both use `object-fit: contain` and `scaleX(-1)`. This keeps the
layers aligned when the camera aspect ratio differs from the preview container
or the browser window changes size.

The Camera component calls the overlay's `draw()` method through a React ref on
each inference, before throttling the status text. This avoids rendering hundreds
of coordinates through React state. Every draw clears the preceding frame, so
no face means no stale mesh. Stop and error cleanup also clear the canvas.
The **Show face mesh** checkbox hides and clears the overlay without restarting
the camera or model; enabling it draws the next detection result.

## How the debug panel works (Step 5)

`Camera.jsx` snapshots the first detected face's category names and scores alongside
its existing status update, at most every 250 ms. `DebugPanel.jsx` receives these
plain values and looks them up by category name, so array ordering does not matter.
The selected 17 signals retain both left and right readings. This raw panel does not average or calibrate readings. The separate expression
panel combines and smooths selected scores while this panel preserves raw model output.

The panel groups eyes, brows, mouth, and cheeks/nose, with exact model names,
three-decimal scores, and meters on a 0–1 scale. Higher scores mean stronger
signals for that facial movement, not emotion probabilities or meme match accuracy.
The expandable **All raw blendshapes** section includes all returned categories
(including `_neutral`) alphabetically. Missing readings show a dash; actual zero
scores show `0.000`. Face loss, Stop, or errors clear readings with the session.
The numeric panel does not use an ARIA live region, avoiding constant screen reader
announcements; the individual meters have accessible category names.

## How the expression vector works (Step 6)

`extractFeatureVector(result)` is a pure function in `featureExtractor.js`: it
accepts MediaPipe results and returns `{ expression, headPose }`, with no React,
webcam, DOM, or MediaPipe initialization dependency. It runs for each inference;
the UI still displays snapshots at up to four updates per second. Keeping the
calculation outside React lets later matching and smoothing use the same function.

| Expression key | Calculation |
| --- | --- |
| `eyeWide` | Mean of `eyeWideLeft` and `eyeWideRight` |
| `eyeSquint` | Mean of `eyeSquintLeft` and `eyeSquintRight` |
| `browInnerUp` | Raw `browInnerUp` |
| `browDown` | Mean of `browDownLeft` and `browDownRight` |
| `jawOpen` | Raw `jawOpen` |
| `smile` | Mean of `mouthSmileLeft` and `mouthSmileRight` |
| `frown` | Mean of `mouthFrownLeft` and `mouthFrownRight` |
| `mouthPucker` | Raw `mouthPucker` |
| `cheekSquint` | Mean of `cheekSquintLeft` and `cheekSquintRight` |
| `noseSneer` | Mean of `noseSneerLeft` and `noseSneerRight` |

For example, smile scores of 0.8 and 0.6 produce `smile: 0.7`. Averaging keeps
features on a consistent 0–1 scale, but loses left/right asymmetry. The raw panel
preserves both sides so we can revisit this choice for asymmetric memes later.
Calculations keep full precision; only the displayed text is rounded.

A missing, nonfinite, or out-of-range source makes its feature `null`. A paired
feature requires both sides. Actual zero is valid. No detected face returns a
null vector even if a stale model result contains scores or a matrix. Missing or
invalid pose returns `headPose: null` without discarding valid expression scores.
The UI renders null readings as dashes; future matching must explicitly handle
missing features rather than treating them as zero.

`headPose.js` reads MediaPipe's column-major 4×4 transformation. It ignores
translation, normalizes the rotation columns to remove positive scales, checks
orthogonality/handedness, then extracts Euler angles using the convention
`R = Rz(roll) * Ry(yaw) * Rx(pitch)`. The returned values are degrees:

- yaw: rotation about Y, range −90° to +90°;
- pitch: rotation about X, range −180° to +180°;
- roll: rotation about Z, range −180° to +180°.

These are signed right-handed rotations in the original camera coordinate system,
not directions in the mirrored preview. Around an otherwise frontal face, yaw
corresponds to turning, pitch to nodding, and roll to tilting. Simultaneous large
rotations couple Euler angles. At ±90° yaw, pitch and roll cannot be distinguished;
the code fixes roll to zero and retains an equivalent combined pitch. Tracking
at extreme poses can also be unreliable. The angles are estimates, and a resting
face may have a nonzero offset until neutral calibration is added.

Head angles are stored separately from expression scores so a degree-valued
quantity cannot accidentally dominate a 0–1 distance calculation. No pose
normalization, similarity weighting, or matching is introduced in this step.

The matrix layout is verified against the [MediaPipe matrix format](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix_data.proto)
and [JavaScript face result conversion](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts).
The coordinate system is described in [MediaPipe Face Geometry](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md#metric-3d-space).

## The default meme dataset (Step 7)

The gallery contains the user's ten retained profiles: five familiar meme
templates, four Alma hamster faces, and the browser-saved **No Way** image now
bundled as `/memes/shocked.jpeg`. Open **Library** in the navigation to browse
them. Select a card to inspect its image and ten feature values or train that
meme with your live expression.

`src/data/memes.json` is imported directly by Vite. Each record has a stable
`id`, a `name`, a local `image` path, accessible `alt` text, an expression label,
`features`, `headPose: null`, `profileSource: "trained"`, notes, and optional source metadata.
Every `features` object uses the same ten keys as `EXPRESSION_FEATURES` in
`featureExtractor.js`, with a numeric score from 0 to 1. These named values will
let the matcher compare corresponding features without relying on array order.

These default numbers were captured by training each retained profile with the
user's face in the browser. They remain personal matching targets rather than
confidence scores. Averaging loses one-sided expressions, and the current vector
does not capture eye gaze, tears, or the semantic context that makes a meme
recognizable. Head poses are left unknown instead of inventing angles for photos.

### Add or tune a profile

Use **Add a meme face** in the collection to create a profile without editing
code. Name the meme, choose an image, and set the ten sliders to approximate the
expression. The image is resized to at most 1000 pixels and stored with its
feature vector in this browser's IndexedDB. It becomes available to the live
matcher immediately and remains after reloads.

Use **Remove meme** in the selected-profile panel to delete a custom entry. For a
built-in entry, the same action hides it locally; **Restore built-ins** brings
hidden starter profiles back. This keeps the bundled JSON unchanged.

For source-controlled dataset changes:

1. Open `src/data/memes.json` and find an entry by `id`.
2. Edit one or more of its ten feature numbers between 0 and 1. For example,
   changing Pikachu's `jawOpen` from `0.72` to `0.8` raises its open-mouth target.
3. Save. Vite refreshes the gallery; select the card and verify the number.
4. Run `npm test -- tests/memes.spec.js` to validate the dataset and local assets.

To replace an image, put it in `public/memes/` and update the `image`, `alt`, and
`source` fields. To add a profile later, copy an entry, assign a unique id/path,
and enter all ten features. The dataset test deliberately expects twenty-six
built-in entries; update that expectation when expanding the bundled set.

All images are checked into the project folder and served from the same origin;
no Imgflip/API requests are made at runtime. The downloaded variants are
attributed in `public/memes/CREDITS.md` and their individual JSON records. Source
links identify provenance, not a license grant. The photos/cartoon frames remain
third-party material; no ownership or public-domain status is claimed.

## Weighted similarity (Step 8)

`compareExpressions()` compares matching feature names with normalized weighted
Euclidean distance:

```text
distance = sqrt(sum(weight * (user - meme)^2) / sum(used weights))
percentage = (1 - distance) * 100
```

Because both expression vectors use values from 0 to 1, the normalized distance
also stays from 0 to 1. An exact vector match produces 100%; opposite endpoints
on every compared feature produce 0%. This percentage is a readable transform
of expression distance, not classifier confidence or statistical probability.

The initial weights are `eyeWide: 2`, `jawOpen: 2`, `browInnerUp: 1.5`,
`eyeSquint: 1.4`, `browDown: 1.3`, `smile: 1`, `frown: 1`,
`mouthPucker: 0.8`, `cheekSquint: 0.8`, and `noseSneer: 0.7`. Change
`DEFAULT_FEATURE_WEIGHTS` in `src/matching/similarity.js` to tune their relative
influence. Multiplying every weight by the same amount leaves the normalized
result unchanged.

Missing or invalid readings are omitted rather than interpreted as zero. The
returned `coverage` reports the fraction of configured weight that was usable.
No usable features return `null`; invalid weights throw an error. `rankMemes()`
sorts comparable memes by ascending distance, puts uncomparable records last,
and uses stable meme IDs to resolve exact ties without mutating the dataset.

Head pose is intentionally excluded because the starter meme records do not have
measured head angles. The UI shows engine readiness and weights but withholds the
winner until the live display has a usable expression vector.

## Closest meme display (Step 9)

`Camera.jsx` ranks the twenty-six profiles whenever its displayed expression snapshot
updates. `MemeDisplay.jsx` renders the first ranked result with the local image,
overall percentage, normalized distance, comparison coverage, and the next three
profiles. Eye, brow, and mouth/cheek percentages reuse the same comparison
function with only each group's weights, so their meaning stays consistent with
the overall score.

The display shows an empty state before camera startup and whenever no face is
detected. It does not preserve stale winners across face loss or camera stop.
Failed images get a readable fallback while the numeric result remains available.
The camera and winning meme share one two-column workspace on desktop, keeping
the result visible beside the face. Narrow screens stack the result beneath the
camera. Tracking diagnostics sit in a separate strip below the workspace.

## Fast expression smoothing and switching (Step 10)

Every valid tracking frame passes through an exponential moving average in
`smoothing.js`: `smoothed = 0.35 × previous + 0.65 × current`. The first frame
passes through unchanged. Expression values and available head angles are
smoothed independently. Face loss, Stop, errors, and a new session reset the
history.

The matcher ranks the smoothed expression every 100 ms. A challenger that beats
the current meme by more than the small 0.005 distance margin replaces it in the
same comparison cycle. There is no hold timer, so a clear expression change is
normally reflected in about one tenth of a second.

## Neutral-face calibration (Step 11)

**Calibrate face** is available once tracking sees a face. The camera shows a
3–2–1 overlay and collects raw feature vectors during the final second. At least
five readings are required. `averageFeatureVectors()` stores their mean as the
neutral baseline for the current page session.

For expression scores, calibration uses `max(0, current − neutral)` because the
features describe positive muscle activations. Head yaw, pitch, and roll remain
signed and use `current − neutral` directly. Baseline correction happens before
EMA smoothing and matching. Saving a new baseline resets the smoother and current
winner so readings from the old coordinate system cannot leak into the new one.
Raw blendshapes remain unchanged for debugging. Stop and restart preserve a saved
baseline; reloading the page clears it.

The camera and meme media frames use the same 4:3 box and equal-height headers.
Meme images use `object-fit: contain`, keeping the full source visible while the
two live panels remain aligned.

## Managing and training faces

Custom meme profiles are local to the current browser profile and site origin.
Clearing site data removes them. The application stores compressed image data in
IndexedDB rather than localStorage because uploaded images can be much larger
than simple preferences. The short list of hidden built-in IDs and compact
built-in feature overrides use localStorage.

To teach a particular meme, select its card in the collection, start the camera,
hold the expression you want, and choose **Match this meme to my face**. The app
copies the current smoothed ten-feature expression into that selected profile.
The matcher receives the updated collection immediately, so making the same face
can select that meme. Built-in overrides persist in localStorage and can be
returned to their bundled values with **Reset original values**. Training a
custom meme updates its IndexedDB record.

For repeatable results, calibrate a relaxed face before training and calibrate
again in later sessions before matching. A trained profile stores expression
values, not a photo or biometric face template; camera frames are never stored.

## Test before continuing

- Start the camera and make a clear expression: **Your meme match** should show an image and percentage.
- Open **Add a meme face**, upload an image, name it, and adjust a few sliders. Confirm it appears in the collection and can become a live match.
- Reload the page: the custom meme should still be present. Remove it and confirm it disappears.
- Remove one built-in profile, then use **Restore built-ins** to bring it back.
- Select a meme, make a distinct face, and choose **Match this meme to my face**. Confirm its ten displayed values change and the trained badge appears.
- Reload, start the camera, and repeat the trained expression. Confirm the saved meme can win, then use **Reset original values** if it is a built-in.
- Relax your face, select **Calibrate face**, and keep looking forward through the 3–2–1 countdown; the UI should report that the baseline was saved.
- After calibration, neutral expression values should sit near zero and the match badge should say **Calibrated match**.
- Turn or tilt from the calibrated position: pose values should describe the change from that saved orientation.
- Change from a wide-open surprised face to a smile or squint: values should move smoothly, then the winner should respond on the next comparison cycle.
- Leave the frame: the winner should clear and return to the waiting state.
- Stop the camera: the card should ask you to start it again.
- Change expressions quickly: the winner should respond within roughly 100–200 ms. Near a close boundary, the small distance margin may still prevent needless switching.
- On desktop, confirm the meme stays beside the camera; in a phone-sized window, confirm it stacks below without horizontal scrolling.
- In **Weighted similarity**, confirm all ten weights and twenty-six loaded profiles appear.
- Start the camera and face it: feature readiness should change from 0/10 to 10/10.
- Leave the frame or stop: readiness should return to 0/10.
- Jump to the meme collection: all twenty-six profiled images should load with the camera off.
- Select several cards: the large preview, ten values, notes, and source link should update.
- Confirm the image source opens in a new tab and the gallery works in a narrow window.
- Compare **Expression vector** `smile` with the average of the two raw smile scores (allow rounding).
- Turn, nod, and tilt your head; yaw, pitch, and roll should respond respectively around a frontal pose.
- Leave the frame or stop: both combined scores and head angles become dashes.
- In **Live blendshapes**, open your mouth and watch `jawOpen` rise.
- Smile, raise your eyebrows, and squint; watch the corresponding left/right scores.
- Expand **All raw blendshapes** to inspect all 52 readings.
- Leave the frame or stop: numeric readings become dashes, never stale scores.
- Load the page: camera stays off until Start is clicked.
- Allow permission: a mirrored video appears; loading becomes running.
- Face the camera in good light: one face, 478 landmarks, 52 signals, transform available.
- Move your face out of view: counts return to zero and status says no face detected.
- Stop: preview clears and your browser/physical camera indicator turns off.
- Start again several times: no duplicate sessions or frozen video.
- Cancel while the permission prompt is pending; granting access afterward must not start a session.
- Stop while the tracker loads: camera should turn off and stay off.
- Deny permission: readable error and Start available for retry after restoring permission.
- Disconnect a USB webcam during tracking: session stops with an error.
- Toggle **Show face mesh** off/on: the camera keeps running and the mesh disappears/reappears.
- Move and tilt your head: the mesh should follow your eyes, brows, and mouth.
- Resize the window: the mesh stays aligned and controls remain usable.
- Leave the frame or stop the camera: the mesh clears immediately after detection/stop.

Automated checks:

```sh
npm run lint
npm run build
npx playwright install chromium
npm test
```

The browser suite uses Chromium's synthetic webcam and a public Google MediaPipe
portrait rendered into a canvas stream. It exercises the actual WASM/model, not
mock inference. A separate controlled-score test checks exact name mapping, updates, zero versus missing readings, and cleanup. The portrait test downloads its sample during the test run, so
that test needs internet. Tests never access your physical webcam. Screenshots
are written to `test-results/`.

Real hardware permissions, camera indicators, and browser-specific performance
still require the manual checklist above.

## Scope and next step

Implemented: React/Vite setup, webcam lifecycle, Face Landmarker, optional face mesh, live raw blendshape panel, simplified expression vector, estimated head orientation, ten retained local meme profiles with trained defaults, a persistent custom profile editor, face-trained profile vectors, weighted expression similarity, live closest-meme display, fast EMA smoothing, immediate match switching, neutral-face calibration, and aligned side-by-side media frames.

Next: tune profiles with real usage and add more expression categories where the
current ten-feature vector cannot separate similar faces.

## References and asset provenance

- [MediaPipe Face Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [Version 1 float16 Face Landmarker model](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)
- [Google MediaPipe public portrait test asset](https://storage.googleapis.com/mediapipe-assets/portrait.jpg)
- [Browser getUserMedia documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Vite getting started](https://vite.dev/guide/)

MediaPipe package/runtime and model remain third-party assets subject to their
upstream terms. Meme image provenance is recorded in `public/memes/CREDITS.md`.
