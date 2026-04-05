const BADGE_CSS = { calorie: 'badge-calorie', quick: 'badge-quick', gourmet: 'badge-gourmet', taste: 'badge-taste' }
const BADGE_LABELS = { calorie: 'Calorie Smart', quick: '20-Min Meal', gourmet: 'Gourmet', taste: 'Taste Tours' }
const MEMBER_COLORS = ['#3c6e47', '#e8a020', '#1e40af', '#9333ea', '#dc2626']

export default function MealCard({ recipe, isSelected, pickedBy = [], memberNames = {}, onToggle }) {
  const myPick = isSelected
  const partnerPicks = pickedBy.filter(uid => !myPick || true) // all pickers

  function getOverlapCount() {
    return 0 // parent passes pre-computed value if needed
  }

  const isBothPicked = pickedBy.length >= 2
  const isPartnerPicked = pickedBy.length === 1 && !isSelected

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
          {recipe.tags?.includes('family') && <><span className="dot">·</span><span>Family</span></>}
          {recipe.tags?.includes('vegetarian') && <><span className="dot">·</span><span>Veggie</span></>}
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
        {isPartnerPicked && (
          <div style={{ marginTop: 3 }}>
            <span style={{ fontSize: 11, color: '#e8a020', fontWeight: 500 }}>
              ★ Partner picked
            </span>
          </div>
        )}
        {isBothPicked && (
          <div style={{ marginTop: 3 }}>
            <span style={{ fontSize: 11, color: '#3c6e47', fontWeight: 500 }}>
              ✓ Both picked
            </span>
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
