# Mirror Image design

The Light studio direction serves demo visitors first. Technical reviewers can open scoring details and diagnostics. Approved visual reference: [studio.png](.impeccable/mocks/decision/studio.png). Product scope lives in [PRODUCT.md](PRODUCT.md); the direction contract lives in [.impeccable/surfaces/src-app-tsx.md](.impeccable/surfaces/src-app-tsx.md). Implemented values below come from `src/index.css` and the named components. Machine-readable values live in `.impeccable/design.json`.

## Visual system

Use a near-white canvas (`#f7f8f5`), white surfaces, gray preview wells (`#e9edef`), charcoal text (`#111817`) and forest green actions (`#285947`, hover `#1d4436`). Muted text is `#59635f`; dividers are `#d4dcda`. Reserve `#9c3425` for failures and removal. Standard preview/card corners are 14px, controls 8px. Surfaces are flat; the modal alone uses a backdrop and shadow.

Public Sans is bundled at weights 400, 600, 700 and 900; the current interface uses 400 for body copy, 600 for actions/readouts and 700 for headings/wordmark. Font synthesis is disabled. Use tabular numbers for scores, counts and feature values. Desktop Mirror title is `clamp(34px, 4.65vw, 70px)` with 1.12 line height; panel titles are `clamp(23px, 2.12vw, 32px)`. Library/Settings titles are `clamp(32px, 3.2vw, 46px)`. At 600px and below, page titles become 30px and panel titles 21px; the Mirror title becomes 28px at 360px and below.

The app is centered at a maximum width of 1600px, with horizontal padding `clamp(24px, 3.86vw, 62px)`. Its white masthead is 72–89px tall on desktop. Mirror has two equal columns, a 20–36px gap and preview ratio 1.291:1. Videos and meme images use `object-fit: contain`; camera video and tracking overlays are mirrored. Keep image content visible without cropping. Buttons have a 46px minimum height; text fields are 46px high with 16px text, checkboxes are 20px square and range controls have a 44px minimum height. The empty-state camera action grows from 48px to 66px high on desktop.

## Navigation and states

`src/App.tsx` provides persistent Mirror (`#mirror`), Library (`#meme-collection`) and Settings (`#settings`) navigation. The wordmark returns to Mirror. Active navigation uses `aria-current="page"`, green text and a 3px underline. The skip link focuses `#page-content`. View changes keep the shared camera component mounted, so the live session is available in Library and Settings. The footer says “Camera processing stays in your browser.”

`Camera.tsx` has idle, requesting, loading, running and error phases. Idle shows “Camera is off” and **Start camera**. Requesting shows browser-permission guidance and **Cancel**. Loading shows the video with a preparation label; running shows **Live**, face/hand status and **Stop camera**. Failure shows “Camera unavailable”, actionable error text and **Try again**. Error messages use `role="alert"`; camera readouts use status semantics. Do not communicate state through the dot color alone.

`MemeDisplay.tsx` shows “No match yet” before a comparison exists, with phase-specific guidance. A live match presents the contained image, profile name, rounded similarity percentage and a 6px meter. **Scoring details** is closed initially and contains runner-ups, feature-group scores, distance, coverage and the matching explanation. Percentages express relative similarity, not model confidence. Missing images retain the profile name in an “Image unavailable” fallback.

## Library and profile editor

`MemeGallery.tsx` uses a grid of selectable profile cards with 4:3 images, names, expression descriptions and optional hand-gesture badges. The selected card exposes `aria-pressed`; opening it uses a native modal dialog. The modal is at most 940px wide, with 30px padding, 16px corners and a maximum height of `100dvh - 48px`. Camera and target stay side by side until 360px. Keep native dialog keyboard/focus behavior and its labeled heading and **Close** action.

**Add profile** reveals labeled name, description, image inputs and 0–1 expression sliders. Saving exposes progress and completion status. The inspector allows saving a live expression, or expression plus hand readings for gesture profiles, only when the required readings are available. Camera edits have a badge; edited built-ins offer **Reset original values**. **Profile details** discloses numerical values; source information and **Remove meme** follow it. Hidden built-ins can be restored. An empty library offers adding or restoring profiles. Library/storage errors use alerts; capture feedback is polite live text. Custom profiles and edits are stored locally in this browser.

## Settings and progressive disclosure

`Camera.tsx` and `ProfileTransfer.tsx` keep camera/landmark preferences, neutral calibration and profile backup visible. Settings is at most 1080px wide. Its camera row uses a column up to 360px plus a flexible preferences column, with a 36px gap. Calibration is disabled without a live detected face or during its countdown; feedback reports success or the corrective next step. Backup actions expose import progress and success/error feedback.

**Advanced diagnostics** is closed initially. It contains tracking counts, processing status, neutral calibration, expression values, matching calculations and blendshape signals. Preserve semantic labels and readable raw values for reviewers while keeping the primary demo simple. Further numerical detail uses native `details` disclosures.

## Responsive rules

- **≤1100px:** Library becomes 3 columns; add-form fields become 2 columns with a full-width file input. Expression and weight grids become 3 columns; feature groups become 2.
- **≤760px:** Settings camera row, feature editor, tracking readout and pose values become single columns. Settings preview caps at 400px; profile-value grid becomes 3 columns. Library heading stacks.
- **≤600px:** App padding is 20px. Wordmark and full-width navigation occupy separate rows. Mirror previews stack with a 26px gap; both use 4:3, while an empty match well has a 196px minimum height. Start camera fills its well width and stays at least 48px high. Library becomes 2 columns with 14px gaps; add-form fields stack. Modal uses `100vw - 24px`, `100dvh - 24px`, 20px padding and 14px corners. Training comparison remains two columns. Settings preview uses 16:10; training actions stack. Expression/weight grids become 2 columns and feature groups become 1.
- **≤360px:** Padding becomes 16px; camera well has a 244px minimum height with absolutely positioned video. Training comparison becomes one column. Body minimum width is 320px.

## Accessibility, motion and copy

Interactive focus uses a 3px `#52826c` outline with 4px offset, including the visually hidden import input through its label. Keep labeled fields, image alternatives, native disclosure controls, modal semantics and text alongside live status colors. Disabled actions must reflect prerequisites. Preserve content visibility and practical control sizes on narrow screens.

Motion follows state changes: score width transitions for 180ms; card border/background transitions for 160ms; a changed match image fades from 0.65 opacity for 180ms. With `prefers-reduced-motion: reduce`, transitions/animations are removed and scrolling is automatic.

Use short, familiar professional copy: **Start camera**, **Closest match**, **Add profile**, **Calibrate face**. Explain errors with a concrete recovery action. Keep technical descriptions in disclosed detail when possible. Retain Mirror Image; avoid slogans, testimonials, accuracy claims or performance promises unsupported by implementation or supplied evidence. Describe browser processing and local profile storage precisely.
