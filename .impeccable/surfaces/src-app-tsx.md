---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/index.css","src/components/Camera.tsx"]
---

# Mirror, Library, and Settings redesign

Audience: demo visitors first; technical reviewers can open diagnostics. Preserve tracking, profile editing, calibration and local storage. Primary action: Start camera. Responsive behavior keeps both previews accessible without shrinking controls.

Approved comp: .impeccable/mocks/decision/studio.png. User selected model-pick in the decision page and confirmed the choice. Mobile inherits the same system, with shorter stacked previews.

## Direction contract

THESIS: A light studio for comparing a live expression with its closest meme, with one clear entry action and progressively disclosed technical information.

OWN-WORLD: Near-white canvas, forest-green actions, charcoal type, quiet gray preview wells, modest rounded corners and an underlined active navigation item.

STORY: A visitor recognizes the camera comparison, starts the camera, and sees the match. Library supports focused profile editing; Settings exposes calibration, backup and diagnostics.

FIRST VIEWPORT: Compact horizontal masthead, left-aligned heading and description, two equal preview columns. Start camera sits in the left empty state. A short privacy statement closes the view. Phone navigation stays visible above compact stacked previews.

FORM: Light studio, grounded candidate 1 selected by the user; seed 45f65ec0. Professional familiar controls are intentional for a mixed demo audience.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
