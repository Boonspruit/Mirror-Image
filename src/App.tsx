import { useEffect, useState } from 'react'
import Camera from './components/Camera.tsx'
import Icon from './components/Icon.tsx'
import useMemeLibrary from './hooks/useMemeLibrary.ts'

function currentView() {
  return location.hash === '#meme-collection' ? 'library' : location.hash === '#settings' ? 'settings' : 'mirror'
}

export default function App() {
  const library = useMemeLibrary()
  const [view, setView] = useState(currentView)
  useEffect(() => {
    const update = () => setView(currentView())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return (
    <main className="app">
      <a className="skip-link" href="#page-content" onClick={(event) => { event.preventDefault(); document.getElementById('page-content')?.focus() }}>Skip to content</a>
      <header className="page-header">
        <a className="wordmark" href="#mirror" aria-label="Mirror Image home">mirror image<span className="brand-period">.</span></a>
        <nav className="app-nav" aria-label="Main navigation">
          {[['mirror', 'Mirror', '#mirror'], ['library', 'Library', '#meme-collection'], ['settings', 'Settings', '#settings']].map(([id, label, href]) => (
            <a key={id} href={href} onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
      </header>
      <div id="page-content" tabIndex={-1}>
      {view === 'mirror' && <div className="view-heading"><div><h1>Live expression matching</h1></div><p>Compare your expression with meme profiles in real time.</p></div>}
      <Camera library={library} view={view} />
      </div>
      <footer><Icon name="lock" /><span>Camera processing stays in your browser.</span></footer>
    </main>
  )
}
