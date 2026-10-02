# Imported meme collection

The website bundles six selected profiles from [jacebrowning/memegen](https://github.com/jacebrowning/memegen).
`scripts/meme-defaults.json` is the allowlist for the profiles that ship; removed profiles stay out
of future syncs unless they are deliberately added back. The source revision is pinned in
`scripts/memegen-source.json`. Imports do not run during installation,
the production build, deployment, or a visitor's camera session.

## Refreshing the collection

1. Run `npm ci` and `npx playwright install chromium` if the browser is not installed.
2. Run `npm run memes:sync`. To update upstream, first change the pinned revision to a reviewed commit.
3. Review `docs/memes/import-report.json`, the images, and the resulting Library profiles.
4. Run tests, type checking, lint, and the production build; commit the manifest, images, source pin, and report together.

The importer downloads the pinned repository archive, inspects static template variants,
rejects animation and duplicate source content, and analyzes images in local Chromium.
MediaPipe runs in IMAGE mode with a two-face limit so a second face causes rejection.
Only single-face images with all 10 finite expression values in [0, 1] become profiles.
The existing camera feature extractor is reused. Imported profiles contain no hand values.
Images are reduced to at most 800 pixels on their longest side and served from this website.
Source expression vectors are derived automatically. Saved facial defaults override them in the site registry; gesture profiles require a live capture.
Users may refine the vectors with the existing camera training controls.

Image names use content hashes. Profile IDs use the template and original filename so training,
hidden choices, and backups survive repeated imports and source-image changes.
The existing curated profiles remain separate. A failed source download or a run with no usable
profiles preserves the previous manifest. Individual image failures are recorded in the report.
Images are written before an atomic manifest replacement. Cached source archives are ignored by Git.
Old hashed assets are retained so a failed import cannot break the last valid collection.
Selected profiles are retained if upstream removes an image or its new version fails analysis.
Their original provenance is retained and listed separately in the report. Profiles removed from
the allowlist are omitted from the manifest, backups, and future syncs.
This keeps hidden choices, camera-trained overrides, and old backups usable after an update.

## Attribution and image rights

`MEMEGEN-LICENSE.txt` contains the upstream software license. Each imported profile records
its repository revision, original image hash, repository image link, original source page when
available, and upstream image-license information when provided.

The software's MIT license does not establish blanket rights to every meme image. Where upstream
provides no image license, the profile explicitly records that image rights are unspecified.
The import report is a processing record, not a rights clearance or content review.

## Matching behavior

The first match appears immediately. A challenger must remain best by more than the existing
distance margin (0.005) for 600 ms. Changes in the challenger or loss of its advantage
restart confirmation. Scores remain live while the current image stays selected.
Camera stop, no face, calibration, and removal of the selected profile clear or replace selection
without waiting for that confirmation period.

The face and hand landmark overlay preference and neutral face calibration are saved in the
current browser. Calibration is personal to that browser and camera; the camera never starts
automatically when the page opens.
