import TrainingPreview from './TrainingPreview.jsx'
import { useRef, useState } from 'react'
import { EXPRESSION_FEATURES } from '../tracking/featureExtractor'
import { prepareMemeImage } from '../data/memeLibrary'

const EMPTY_FEATURES = Object.fromEntries(
  Object.keys(EXPRESSION_FEATURES).map((feature) => [feature, 0]),
)

function imageSource(image) {
  if (!image) return ''
  if (image.startsWith('data:') || image.startsWith('blob:')) return image
  return `${import.meta.env.BASE_URL}${image.replace(/^\//, '')}`
}

function MemeImage({ meme }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="meme-image-error">Image unavailable: {meme.name}</span>
  return <img src={imageSource(meme.image)} alt={meme.alt || `${meme.name} meme`} onError={() => setFailed(true)} />
}

function AddMemeForm({ onAdd }) {
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [expression, setExpression] = useState('')
  const [file, setFile] = useState(null)
  const [features, setFeatures] = useState(EMPTY_FEATURES)
  const [status, setStatus] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  function setFeature(feature, value) {
    setFeatures((current) => ({ ...current, [feature]: Number(value) }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget

    if (!file) {
      setStatus('Choose an image first.')
      return
    }

    setIsSaving(true)
    setStatus('Preparing image…')

    try {
      const image = await prepareMemeImage(file)
      const meme = {
        id: `custom-${crypto.randomUUID()}`,
        name: name.trim(),
        image,
        alt: `${name.trim()} custom meme face.`,
        expressionLabel: expression.trim() || 'Custom expression',
        features,
        profileSource: 'manual',
        notes: 'Added from this browser.',
        headPose: null,
        source: null,
      }

      await onAdd(meme)
      form.reset()
      setName('')
      setExpression('')
      setFile(null)
      setFeatures(EMPTY_FEATURES)
      setStatus(`${meme.name} added.`)
      setIsOpen(false)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not add that image.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="meme-manager" aria-label="Manage meme faces">
      <button
        className="manager-toggle"
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{isOpen ? 'Close editor' : 'Add a meme face'}</span>
        <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen ? (
        <form className="add-meme-form" onSubmit={handleSubmit}>
          <div className="form-intro">
            <div>
              <p className="eyebrow">New profile</p>
              <h3>Teach Mirror Image a face</h3>
            </div>
            <p>Upload an image, then set the expression sliders to describe it.</p>
          </div>

          <div className="meme-form-fields">
            <label>
              <span>Meme name</span>
              <input
                name="name"
                required
                maxLength="60"
                placeholder="Suspicious hamster"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              <span>Expression label</span>
              <input
                name="expression"
                maxLength="80"
                placeholder="Raised brow, slight squint"
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
              />
            </label>
            <label className="file-field">
              <span>Face image</span>
              <input
                name="image"
                type="file"
                required
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="feature-editor">
            {Object.keys(EXPRESSION_FEATURES).map((feature) => (
              <label className="feature-slider" key={feature}>
                <span>{feature}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={features[feature]}
                  onChange={(event) => setFeature(feature, event.target.value)}
                />
                <output>{features[feature].toFixed(2)}</output>
              </label>
            ))}
          </div>

          <div className="form-actions">
            <button className="primary-action" type="submit" disabled={isSaving}>
              {isSaving ? 'Adding…' : 'Add to collection'}
            </button>
            <span role="status">{status}</span>
          </div>
        </form>
      ) : status ? <p className="manager-status" role="status">{status}</p> : null}
    </section>
  )
}

export default function MemeGallery({
  memes,
  addMeme,
  removeMeme,
  restoreBuiltIns,
  updateMemeFeatures,
  resetMemeFeatures,
  liveExpression,
  stream, phase, onStart, onStop, cameraError,
  hiddenCount,
  error,
}) {
  const [selectedId, setSelectedId] = useState(memes[0]?.id ?? '')
  const [trainingStatus, setTrainingStatus] = useState('')
  const dialogRef = useRef(null)
  const selectedMeme = memes.find((meme) => meme.id === selectedId) ?? memes[0]
  const featureNames = Object.keys(EXPRESSION_FEATURES)
  const liveFeatureCount = featureNames.filter((name) => Number.isFinite(liveExpression?.[name])).length
  const canTrain = Boolean(selectedMeme) && liveFeatureCount === featureNames.length

  async function handleAdd(meme) {
    await addMeme(meme)
    setSelectedId(meme.id)
    dialogRef.current?.showModal()
  }

  async function handleRemove() {
    if (!selectedMeme) return
    await removeMeme(selectedMeme.id)
    dialogRef.current?.close()
  }

  async function handleTrain() {
    if (!selectedMeme || !canTrain) return
    try {
      const capturedFeatures = Object.fromEntries(featureNames.map((name) => [name, liveExpression[name]]))
      await updateMemeFeatures(selectedMeme.id, capturedFeatures)
      setTrainingStatus(`${selectedMeme.name} now matches this expression.`)
    } catch (cause) {
      setTrainingStatus(cause instanceof Error ? cause.message : 'The expression could not be saved.')
    }
  }

  function handleResetProfile() {
    if (!selectedMeme) return
    resetMemeFeatures(selectedMeme.id)
    setTrainingStatus(`${selectedMeme.name} restored to its original profile.`)
  }

  return (
    <section className="meme-gallery debug-panel" id="meme-collection" aria-label="Meet your meme counterparts">
      <div className="gallery-heading">
        <div>
          <p className="eyebrow">Local expression library</p>
          <h2 id="meme-gallery-title">Your meme collection.</h2><p className="library-hint">Choose a face to teach it your expression.</p>
        </div>
        <div className="collection-summary">
          <span>{memes.length} profiles</span>
          {hiddenCount > 0 ? (
            <button className="restore-button" type="button" onClick={restoreBuiltIns}>
              Restore {hiddenCount} built-in{hiddenCount === 1 ? '' : 's'}
            </button>
          ) : null}
        </div>
      </div>

      <AddMemeForm onAdd={handleAdd} />
      {error ? <p className="library-error" role="alert">{error}</p> : null}

      {memes.length > 0 ? (
        <>
          <div className="meme-grid" aria-label="Available meme profiles">
            {memes.map((meme) => (
              <button
                className={`meme-card ${selectedMeme?.id === meme.id ? 'is-selected' : ''}`}
                key={meme.id}
                type="button"
                aria-label={`Inspect ${meme.name}`}
                aria-pressed={selectedMeme?.id === meme.id}
                onClick={() => {
                  setSelectedId(meme.id)
                  setTrainingStatus('')
                  dialogRef.current?.showModal()
                }}
              >
                <div className="meme-card-image meme-thumbnail">
                  <MemeImage meme={meme} />
                </div>
                <span className="meme-name">{meme.name}</span>
                <small className="meme-expression">{meme.expressionLabel}</small>
                {meme.handFeatures ? <small className="hand-aware-label">HAND-AWARE</small> : null}
              </button>
            ))}
          </div>

          {selectedMeme ? (
            <dialog ref={dialogRef} className="training-dialog" aria-labelledby="training-title">
              <div className="dialog-heading"><div><p className="eyebrow">TEACH AN EXPRESSION</p><h2 id="training-title">{selectedMeme.name}</h2></div><button type="button" className="close-dialog" onClick={() => dialogRef.current.close()}>Close</button></div>
            <article className="meme-inspector" role="region" aria-label="Selected meme profile">
              <div className="training-comparison">
              <TrainingPreview stream={stream} phase={phase} onStart={onStart} onStop={onStop} cameraError={cameraError} />
              <div className="training-target"><p className="eyebrow">CHOSEN MEME</p>
              <div className="inspector-image meme-selected-image">
                <MemeImage key={selectedMeme.id} meme={selectedMeme} />
              </div>
              </div></div>
              <div className="inspector-copy meme-profile">

                {selectedMeme.browserTrained ? <span className="trained-badge">TRAINED WITH YOUR FACE</span> : null}
                <div className="profile-training">
                  <div>
                    <strong>Teach this meme your expression</strong>
                    <p>{canTrain
                      ? (selectedMeme.handFeatures
                        ? 'Match the face and hand pose shown, then save your facial expression. The required hand gesture stays attached to this meme.'
                        : 'Hold the face you want to associate with this meme, then save it.')
                      : (selectedMeme.handFeatures
                        ? 'Start the camera, keep your face visible, and copy the hand-to-face gesture shown.'
                        : 'Start the camera and keep your face visible to capture all ten values.')}</p>
                  </div>
                  <div className="profile-training-actions">
                    <button className="train-meme-button" type="button" onClick={handleTrain} disabled={!canTrain}>
                      Match this meme to my face
                    </button>
                    {selectedMeme.browserTrained && !selectedMeme.id.startsWith('custom-') ? (
                      <button className="reset-profile-button" type="button" onClick={handleResetProfile}>
                        Reset original values
                      </button>
                    ) : null}
                  </div>
                  <span className="training-status" aria-live="polite">{trainingStatus}</span>
                </div>
                <details className="profile-details"><summary>Expression values & notes</summary>                <p className="debug-description">{selectedMeme.notes || selectedMeme.expressionLabel}</p>
                <dl className="meme-features">
                  {Object.entries(selectedMeme.features).map(([feature, value]) => (
                    <div key={feature}>
                      <dt>{feature}</dt>
                      <dd>{Number(value).toFixed(2)}</dd>
                    </div>
                  ))}
                </dl>
                {selectedMeme.handFeatures ? <><h3 className="hand-profile-title">Required hand gesture</h3><dl className="meme-features hand-features">
                  {Object.entries(selectedMeme.handFeatures).map(([feature, value]) => (
                    <div key={feature}>
                      <dt>{feature}</dt>
                      <dd>{Number(value).toFixed(2)}</dd>
                    </div>
                  ))}
                </dl></> : null}
</details>
                <div className="inspector-actions meme-source">
                  {selectedMeme.source?.pageUrl ? (
                    <a href={selectedMeme.source.pageUrl} target="_blank" rel="noreferrer">
                      Image source
                    </a>
                  ) : <span>Stored in this browser</span>}
                  <button className="remove-meme-button" type="button" onClick={handleRemove}>
                    Remove meme
                  </button>
                </div>
              </div>
            </article>
            </dialog>
          ) : null}
        </>
      ) : (
        <div className="empty-library">
          <p>Your collection is empty.</p>
          <p>Add a meme face above or restore the built-in profiles.</p>
        </div>
      )}
    </section>
  )
}
