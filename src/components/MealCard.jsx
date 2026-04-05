const BADGE_CSS = { calorie: 'badge-calorie', quick: 'badge-quick', gourmet: 'badge-gourmet', taste: 'badge-taste' }
const BADGE_LABELS = { calorie: 'Calorie Smart', quick: '20-Min Meal', gourmet: 'Gourmet', taste: 'Taste Tours' }
const MEMBER_COLORS = ['#3c6e47', '#e8a020', '#1e40af', '#9333ea', '#dc2626']

function safeTags(recipe) {
  let tags = recipe?.tags || []
  if (typeof tags === 'string') { try { tags = JSON.parse(tags) } catch { tags = [] } }
  return Array.isArray(tags) ? tags : []
}

function safeIngredients(recipe) {
  let ings = recipe?.ingredients || []
  if (typeof ings === 'string') { try { ings = JSON.parse(ings) } catch { ings = [] } }
  return Array.isArray(ings) ? ings : []
}

export default function MealCard({ recipe, isSelected, pickedBy = [], memberNames = {}, onToggle, overlapCount = 0 }) {
  const isBothPicked = pickedBy.length >= 2
  const isPartnerPicked = pickedBy.length === 1 && !isSelected
  const tags = safeTags(recipe)

  let cardClass = 'meal-card'
  if (isSelected && isBothPicked) cardClass += ' both-picked'
  else if (isSelected) cardClass += ' selected'
  else if (isPartnerPicked) cardClass += ' partner-picked'

  return (
    <div className={cardClass}>
      <div className="meal-thumb">
        <span style={{ fontSize: 36 }}>{recipe.emoji || '🍽'}</span>
        {recipe.badge && (
          <span className={`badge ${BADGE_CSS[recipe.badge] || ''}`}>
            {BADGE_LABELS[recipe.badge] || recipe.badge}
          </span>
        )}
        {pickedBy.length > 0 && (
          <div className="pick-avatars">
            {pickedBy.map((uid, i) => (
              <div key={uid} className="pick-avatar" style={{ background: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                {(memberNames[uid] || '?')[0].toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="meal-body">
        <div className="meal-name">{recipe.name}</div>
        {recipe.subtitle && <div className="meal-sub">{recipe.subtitle}</div>}
        <div className="meal-meta">
          <span>{recipe.time || 30} min</span>
          {tags.includes('family') && <><span className="dot">·</span><span>Family</span></>}
          {tags.includes('vegetarian') && <><span className="dot">·</span><span>Veggie</span></>}
        </div>
        {recipe.calories && (
          <div style={{ marginTop: 4 }}>
            <span className="cal-pill">🔥 {Math.round(recipe.calories)} cal</span>
          </div>
        )}
        {recipe.seasonal && (
          <div style={{ marginTop: 3 }}>
            <span className="seasonal-pill">🌿 {recipe.seasonal}</span>
          </div>
        )}
        {overlapCount > 0 && isSelected && (
          <div style={{ marginTop: 4 }}>
            <span className="overlap-pill">
              <span style={{ fontSize: 9 }}>●</span> {overlapCount} shared ingredient{overlapCount > 1 ? 's' : ''}
            </span>
          </div>
        )}
        {isPartnerPicked && !isBothPicked && (
          <div style={{ marginTop: 3 }}>
            <span style={{ fontSize: 11, color: '#e8a020', fontWeight: 500 }}>★ Partner picked</span>
          </div>
        )}
        {isBothPicked && (
          <div style={{ marginTop: 3 }}>
            <span style={{ fontSize: 11, color: '#3c6e47', fontWeight: 500 }}>✓ Both picked</span>
          </div>
        )}
      </div>

      <div className="meal-footer">
        {isSelected ? (
          <button className="in-box-btn" onClick={() => onToggle(recipe.id)}>
            <span>✓ In your box</span>
            <span style={{ fontSize: 14, opacity: 0.7 }}>✕</span>
          </button>
        ) : (
          <button className="add-box-btn" onClick={() => onToggle(recipe.id)}>
            Add to box
          </button>
        )}
      </div>
    </div>
  )
}
