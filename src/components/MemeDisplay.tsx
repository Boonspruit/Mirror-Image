import { useState } from 'react'
import { compareExpressions, DEFAULT_FEATURE_WEIGHTS, HAND_FEATURE_WEIGHTS } from '../matching/similarity.ts'
import MatchMeter from './MatchMeter.tsx'

const GROUPS = {
  Eyes: ['eyeWide', 'eyeSquint'],
  Brows: ['browInnerUp', 'browDown'],
  'Mouth & cheeks': ['jawOpen', 'smile', 'frown', 'mouthPucker', 'cheekSquint', 'noseSneer'],
}

function localImage(path) {
  return path.startsWith('data:') ? path : import.meta.env.BASE_URL + path.slice(1)
}

function MatchImage({ meme }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <div className="match-image-error">Image unavailable<br />{meme.name}</div>
  return <img src={localImage(meme.image)} alt={meme.alt} onError={() => setFailed(true)} />
}

export default function MemeDisplay({ matches, expression, handFeatures, phase, pendingId, calibrated }) {
  const best = matches[0]
  const pending = matches.find(({ meme }) => meme.id === pendingId)
  if (!best?.comparison) {
    const message = phase === 'running'
      ? 'Look toward the camera to find your closest meme.'
      : 'Start the camera to reveal your closest meme.'
    return (
      <section id="live-match" className="match-display match-empty" aria-labelledby="match-title">
        <div className="match-heading"><div><p className="eyebrow">YOUR MEME MATCH</p><h2 id="match-title">Waiting for an expression</h2></div></div>
        <div className="match-image match-placeholder-frame" aria-hidden="true"><span className="match-placeholder">?</span></div>
        <p className="match-empty-message">{message}</p>
      </section>
    )
  }

  const groupScores: [string, number | undefined][] = Object.entries(GROUPS).map(([name, features]) => {
    const weights = Object.fromEntries(features.map((feature) => [feature, DEFAULT_FEATURE_WEIGHTS[feature]]))
    return [name, compareExpressions(expression, best.meme.features, weights)?.percentage] as [string, number | undefined]
  })
  if (best.meme.handFeatures) {
    groupScores.push(['Hand gesture', compareExpressions(handFeatures, best.meme.handFeatures, HAND_FEATURE_WEIGHTS)?.percentage])
  }

  return (
    <section id="live-match" className="match-display" aria-labelledby="match-title">
      <div className="match-heading"><div><p className="eyebrow">YOUR MEME MATCH</p><h2 id="match-title">{best.meme.name}</h2></div><span className="raw-badge">{calibrated ? 'CALIBRATED MATCH' : 'LIVE MATCH'}</span></div>
      <div className="match-visual"><div className="match-image"><MatchImage key={best.meme.id} meme={best.meme} /></div>
      </div>
      <div className="match-copy">

        <MatchMeter percentage={best.comparison.percentage} />
        <details className="match-details"><summary>Match details</summary>        <div className="runner-ups"><span>Also close</span>{matches.slice(1, 4).map(({ meme, comparison }) => <div key={meme.id}><span>{meme.name}</span><strong>{Math.round(comparison.percentage)}%</strong></div>)}</div>

        <dl className="group-matches">
          {groupScores.map(([name, percentage]) => <div key={name}><dt>{name}</dt><dd>{Number.isFinite(percentage) ? `${Math.round(percentage)}%` : '—'}</dd></div>)}
        </dl>
        <div className="match-meta"><span>Distance {best.comparison.distance.toFixed(3)}</span><span>Coverage {Math.round(best.comparison.coverage * 100)}%</span>{pending && <span>Checking {pending.meme.name}…</span>}</div>
      <p className="match-caveat">{calibrated ? 'Your neutral baseline is subtracted before smoothing. ' : ''}The latest frame contributes 65% of each smoothed face value. Hand-aware memes can compare one or two hands and mouth proximity. Matches are checked every 100 ms, and a satisfied gesture displays immediately. Percentages are distance scores, not confidence.</p>
        </details>
      </div>

    </section>
  )
}
