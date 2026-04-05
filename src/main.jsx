import { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase, getMyHousehold } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import HouseholdSetup from './pages/HouseholdSetup'
import MainApp from './pages/MainApp'
import './index.css'

function App() {
  const [user, setUser] = useState(null)
  const [household, setHousehold] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) checkHousehold(session.user)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) checkHousehold(session.user)
      else { setHousehold(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function checkHousehold(u) {
    const hh = await getMyHousehold(u.id)
    setHousehold(hh)
    setLoading(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🌿</div>
          <div style={{ fontSize: 14, color: '#888' }}>Loading HelloStinky...</div>
        </div>
      </div>
    )
  }

  if (!user) return <AuthPage onAuth={() => supabase.auth.getUser().then(({ data }) => { setUser(data.user); checkHousehold(data.user) })} />
  if (!household) return <HouseholdSetup user={user} onDone={() => checkHousehold(user)} />
  return <MainApp user={user} />
}

// Register service worker for push notifications + offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err)
    })
  })
}

createRoot(document.getElementById('root')).render(<App />)
