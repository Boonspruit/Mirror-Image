import { useState } from 'react'
import { compareExpressions, DEFAULT_FEATURE_WEIGHTS, HAND_FEATURE_WEIGHTS } from '../matching/similarity.ts'
import MatchMeter from './MatchMeter.tsx'
import Icon from './Icon.tsx'

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
      ? 'Keep your face in view to compare your expression with the profiles.'
      : phase === 'loading' || phase === 'requesting' ? 'Your match will appear when tracking is ready.' : 'Your closest match will appear here.'
    return (
      <section id="live-match" className="match-display match-empty" aria-labelledby="match-title">
        <div className="match-heading"><h2 id="match-title">Closest match</h2></div>
        <div className="match-image match-placeholder-frame"><div className="match-placeholder"><Icon name="image" className="empty-icon" /><h3>No match yet</h3><p>{message}</p></div></div>
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
      <div className="match-heading"><h2 id="match-title">Closest match</h2></div>
      <div className="match-visual"><div className="match-image"><MatchImage key={best.meme.id} meme={best.meme} /></div>
      </div>
      <div className="match-copy">
        <h3 className="matched-name">{best.meme.name}</h3>

        <MatchMeter percentage={best.comparison.percentage} />
        <details className="match-details"><summary>Scoring details</summary>        <div className="runner-ups"><span>Other close matches</span>{matches.slice(1, 4).map(({ meme, comparison }) => <div key={meme.id}><span>{meme.name}</span><strong>{Math.round(comparison.percentage)}%</strong></div>)}</div>

        <dl className="group-matches">
          {groupScores.map(([name, percentage]) => <div key={name}><dt>{name}</dt><dd>{Number.isFinite(percentage) ? `${Math.round(percentage)}%` : '—'}</dd></div>)}
        </dl>
        <div className="match-meta"><span>Distance {best.comparison.distance.toFixed(3)}</span><span>Coverage {Math.round(best.comparison.coverage * 100)}%</span>{pending && <span>Checking {pending.meme.name}…</span>}</div>
      <p className="match-caveat">{calibrated ? 'Your neutral baseline is subtracted before smoothing. ' : ''}The latest frame contributes 65% of each smoothed face value. Profiles with hand gestures can compare up to two hands and mouth proximity. Matches update every 100 ms; a matching gesture appears immediately. Percentages indicate relative similarity, not model confidence.</p>
        </details>
      </div>

    </section>
  )
}
