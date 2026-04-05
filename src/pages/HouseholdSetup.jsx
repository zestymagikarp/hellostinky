import { useState } from 'react'
import { createHousehold, joinHousehold } from '../lib/supabase'

export default function HouseholdSetup({ user, onDone }) {
  const [tab, setTab] = useState('create')
  const [hhName, setHhName] = useState('')
  const [code, setCode] = useState('')
  const [created, setCreated] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const hh = await createHousehold(hhName || `${user.user_metadata?.name || 'Our'}'s Household`, user.id)
      setCreated(hh)
    } catch (err) { setError(err.message) }
    setLoading(false)
  }

  async function handleJoin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await joinHousehold(code, user.id)
      onDone()
    } catch (err) { setError(err.message) }
    setLoading(false)
  }

  if (created) {
    return (
      <div className="setup-wrap">
        <div className="setup-card">
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏡</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Household created!</h2>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
            Share this invite code with your partner so they can join your household:
          </p>
          <div className="invite-code">{created.invite_code}</div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 20, textAlign: 'center' }}>
            They'll enter this code when they create their account
          </p>
          <button className="btn btn-green btn-full" onClick={onDone}>Get started →</button>
        </div>
      </div>
    )
  }

  return (
    <div className="setup-wrap">
      <div className="setup-card">
        <div style={{ fontSize: 28, marginBottom: 8 }}>🌿</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Set up your household</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
          Create a new household or join your partner's existing one.
        </p>

        <div className="auth-tabs" style={{ marginBottom: 20 }}>
          <button className={`auth-tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>Create household</button>
          <button className={`auth-tab ${tab === 'join' ? 'active' : ''}`} onClick={() => setTab('join')}>Join with code</button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate}>
            <div className="form-field">
              <label>Household name (optional)</label>
              <input type="text" placeholder={`${user.user_metadata?.name || 'Our'}'s Household`} value={hhName} onChange={e => setHhName(e.target.value)} />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn btn-green btn-full" style={{ marginTop: 12 }} disabled={loading}>
              {loading ? 'Creating...' : 'Create & get invite code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin}>
            <div className="form-field">
              <label>Invite code</label>
              <input type="text" placeholder="e.g. AB12CD" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} style={{ letterSpacing: 4, fontSize: 18, fontWeight: 700 }} required />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn btn-green btn-full" style={{ marginTop: 12 }} disabled={loading}>
              {loading ? 'Joining...' : 'Join household'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
