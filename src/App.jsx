import { useEffect, useState } from 'react'
import Camera from './components/Camera.jsx'
import useMemeLibrary from './hooks/useMemeLibrary.js'

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
      <header className="page-header">
        <a className="wordmark" href="#mirror" aria-label="Mirror Image home">mirror image<span className="brand-period">.</span></a>
        <nav className="app-nav" aria-label="Main navigation">
          {[['mirror', 'Mirror', '#mirror'], ['library', 'Library', '#meme-collection'], ['settings', 'Settings', '#settings']].map(([id, label, href]) => (
            <a key={id} href={href} onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
      </header>
      {view === 'mirror' && <div className="view-heading"><div><p className="eyebrow">LIVE MIRROR</p><h1>A face for every feeling.</h1></div><p>Make a face. Meet your meme.</p></div>}
      <Camera library={library} view={view} />
      <footer><span>Processed on your device.</span><span>Your expressions, your collection.</span></footer>
    </main>
  )
}
