import { useState, useEffect } from 'react'
import { generateRecipeInstructions, suggestProteinSwaps, fetchRecipeDetails } from '../lib/ai'
import MealNoteEditor from './MealNoteEditor'

const BADGE_LABELS = { calorie: 'Calorie Smart', quick: '20-Min Meal', gourmet: 'Gourmet', taste: 'Taste Tours' }
const BADGE_CSS = { calorie: 'badge-calorie', quick: 'badge-quick', gourmet: 'badge-gourmet', taste: 'badge-taste' }

function safeIngredients(recipe) {
  let ings = recipe?.ingredients || []
  if (typeof ings === 'string') { try { ings = JSON.parse(ings) } catch { ings = [] } }
  return Array.isArray(ings) ? ings : []
}

function safeTags(recipe) {
  let tags = recipe?.tags || []
  if (typeof tags === 'string') { try { tags = JSON.parse(tags) } catch { tags = [] } }
  return Array.isArray(tags) ? tags : []
}

export default function RecipeDrawer({ recipe, onClose, householdId, userId, mealNotes = {}, onNoteUpdate, savedServings, onServingsChange }) {
  const [drawerError, setDrawerError] = useState(false)
  const [servings, setServings] = useState(savedServings || recipe?.servings || 4)
  const [instructions, setInstructions] = useState(null)
  const [loadingInstructions, setLoadingInstructions] = useState(false)
  const [activeTab, setActiveTab] = useState('ingredients')
  const [cookingMode, setCookingMode] = useState(false)
  const [cookingStep, setCookingStep] = useState(0)
  const [proteinSwaps, setProteinSwaps] = useState(null)
  const [loadingProtein, setLoadingProtein] = useState(false)
  const [selectedProtein, setSelectedProtein] = useState(null)
  const [calAdjustment, setCalAdjustment] = useState(0)
  const [recipeDetails, setRecipeDetails] = useState(null) // enriched details fetched on demand
  const [loadingDetails, setLoadingDetails] = useState(false)

  const baseServings = recipe?.servings || 4
  const scale = servings / baseServings

  useEffect(() => {
    if (recipe) {
      setServings(savedServings || recipe.servings || 4)
      setInstructions(null)
      setActiveTab('ingredients')
      setCookingMode(false)
      setCookingStep(0)
      setProteinSwaps(null)
      setSelectedProtein(null)
      setCalAdjustment(0)
      setDrawerError(false)
      setRecipeDetails(null)
    }
  }, [recipe?.id])

  // Only fetch AI-generated details if this is NOT a saved PDF recipe
  // A saved recipe always has ingredients; only pure AI menu meals need this fallback
  useEffect(() => {
    if (!recipe) return
    const ings = safeIngredients(recipe)
    // recipe.household_id means it came from the saved recipes DB — never overwrite it
    const isSavedRecipe = !!recipe.household_id || !!recipe.created_at
    if (ings.length === 0 && !isSavedRecipe && !recipeDetails && !loadingDetails) {
      setLoadingDetails(true)
      fetchRecipeDetails(recipe)
        .then(details => setRecipeDetails(details))
        .catch(() => {})
        .finally(() => setLoadingDetails(false))
    }
  }, [recipe?.id])

  // Merged recipe = original + any fetched details
  const enrichedRecipe = recipeDetails
    ? { ...recipe, ...recipeDetails, ingredients: recipeDetails.ingredients || safeIngredients(recipe) }
    : recipe

  async function loadProteinSwaps() {
    if (proteinSwaps) { setActiveTab('protein'); return }
    setLoadingProtein(true)
    setActiveTab('protein')
    try {
      const data = await suggestProteinSwaps(enrichedRecipe)
      setProteinSwaps(data)
    } catch (e) {
      setProteinSwaps({ error: 'Could not load protein suggestions.' })
    }
    setLoadingProtein(false)
  }

  function selectProtein(alt) {
    if (selectedProtein?.name === alt.name) {
      setSelectedProtein(null)
      setCalAdjustment(0)
    } else {
      setSelectedProtein(alt)
      setCalAdjustment(alt.calories_diff || 0)
    }
  }

  async function loadInstructions() {
    if (instructions) { setActiveTab('steps'); return }
    setLoadingInstructions(true)
    setActiveTab('steps')
    try {
      const data = await generateRecipeInstructions(enrichedRecipe)
      setInstructions(data)
    } catch (e) {
      setInstructions({ error: 'Could not generate instructions. Please try again.' })
    }
    setLoadingInstructions(false)
  }

  function scaleAmount(amount) {
    if (!amount) return ''
    // Try to find a number in the amount string and scale it
    return amount.replace(/[\d.]+/, n => {
      const scaled = parseFloat(n) * scale
      return scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1).replace(/\.0$/, '')
    })
  }

  if (!recipe) return null
  if (drawerError) return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '16px 16px 0 0', zIndex: 201, padding: '24px 16px', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{recipe.name}</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Could not load full recipe details.</div>
        <button onClick={onClose} className="btn btn-green btn-sm btn-full">Close</button>
      </div>
    </>
  )

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 200, animation: 'fadeIn 0.2s ease'
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff', borderRadius: '16px 16px 0 0',
        zIndex: 201, maxHeight: '90dvh', overflowY: 'auto',
        animation: 'slideUp 0.25s ease',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 16px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 24 }}>{recipe.emoji || '🍽'}</span>
                {recipe.badge && (
                  <span className={`badge ${BADGE_CSS[recipe.badge] || ''}`} style={{ position: 'static' }}>
                    {BADGE_LABELS[recipe.badge] || recipe.badge}
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', lineHeight: 1.2 }}>{recipe.name}</h2>
              {recipe.subtitle && <p style={{ fontSize: 13, color: '#666', margin: 0 }}>{recipe.subtitle}</p>}
            </div>
            <button onClick={onClose} style={{
              background: '#f5f5f3', border: 'none', borderRadius: '50%',
              width: 32, height: 32, fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>✕</button>
          </div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              ['⏱', `${recipe.time || 30} min`],
              ['🔥', recipe.calories ? `${Math.round((recipe.calories + calAdjustment) * scale)} cal${calAdjustment !== 0 ? (calAdjustment > 0 ? ' ▲' : ' ▼') : ''}` : null],
              ['👤', `${servings} servings`],
              ['💰', `$${((recipe.price || 9.99) * servings).toFixed(2)} total`],
            ].filter(([, v]) => v).map(([icon, val]) => (
              <div key={val} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: '#f5f5f3', padding: '5px 10px', borderRadius: 20,
                fontSize: 12, fontWeight: 500
              }}>
                <span style={{ fontSize: 13 }}>{icon}</span> {val}
              </div>
            ))}
          </div>

          {/* Servings scaler */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <span style={{ fontSize: 12, color: '#666' }}>Servings:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => {
                const next = Math.max(1, servings - 1)
                setServings(next)
                onServingsChange && onServingsChange(recipe.id, next)
              }} style={{
                width: 32, height: 32, background: '#f5f5f3', border: 'none',
                fontSize: 18, cursor: 'pointer', fontWeight: 500
              }}>−</button>
              <span style={{ width: 32, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{servings}</span>
              <button onClick={() => {
                const next = servings + 1
                setServings(next)
                onServingsChange && onServingsChange(recipe.id, next)
              }} style={{
                width: 32, height: 32, background: '#f5f5f3', border: 'none',
                fontSize: 18, cursor: 'pointer', fontWeight: 500
              }}>+</button>
            </div>
            {scale !== 1 && (
              <span style={{ fontSize: 11, color: '#3c6e47', background: '#eaf3de', padding: '2px 8px', borderRadius: 20 }}>
                ×{scale.toFixed(1)} scaled — grocery list will use these amounts
              </span>
            )}
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          {[['ingredients', '🛒 Ingredients'], ['steps', '👩‍🍳 How to cook'], ['protein', '🔄 Swap protein'], ['info', 'ℹ️ Info']].map(([id, label]) => (
            <button key={id}
              onClick={() => id === 'steps' ? loadInstructions() : id === 'protein' ? loadProteinSwaps() : setActiveTab(id)}
              style={{
                flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: 500,
                background: 'none', border: 'none',
                borderBottom: activeTab === id ? '2px solid #3c6e47' : '2px solid transparent',
                color: activeTab === id ? '#3c6e47' : '#888',
                cursor: 'pointer'
              }}
            >{label}</button>
          ))}
        </div>

        <div style={{ padding: '16px 16px 32px' }}>

          {/* ── Ingredients tab ── */}
          {activeTab === 'ingredients' && (
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
                Amounts shown for {servings} serving{servings !== 1 ? 's' : ''}
                {servings > 2 && recipe?.servings && servings >= recipe.servings && (
                  <span style={{ marginLeft: 8, background: '#dbeafe', color: '#1e40af', padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                    🥡 ~{Math.ceil(servings / 2)} nights of leftovers
                  </span>
                )}
                {scale !== 1 && ' (scaled)'}
              </div>
              {loadingDetails ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3c6e47', fontSize: 13 }}>
                  <div className="spinner" style={{ borderTopColor: '#3c6e47', borderColor: '#c0dd97' }} />
                  Loading ingredients...
                </div>
              ) : safeIngredients(enrichedRecipe).length === 0 ? (
                <div style={{ color: '#888', fontSize: 13 }}>No ingredients listed.</div>
              ) : (
                safeIngredients(enrichedRecipe).map((ing, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                    fontSize: 14
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3c6e47', flexShrink: 0 }} />
                      <span style={{ fontWeight: 500 }}>{ing.item}</span>
                    </div>
                    <span style={{ color: '#555', fontSize: 13, fontWeight: 500 }}>
                      {scaleAmount(ing.amount)}
                    </span>
                  </div>
                ))
              )}
              {householdId && userId && (
                <MealNoteEditor
                  householdId={householdId}
                  mealName={enrichedRecipe?.name}
                  existingNote={mealNotes[enrichedRecipe?.name]}
                  userId={userId}
                  onUpdate={onNoteUpdate}
                />
              )}
            </div>
          )}

          {/* ── Steps tab ── */}
          {activeTab === 'steps' && (
            <div>
              {loadingInstructions && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: '#3c6e47', fontSize: 13 }}>
                  <div className="spinner" style={{ borderTopColor: '#3c6e47', borderColor: '#c0dd97' }} />
                  Generating step-by-step instructions...
                </div>
              )}
              {instructions?.error && (
                <div style={{ color: '#c0392b', fontSize: 13, padding: '12px 0' }}>{instructions.error}</div>
              )}
              {instructions?.steps && (
                <>
                  {instructions.steps.map((step, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 14, marginBottom: 20,
                      paddingBottom: 20, borderBottom: i < instructions.steps.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none'
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: '#3c6e47', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 1
                      }}>{step.number}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{step.title}</div>
                        <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6 }}>{step.instruction}</div>
                        {step.duration && (
                          <div style={{ marginTop: 6, fontSize: 11, color: '#3c6e47', background: '#eaf3de', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20 }}>
                            ⏱ {step.duration}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {!cookingMode && (
                    <button
                      onClick={() => { setCookingMode(true); setCookingStep(0) }}
                      style={{
                        width: '100%', padding: '12px', marginBottom: 20,
                        background: '#3c6e47', color: '#fff', border: 'none',
                        borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      👩‍🍳 Start cooking mode
                    </button>
                  )}

                  {cookingMode && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <span style={{ fontSize: 12, color: '#888' }}>Step {cookingStep + 1} of {instructions.steps.length}</span>
                        <button onClick={() => setCookingMode(false)} style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>Exit cooking mode</button>
                      </div>
                      <div style={{ background: '#3c6e47', borderRadius: 12, padding: '20px', color: '#fff', marginBottom: 16 }}>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step {instructions.steps[cookingStep].number}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{instructions.steps[cookingStep].title}</div>
                        <div style={{ fontSize: 14, lineHeight: 1.7, opacity: 0.92 }}>{instructions.steps[cookingStep].instruction}</div>
                        {instructions.steps[cookingStep].duration && (
                          <div style={{ marginTop: 12, fontSize: 12, background: 'rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20 }}>
                            ⏱ {instructions.steps[cookingStep].duration}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          disabled={cookingStep === 0}
                          onClick={() => setCookingStep(s => s - 1)}
                          style={{ flex: 1, padding: '12px', background: '#f5f5f3', border: 'none', borderRadius: 10, fontSize: 14, cursor: cookingStep === 0 ? 'default' : 'pointer', opacity: cookingStep === 0 ? 0.4 : 1 }}
                        >← Previous</button>
                        {cookingStep < instructions.steps.length - 1 ? (
                          <button
                            onClick={() => setCookingStep(s => s + 1)}
                            style={{ flex: 1, padding: '12px', background: '#3c6e47', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                          >Next step →</button>
                        ) : (
                          <button
                            onClick={() => { setCookingMode(false); setCookingStep(0) }}
                            style={{ flex: 1, padding: '12px', background: '#e8a020', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                          >🎉 Done!</button>
                        )}
                      </div>
                    </div>
                  )}

                  {instructions.tips?.length > 0 && (
                    <div style={{ background: '#fffbeb', border: '0.5px solid #fcd34d', borderRadius: 10, padding: '12px 14px', marginTop: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: '#92400e' }}>💡 Chef's tips</div>
                      {instructions.tips.map((tip, i) => (
                        <div key={i} style={{ fontSize: 13, color: '#78350f', marginBottom: 4, paddingLeft: 8 }}>· {tip}</div>
                      ))}
                    </div>
                  )}

                  {instructions.storage && (
                    <div style={{ background: '#f0f9ff', border: '0.5px solid #bae6fd', borderRadius: 10, padding: '12px 14px', marginTop: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#0c4a6e' }}>🧊 Storage</div>
                      <div style={{ fontSize: 13, color: '#075985' }}>{instructions.storage}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Protein swap tab ── */}
          {activeTab === 'protein' && (
            <div>
              {loadingProtein && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: '#3c6e47', fontSize: 13 }}>
                  <div className="spinner" style={{ borderTopColor: '#3c6e47', borderColor: '#c0dd97' }} />
                  Analysing protein options...
                </div>
              )}
              {proteinSwaps?.error && <div style={{ color: '#c0392b', fontSize: 13, padding: '12px 0' }}>{proteinSwaps.error}</div>}
              {proteinSwaps && !proteinSwaps.error && (
                <>
                  {proteinSwaps.original_protein ? (
                    <>
                      <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
                        Original protein: <strong style={{ color: '#1a1a1a' }}>{proteinSwaps.original_protein}</strong>
                        {selectedProtein && (
                          <span style={{ marginLeft: 8, background: '#eaf3de', color: '#27500a', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                            → swapped to {selectedProtein.name}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Tap to swap — same amount, different protein</div>

                      {(proteinSwaps.alternatives || []).map((alt, i) => {
                        const isSelected = selectedProtein?.name === alt.name
                        return (
                          <div key={i}
                            onClick={() => selectProtein(alt)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '12px 14px', marginBottom: 8,
                              border: isSelected ? '2px solid #3c6e47' : '0.5px solid rgba(0,0,0,0.1)',
                              borderRadius: 10, cursor: 'pointer',
                              background: isSelected ? '#f0fff4' : '#fff',
                              transition: 'all 0.15s'
                            }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{alt.name}</div>
                              {alt.notes && <div style={{ fontSize: 12, color: '#666' }}>{alt.notes}</div>}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              {alt.calories_diff !== 0 && (
                                <div style={{
                                  fontSize: 12, fontWeight: 600,
                                  color: alt.calories_diff < 0 ? '#3c6e47' : '#c0392b',
                                  background: alt.calories_diff < 0 ? '#eaf3de' : '#fdecea',
                                  padding: '3px 8px', borderRadius: 20
                                }}>
                                  {alt.calories_diff > 0 ? '+' : ''}{alt.calories_diff} cal/serving
                                </div>
                              )}
                              {alt.calories_diff === 0 && (
                                <div style={{ fontSize: 11, color: '#888' }}>Same calories</div>
                              )}
                              {isSelected && <div style={{ fontSize: 11, color: '#3c6e47', marginTop: 4, fontWeight: 600 }}>✓ Selected</div>}
                            </div>
                          </div>
                        )
                      })}

                      {selectedProtein && (
                        <div style={{ marginTop: 16, background: '#eaf3de', borderRadius: 10, padding: '12px 14px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#27500a', marginBottom: 4 }}>
                            Updated recipe
                          </div>
                          <div style={{ fontSize: 13, color: '#3b6d11' }}>
                            Replace <strong>{proteinSwaps.original_protein}</strong> with <strong>{selectedProtein.name}</strong> — same quantity, same method.
                          </div>
                          {recipe.calories && (
                            <div style={{ fontSize: 12, color: '#3b6d11', marginTop: 6 }}>
                              New calories: ~{Math.round(recipe.calories + calAdjustment)} per serving
                              {calAdjustment < 0 && ` (saving ${Math.abs(calAdjustment)} cal/serving)`}
                            </div>
                          )}
                          <button
                            onClick={() => { setSelectedProtein(null); setCalAdjustment(0) }}
                            style={{ marginTop: 10, fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            ✕ Remove swap
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: '#888', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                      No clear protein found in this recipe to swap
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Info tab ── */}
          {activeTab === 'info' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {[
                  ['Cook time', `${recipe.time || 30} min`],
                  ['Servings', `${servings} (scaled from ${baseServings})`],
                  ['Calories', recipe.calories ? `${Math.round((recipe.calories + calAdjustment) * scale)} per serving${calAdjustment !== 0 ? ` (${calAdjustment > 0 ? '+' : ''}${calAdjustment} from swap)` : ''}` : 'Not available'],
                  ['Est. cost', `$${((recipe.price || 9.99) * servings).toFixed(2)} total`],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: '#f9f9f7', borderRadius: 10, padding: '12px' }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{val}</div>
                  </div>
                ))}
              </div>

              {safeTags(recipe).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {safeTags(recipe).map(tag => (
                      <span key={tag} style={{
                        background: '#f0f0ee', color: '#555',
                        padding: '4px 10px', borderRadius: 20, fontSize: 12
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {recipe.seasonal && (
                <div style={{ background: '#eaf3de', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, color: '#27500a' }}>🌿 <strong>Seasonal note:</strong> {recipe.seasonal}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </>
  )
}
