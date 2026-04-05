import { useState } from 'react'

export default function RatingModal({ meals, onSubmit, onSkip }) {
  const [ratings, setRatings] = useState({})

  function rate(mealName, val) {
    setRatings(r => ({ ...r, [mealName]: r[mealName] === val ? 0 : val }))
  }

  if (!meals || meals.length === 0) return null

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 300, display: 'flex', alignItems: 'flex-end'
      }}>
        <div style={{
          background: '#fff', borderRadius: '16px 16px 0 0',
          width: '100%', maxHeight: '85dvh', overflowY: 'auto',
          paddingBottom: 'env(safe-area-inset-bottom)',
          animation: 'slideUp 0.25s ease'
        }}>
          <div style={{ padding: '16px 16px 0', textAlign: 'center' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 28, marginBottom: 6 }}>⭐</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>How was this week?</h2>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              Rate your meals so we can suggest better ones next week
            </p>
          </div>

          <div style={{ padding: '0 16px 16px' }}>
            {meals.map(r => (
              <div key={r.id || r.name} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <span style={{ fontSize: 22 }}>{r.emoji || '🍽'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                    {r.subtitle && <div style={{ fontSize: 11, color: '#888' }}>{r.subtitle}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => rate(r.name, 1)}
                    style={{
                      width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 18,
                      background: ratings[r.name] === 1 ? '#3c6e47' : '#f5f5f3',
                      transition: 'all 0.15s'
                    }}
                  >👍</button>
                  <button
                    onClick={() => rate(r.name, -1)}
                    style={{
                      width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 18,
                      background: ratings[r.name] === -1 ? '#c0392b' : '#f5f5f3',
                      transition: 'all 0.15s'
                    }}
                  >👎</button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => onSubmit(ratings)}
                style={{
                  flex: 1, padding: '12px', background: '#3c6e47', color: '#fff',
                  border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Save ratings
              </button>
              <button
                onClick={onSkip}
                style={{
                  padding: '12px 16px', background: '#f5f5f3',
                  border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer', color: '#666'
                }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>
    </>
  )
}
