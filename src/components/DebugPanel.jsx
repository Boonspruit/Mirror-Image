// These are MediaPipe category names, kept separate for left and right sides.
// The expression panel separately shows their combined feature values.
const FEATURE_GROUPS = [
  { title: 'Eyes', names: ['eyeWideLeft', 'eyeWideRight', 'eyeSquintLeft', 'eyeSquintRight'] },
  { title: 'Brows', names: ['browInnerUp', 'browDownLeft', 'browDownRight'] },
  { title: 'Mouth', names: ['jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPucker'] },
  { title: 'Cheeks & nose', names: ['cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight'] },
]

function FeatureRow({ name, value }) {
  const available = Number.isFinite(value)
  return (
    <div className="feature-row" data-feature={name}>
      <div className="feature-label"><code>{name}</code><span className="feature-value">{available ? value.toFixed(3) : '—'}</span></div>
      {available
        ? <meter min="0" max="1" value={value} aria-label={name} />
        : <div className="empty-meter" aria-hidden="true" />}
    </div>
  )
}

export default function DebugPanel({ categories, phase, hasFace }) {
  // Look up by name rather than category position: model ordering is irrelevant.
  // Missing data stays missing; a real score of zero is still a valid reading.
  const scores = Object.fromEntries(categories.map(({ categoryName, score }) => [categoryName, score]))
  const available = phase === 'running' && hasFace && categories.length > 0
  const status = available ? 'Live · updates up to 4× / sec'
    : phase === 'running' ? (hasFace ? 'Blendshape data unavailable' : 'No face detected')
    : phase === 'loading' ? 'Loading tracker…'
    : phase === 'requesting' ? 'Waiting for camera permission'
    : phase === 'error' ? 'Session stopped' : 'Start the camera to see values'

  return (
    <section className="debug-panel" aria-labelledby="debug-title">
      <div className="debug-heading"><div><p className="eyebrow">EXPRESSION LAB</p><h2 id="debug-title">Live blendshapes</h2></div><span className="debug-status">{status}</span></div>
      <p className="debug-description">Raw scores from 0 to 1: higher means a stronger signal for that facial movement. These are not emotion labels or match percentages. Left and right follow MediaPipe’s labels.</p>
      <div className="feature-groups">
        {FEATURE_GROUPS.map(({ title, names }) => (
          <section className="feature-group" key={title} aria-label={title}>
            <h3>{title}</h3>
            {names.map((name) => <FeatureRow key={name} name={name} value={available ? scores[name] : undefined} />)}
          </section>
        ))}
      </div>
      <details className="all-blendshapes">
        <summary>All raw blendshapes{available ? ` (${categories.length})` : ''}</summary>
        {available ? <div className="all-feature-grid">
          {[...categories].sort((a, b) => a.categoryName.localeCompare(b.categoryName)).map(({ categoryName, score }) =>
            <FeatureRow key={categoryName} name={categoryName} value={score} />)}
        </div> : <p>Values appear when a face is being tracked.</p>}
      </details>
      <p className="debug-hint">Try opening your mouth, raising your brows, squinting, or smiling. A dash means no reading. Scores are not yet calibrated or smoothed by this app.</p>
    </section>
  )
}
