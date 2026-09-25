export default function MatchMeter({ percentage }) {
  const rounded = Math.round(percentage)
  return (
    <div className="match-meter" aria-label={`${rounded}% overall match`}>
      <strong>{rounded}<span>%</span></strong>
      <span>MATCH</span>
      <div className="match-meter-track" aria-hidden="true"><span style={{ width: `${percentage}%` }} /></div>
    </div>
  )
}
