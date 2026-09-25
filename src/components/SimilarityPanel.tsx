import { DEFAULT_FEATURE_WEIGHTS } from '../matching/similarity.ts'

export default function SimilarityPanel({ expression, memeCount }) {
  const readyFeatures = expression
    ? Object.values(expression).filter(Number.isFinite).length
    : 0

  return (
    <section className="debug-panel similarity-panel" aria-labelledby="similarity-title">
      <div className="debug-heading">
        <div><p className="eyebrow">MATCHING ENGINE</p><h2 id="similarity-title">Weighted similarity</h2></div>
        <span className="debug-status">{readyFeatures} / {Object.keys(DEFAULT_FEATURE_WEIGHTS).length} features ready</span>
      </div>
      <p className="debug-description">Each difference is squared, multiplied by its weight, then combined into a normalized distance from 0 to 1. A smaller distance means a closer expression.</p>
      <div className="formula" aria-label="Weighted distance formula">
        distance = √( Σ weight × (you − meme)² ÷ Σ used weights )
      </div>
      <dl className="weight-grid">
        {Object.entries(DEFAULT_FEATURE_WEIGHTS).map(([name, weight]) => <div key={name}>
          <dt>{name}</dt><dd>{weight.toFixed(1)}×</dd>
        </div>)}
      </dl>
      <div className="engine-note"><span>{memeCount} profiles loaded</span><span>Expression features only</span><span>100 ms match interval</span></div>
      <p className="debug-hint">The percentage is <code>(1 − normalized distance) × 100</code>. It is a relative expression score, not model confidence or a probability.</p>
    </section>
  )
}
