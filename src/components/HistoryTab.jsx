import { useState, useEffect } from 'react'
import { getMealHistory, getAllRatings } from '../lib/supabase'

export default function HistoryTab({ householdId, onReAddRecipe }) {
  const [history, setHistory] = useState([])
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!householdId) return
    Promise.all([getMealHistory(householdId), getAllRatings(householdId)]).then(([h, r]) => {
      setHistory(h)
      setRatings(r)
      setLoading(false)
    })
  }, [householdId])

  function getRatingForMeal(mealName) {
    const r = ratings.find(r => r.meal_name === mealName)
    return r?.rating || 0
  }

  function formatWeek(weekStart) {
    const d = new Date(weekStart + 'T00:00:00')
    const end = new Date(d)
    end.setDate(d.getDate() + 6)
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: '#3c6e47', fontSize: 13 }}>
      <div className="spinner" style={{ borderTopColor: '#3c6e47', borderColor: '#c0dd97' }} />
      Loading history...
    </div>
  )

  if (history.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon">📅</div>
      No history yet — your past weeks will appear here after Sunday
    </div>
  )

  return (
    <div>
      {history.map(week => {
        const meals = (() => { try { return JSON.parse(week.meals) } catch { return [] } })()
        const isOpen = expanded === week.week_start
        const likedCount = meals.filter(m => getRatingForMeal(m.name) === 1).length
        const dislikedCount = meals.filter(m => getRatingForMeal(m.name) === -1).length

        return (
          <div key={week.week_start} style={{
            background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)',
            borderRadius: 12, marginBottom: 10, overflow: 'hidden'
          }}>
            <div
              onClick={() => setExpanded(isOpen ? null : week.week_start)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', cursor: 'pointer'
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{formatWeek(week.week_start)}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  {meals.length} meals
                  {likedCount > 0 && <span style={{ color: '#3c6e47', marginLeft: 6 }}>👍 {likedCount}</span>}
                  {dislikedCount > 0 && <span style={{ color: '#c0392b', marginLeft: 6 }}>👎 {dislikedCount}</span>}
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#888' }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)', padding: '0 16px 14px' }}>
                {meals.map((meal, i) => {
                  const rating = getRatingForMeal(meal.name)
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 0', borderBottom: i < meals.length - 1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none'
                    }}>
                      <span style={{ fontSize: 20 }}>{meal.emoji || '🍽'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{meal.name}</div>
                        {meal.subtitle && <div style={{ fontSize: 11, color: '#888' }}>{meal.subtitle}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {rating === 1 && <span style={{ fontSize: 16 }}>👍</span>}
                        {rating === -1 && <span style={{ fontSize: 16 }}>👎</span>}
                        <button
                          onClick={() => onReAddRecipe(meal)}
                          style={{
                            fontSize: 11, padding: '3px 10px',
                            background: '#eaf3de', color: '#27500a',
                            border: 'none', borderRadius: 20, cursor: 'pointer', fontWeight: 500
                          }}
                        >+ Re-add</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
