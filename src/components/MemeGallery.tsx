import TrainingPreview from './TrainingPreview.tsx'
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
      setStatus('Select an image to continue.')
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
      setStatus(`${meme.name} added to the library.`)
      setIsOpen(false)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not add that image.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="meme-manager" aria-label="Manage meme profiles">
      <button
        className="manager-toggle"
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{isOpen ? 'Close editor' : 'Add profile'}</span>

      </button>

      {isOpen ? (
        <form className="add-meme-form" onSubmit={handleSubmit}>
          <div className="form-intro">
            <div>

              <h3>Add a meme profile</h3>
            </div>
            <p>Upload an image and set the expression values used for matching.</p>
          </div>

          <div className="meme-form-fields">
            <label>
              <span>Meme name</span>
              <input
                name="name"
                required
                maxLength={60}
                placeholder="e.g., Surprised Pikachu"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              <span>Expression description</span>
              <input
                name="expression"
                maxLength={80}
                placeholder="Raised brow, slight squint"
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
              />
            </label>
            <label className="file-field">
              <span>Meme image</span>
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
              {isSaving ? 'Adding…' : 'Add profile'}
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
  liveHandFeatures,
  stream, phase, onStart, onStop, cameraError,
  hiddenCount,
  error,
}) {
  const [selectedId, setSelectedId] = useState(memes[0]?.id ?? '')
  const [trainingStatus, setTrainingStatus] = useState('')
  const dialogRef = useRef(null)
  const selectedMeme = memes.find((meme) => meme.id === selectedId) ?? memes[0]
  const featureNames = Object.keys(EXPRESSION_FEATURES)
  const handFeatureNames = Object.keys(selectedMeme?.handFeatures ?? {})
  const liveFeatureCount = featureNames.filter((name) => Number.isFinite(liveExpression?.[name])).length
  const hasLiveHand = !selectedMeme?.handFeatures ||
    (liveHandFeatures?.handPresent >= 0.5 && handFeatureNames.every((name) => Number.isFinite(liveHandFeatures?.[name])))
  const canTrain = Boolean(selectedMeme) && liveFeatureCount === featureNames.length && hasLiveHand

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
      const capturedHandFeatures = selectedMeme.handFeatures
        ? Object.fromEntries(handFeatureNames.map((name) => [name, liveHandFeatures[name]]))
        : undefined
      await updateMemeFeatures(selectedMeme.id, capturedFeatures, capturedHandFeatures)
      setTrainingStatus(`Saved the current ${capturedHandFeatures ? 'expression and hand pose' : 'expression'} to this profile.`)
    } catch (cause) {
      setTrainingStatus(cause instanceof Error ? cause.message : 'The expression could not be saved.')
    }
  }

  function handleResetProfile() {
    if (!selectedMeme) return
    resetMemeFeatures(selectedMeme.id)
    setTrainingStatus(`Restored the original profile values for ${selectedMeme.name}.`)
  }

  return (
    <section className="meme-gallery" id="library-content" aria-label="Meme profiles">
      <div className="gallery-heading">
        <div>

          <h1 id="meme-gallery-title">Meme profiles</h1><p className="library-hint">Select a profile to review or update its expression values.</p>
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
                {meme.handFeatures ? <small className="hand-aware-label">Hand gesture</small> : null}
              </button>
            ))}
          </div>

          {selectedMeme ? (
            <dialog ref={dialogRef} className="training-dialog" aria-labelledby="training-title">
              <div className="dialog-heading"><div><h2 id="training-title">{selectedMeme.name}</h2></div><button type="button" className="close-dialog" onClick={() => dialogRef.current.close()}>Close</button></div>
            <article className="meme-inspector" role="region" aria-label="Selected meme profile">
              <div className="training-comparison">
              <TrainingPreview stream={stream} phase={phase} onStart={onStart} onStop={onStop} cameraError={cameraError} />
              <div className="training-target"><p className="preview-caption">Profile image</p>
              <div className="inspector-image meme-selected-image">
                <MemeImage key={selectedMeme.id} meme={selectedMeme} />
              </div>
              </div></div>
              <div className="inspector-copy meme-profile">

                {selectedMeme.browserTrained ? <span className="trained-badge">Updated from camera{selectedMeme.handsTrained ? ' · Includes hand gesture' : ''}</span> : null}
                <div className="profile-training">
                  <div>
                    <strong>Update expression profile</strong>
                    <p>{canTrain
                      ? (selectedMeme.handFeatures
                        ? 'Hold the expression and hand pose to associate with this profile, then save the current readings.'
                        : 'Hold the expression to associate with this profile, then save the current readings.')
                      : (selectedMeme.handFeatures
                        ? 'Start the camera, keep your face visible, and show at least one hand to capture the full profile.'
                        : 'Start the camera and keep your face visible to capture all 10 expression values.')}</p>
                  </div>
                  <div className="profile-training-actions">
                    <button className="train-meme-button" type="button" onClick={handleTrain} disabled={!canTrain}>
                      {selectedMeme.handFeatures ? 'Save expression and hand profile' : 'Save expression profile'}
                    </button>
                    {selectedMeme.browserTrained && !selectedMeme.id.startsWith('custom-') ? (
                      <button className="reset-profile-button" type="button" onClick={handleResetProfile}>
                        Reset original values
                      </button>
                    ) : null}
                  </div>
                  <span className="training-status" aria-live="polite">{trainingStatus}</span>
                </div>
                <details className="profile-details"><summary>Profile details</summary>                <p className="debug-description">{selectedMeme.notes || selectedMeme.expressionLabel}</p>
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
          <p>No meme profiles available.</p>
          <p>Add a profile or restore the built-in profiles.</p>
        </div>
      )}
    </section>
  )
}
