import { useState, useEffect } from 'react'
import { suggestProteinSwaps } from '../lib/ai'

const BADGE_CSS = { calorie: 'badge-calorie', quick: 'badge-quick', gourmet: 'badge-gourmet', taste: 'badge-taste' }
const BADGE_LABELS = { calorie: 'Calorie Smart', quick: '20-Min Meal', gourmet: 'Gourmet', taste: 'Taste Tours' }

export default function ProteinSwapModal({ recipe, onConfirm, onCancel }) {
  const [swaps, setSwaps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // null = keep original

  useEffect(() => {
    if (!recipe) return
    setLoading(true)
    setSelected(null)
    suggestProteinSwaps(recipe)
      .then(data => { setSwaps(data); setLoading(false) })
      .catch(() => { setSwaps(null); setLoading(false) })
  }, [recipe?.id])

  if (!recipe) return null

  const hasProtein = swaps?.original_protein && swaps?.alternatives?.length > 0
  const adjustedCalories = recipe.calories
    ? Math.round(recipe.calories + (selected?.calories_diff || 0))
    : null

  function handleConfirm() {
    if (!selected) {
      onConfirm(recipe) // no swap, add as-is
      return
    }
    // Build updated recipe with swapped protein
    const updatedIngredients = (recipe.ingredients || []).map(ing => {
      const isProtein = ing.item.toLowerCase().includes(swaps.original_protein.toLowerCase()) ||
        swaps.original_protein.toLowerCase().includes(ing.item.toLowerCase())
      return isProtein ? { ...ing, item: selected.name } : ing
    })
    onConfirm({
      ...recipe,
      ingredients: updatedIngredients,
      calories: adjustedCalories,
      _proteinSwap: { from: swaps.original_protein, to: selected.name }
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onCancel} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300,
        animation: 'fadeIn 0.15s ease'
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff', borderRadius: '16px 16px 0 0',
        zIndex: 301, maxHeight: '80dvh', overflowY: 'auto',
        paddingBottom: 'env(safe-area-inset-bottom)',
        animation: 'slideUp 0.2s ease'
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>

        <div style={{ padding: '8px 16px 24px' }}>
          {/* Recipe header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            <span style={{ fontSize: 32 }}>{recipe.emoji || '🍽'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{recipe.name}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {recipe.badge && <span className={`badge ${BADGE_CSS[recipe.badge] || ''}`} style={{ position: 'static', fontSize: 10 }}>{BADGE_LABELS[recipe.badge]}</span>}
                {recipe.time && <span style={{ fontSize: 12, color: '#888' }}>⏱ {recipe.time} min</span>}
                {adjustedCalories && <span style={{ fontSize: 12, color: '#888' }}>🔥 {adjustedCalories} cal/serving</span>}
              </div>
            </div>
          </div>

          {/* Protein swap section */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', color: '#3c6e47', fontSize: 13 }}>
              <div className="spinner" style={{ borderTopColor: '#3c6e47', borderColor: '#c0dd97' }} />
              Checking protein swap options...
            </div>
          )}

          {!loading && hasProtein && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🔄 Swap the protein?</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
                Original: <strong>{swaps.original_protein}</strong> — swap for something else or keep it as is.
              </div>

              {/* Keep original option */}
              <div
                onClick={() => setSelected(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', marginBottom: 8,
                  border: selected === null ? '2px solid #3c6e47' : '0.5px solid rgba(0,0,0,0.1)',
                  borderRadius: 10, cursor: 'pointer',
                  background: selected === null ? '#f0fff4' : '#fff',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Keep original</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{swaps.original_protein}</div>
                </div>
                {recipe.calories && <div style={{ fontSize: 12, color: '#888' }}>{recipe.calories} cal/serving</div>}
                {selected === null && <span style={{ fontSize: 16, color: '#3c6e47' }}>✓</span>}
              </div>

              {/* Swap options */}
              {swaps.alternatives.map((alt, i) => {
                const isSelected = selected?.name === alt.name
                const newCal = recipe.calories ? Math.round(recipe.calories + (alt.calories_diff || 0)) : null
                return (
                  <div key={i}
                    onClick={() => setSelected(isSelected ? null : alt)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', marginBottom: 8,
                      border: isSelected ? '2px solid #3c6e47' : '0.5px solid rgba(0,0,0,0.1)',
                      borderRadius: 10, cursor: 'pointer',
                      background: isSelected ? '#f0fff4' : '#fff',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{alt.name}</div>
                      {alt.notes && <div style={{ fontSize: 12, color: '#666' }}>{alt.notes}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {newCal && <div style={{ fontSize: 12, color: '#555', marginBottom: 3 }}>{newCal} cal/serving</div>}
                      {alt.calories_diff !== 0 && (
                        <div style={{
                          fontSize: 11, fontWeight: 600,
                          color: alt.calories_diff < 0 ? '#3c6e47' : '#c0392b',
                          background: alt.calories_diff < 0 ? '#eaf3de' : '#fdecea',
                          padding: '2px 7px', borderRadius: 20, display: 'inline-block'
                        }}>
                          {alt.calories_diff > 0 ? '+' : ''}{alt.calories_diff} cal
                        </div>
                      )}
                    </div>
                    {isSelected && <span style={{ fontSize: 16, color: '#3c6e47', flexShrink: 0 }}>✓</span>}
                  </div>
                )
              })}
            </div>
          )}

          {!loading && !hasProtein && (
            <div style={{ fontSize: 13, color: '#888', padding: '12px 0 20px' }}>
              No protein swap options for this recipe — adding as is.
            </div>
          )}

          {/* Confirm summary */}
          {selected && (
            <div style={{ background: '#eaf3de', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#27500a' }}>
              ✓ Will add with <strong>{selected.name}</strong> instead of {swaps?.original_protein}
              {adjustedCalories && ` · ${adjustedCalories} cal/serving`}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleConfirm} style={{
              flex: 1, padding: '13px', background: '#3c6e47', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer'
            }}>
              {loading ? 'Loading...' : `Add to box${selected ? ` (${selected.name})` : ''}`}
            </button>
            <button onClick={onCancel} style={{
              padding: '13px 18px', background: '#f5f5f3',
              border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer', color: '#555'
            }}>Cancel</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </>
  )
}
