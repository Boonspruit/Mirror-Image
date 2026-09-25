import { EXPRESSION_FEATURES } from '../tracking/featureExtractor.ts'

export default function ExpressionPanel({ vector }) {
  return (
    <section className="debug-panel expression-panel" aria-labelledby="expression-title">
      <div className="debug-heading"><div><p className="eyebrow">THE BUILDING BLOCKS</p><h2 id="expression-title">Expression vector</h2></div><span className="debug-status">10 expression features · 3 head angles</span></div>
      <p className="debug-description">Left and right signals are averaged into one value, then every feature uses an exponential moving average: 80% of the previous value plus 20% of the newest reading. Compare these steadier values with the raw readings below.</p>
      <div className="expression-grid">
        {Object.entries(EXPRESSION_FEATURES).map(([name, sources]) => {
          const value = vector?.expression[name]
          return <div className="feature-row" data-expression={name} key={name} title={sources.length === 2 ? `(${sources.join(' + ')}) / 2` : sources[0]}>
            <div className="feature-label"><code>{name}</code><span className="feature-value">{Number.isFinite(value) ? value.toFixed(3) : '—'}</span></div>
            {Number.isFinite(value) ? <meter min="0" max="1" value={value} aria-label={name} /> : <div className="empty-meter" aria-hidden="true" />}
          </div>
        })}
      </div>
      <div className="pose-heading"><h3>Head orientation</h3><span>{vector?.headPose ? 'Estimated angles · degrees' : 'Waiting for a valid head transform'}</span></div>
      <dl className="pose-values">
        {[['yaw', 'Turn left / right'], ['pitch', 'Look up / down'], ['roll', 'Tilt side to side']].map(([name, hint]) => {
          const value = vector?.headPose?.[name]
          return <div key={name}><dt>{name}<span>{hint}</span></dt><dd data-pose={name}>{Number.isFinite(value) ? `${Math.abs(value) < 0.05 ? '0.0' : value.toFixed(1)}°` : '—'}</dd></div>
        })}
      </dl>
      <p className="debug-hint">Angles use the original camera coordinates; the preview is mirrored. Smoothing reduces frame-to-frame jitter, and a saved neutral calibration subtracts personal resting offsets before these values are displayed.</p>
    </section>
  )
}
