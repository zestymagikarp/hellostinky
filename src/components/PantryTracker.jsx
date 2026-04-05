import { useState, useEffect } from 'react'
import { getPantry, addPantryItem, removePantryItem } from '../lib/supabase'

const COMMON_PANTRY = [
  'olive oil', 'salt', 'black pepper', 'garlic', 'onion', 'butter',
  'soy sauce', 'chicken stock', 'canned tomatoes', 'pasta', 'rice',
  'flour', 'sugar', 'eggs', 'milk', 'parmesan', 'lemon', 'honey',
  'cumin', 'paprika', 'oregano', 'chilli flakes', 'balsamic vinegar'
]

export default function PantryTracker({ householdId, userId, groceryItems, onGroceryFiltered }) {
  const [pantry, setPantry] = useState([])
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    if (householdId) getPantry(householdId).then(setPantry)
  }, [householdId])

  const pantryNames = new Set(pantry.map(p => p.name.toLowerCase()))

  async function add(name) {
    const n = name.toLowerCase().trim()
    if (!n || pantryNames.has(n)) return
    await addPantryItem(householdId, n, userId)
    const updated = await getPantry(householdId)
    setPantry(updated)
    setInput('')
  }

  async function remove(name) {
    await removePantryItem(householdId, name)
    const updated = await getPantry(householdId)
    setPantry(updated)
  }

  const suggestions = COMMON_PANTRY.filter(s => !pantryNames.has(s) && s.includes(input.toLowerCase())).slice(0, 6)

  // How many grocery items are already in pantry
  const coveredCount = (groceryItems || []).filter(g => pantryNames.has(g.name?.toLowerCase())).length

  return (
    <div>
      {coveredCount > 0 && (
        <div style={{ background: '#eaf3de', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#27500a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>✓</span>
          <span><strong>{coveredCount}</strong> ingredient{coveredCount !== 1 ? 's' : ''} already in your pantry — skipped from grocery list</span>
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setShowSuggestions(true) }}
            onKeyDown={e => e.key === 'Enter' && add(input)}
            placeholder="Add pantry item (e.g. olive oil)..."
            style={{ flex: 1, padding: '8px 12px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8 }}
          />
          <button onClick={() => add(input)} className="btn btn-green btn-sm">Add</button>
        </div>
        {showSuggestions && input && suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 48, background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, marginTop: 2 }}>
            {suggestions.map(s => (
              <div key={s} onClick={() => { add(s); setShowSuggestions(false) }}
                style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}
                onMouseOver={e => e.target.style.background = '#f5f5f3'}
                onMouseOut={e => e.target.style.background = ''}
              >{s}</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Quick add common items:</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {COMMON_PANTRY.filter(s => !pantryNames.has(s)).slice(0, 12).map(s => (
          <button key={s} onClick={() => add(s)} style={{
            padding: '4px 10px', fontSize: 11, background: '#f5f5f3',
            border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 20, cursor: 'pointer'
          }}>+ {s}</button>
        ))}
      </div>

      {pantry.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            In your pantry ({pantry.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pantry.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#eaf3de', padding: '4px 10px', borderRadius: 20, fontSize: 12
              }}>
                <span style={{ color: '#27500a' }}>{p.name}</span>
                <button onClick={() => remove(p.name)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#3b6d11', fontSize: 13, padding: 0, lineHeight: 1
                }}>×</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
