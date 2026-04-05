import { useState, useEffect } from 'react'
import { getPreferences, savePreferences } from '../lib/supabase'

const DIETARY = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Keto', 'Paleo', 'Halal', 'Kosher', 'Low-carb', 'High-protein']
const ALLERGIES = ['Nuts', 'Peanuts', 'Shellfish', 'Fish', 'Eggs', 'Soy', 'Wheat', 'Sesame', 'Lactose']
const CUISINES = ['Italian', 'Mexican', 'Asian', 'Indian', 'Mediterranean', 'American', 'French', 'Thai', 'Japanese', 'Greek', 'Middle Eastern', 'Korean']

export default function PreferencesPanel({ householdId }) {
  const [prefs, setPrefs] = useState({ dietary: [], allergies: [], household_size: 2, cuisine_likes: [], cuisine_dislikes: [] })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (householdId) getPreferences(householdId).then(p => setPrefs(p || prefs))
  }, [householdId])

  function toggle(key, val) {
    setPrefs(p => ({
      ...p,
      [key]: (p[key] || []).includes(val) ? (p[key] || []).filter(x => x !== val) : [...(p[key] || []), val]
    }))
  }

  async function save() {
    setSaving(true)
    await savePreferences(householdId, prefs)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function Chip({ label, active, onClick, color = 'green' }) {
    const colors = {
      green: { bg: active ? '#3c6e47' : '#f5f5f3', text: active ? '#fff' : '#444', border: active ? '#3c6e47' : 'rgba(0,0,0,0.1)' },
      red: { bg: active ? '#c0392b' : '#f5f5f3', text: active ? '#fff' : '#444', border: active ? '#c0392b' : 'rgba(0,0,0,0.1)' },
      amber: { bg: active ? '#e8a020' : '#f5f5f3', text: active ? '#fff' : '#444', border: active ? '#e8a020' : 'rgba(0,0,0,0.1)' },
    }
    const c = colors[color]
    return (
      <button onClick={onClick} style={{
        padding: '5px 12px', fontSize: 12, borderRadius: 20, cursor: 'pointer',
        background: c.bg, color: c.text, border: `0.5px solid ${c.border}`,
        transition: 'all 0.15s', fontWeight: active ? 600 : 400
      }}>{label}</button>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Household size</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>How many people are you cooking for? Affects portion suggestions.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setPrefs(p => ({ ...p, household_size: Math.max(1, p.household_size - 1) }))}
            style={{ width: 32, height: 32, borderRadius: '50%', border: '0.5px solid rgba(0,0,0,0.15)', background: '#f5f5f3', fontSize: 18, cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: 22, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{prefs.household_size}</span>
          <button onClick={() => setPrefs(p => ({ ...p, household_size: p.household_size + 1 }))}
            style={{ width: 32, height: 32, borderRadius: '50%', border: '0.5px solid rgba(0,0,0,0.15)', background: '#f5f5f3', fontSize: 18, cursor: 'pointer' }}>+</button>
          <span style={{ fontSize: 13, color: '#666' }}>people</span>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Dietary preferences</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>The AI will filter the weekly menu to match these.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DIETARY.map(d => <Chip key={d} label={d} active={(prefs.dietary || []).includes(d)} onClick={() => toggle('dietary', d)} />)}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Allergies & intolerances</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Meals with these ingredients will be excluded from your menu.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ALLERGIES.map(a => <Chip key={a} label={a} active={(prefs.allergies || []).includes(a)} onClick={() => toggle('allergies', a)} color="red" />)}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Cuisine preferences</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {CUISINES.map(c => (
            <button key={c} onClick={() => {
              if ((prefs.cuisine_dislikes || []).includes(c)) toggle('cuisine_dislikes', c)
              toggle('cuisine_likes', c)
            }} style={{
              padding: '5px 12px', fontSize: 12, borderRadius: 20, cursor: 'pointer',
              background: (prefs.cuisine_likes || []).includes(c) ? '#3c6e47' : (prefs.cuisine_dislikes || []).includes(c) ? '#fdecea' : '#f5f5f3',
              color: (prefs.cuisine_likes || []).includes(c) ? '#fff' : (prefs.cuisine_dislikes || []).includes(c) ? '#c0392b' : '#444',
              border: `0.5px solid ${(prefs.cuisine_likes || []).includes(c) ? '#3c6e47' : (prefs.cuisine_dislikes || []).includes(c) ? '#c0392b' : 'rgba(0,0,0,0.1)'}`,
              transition: 'all 0.15s'
            }}>{(prefs.cuisine_likes || []).includes(c) ? '♥ ' : ''}{c}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Cuisines to avoid:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CUISINES.filter(c => !(prefs.cuisine_likes || []).includes(c)).map(c => (
            <Chip key={c} label={c} active={(prefs.cuisine_dislikes || []).includes(c)} onClick={() => toggle('cuisine_dislikes', c)} color="red" />
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving} style={{
        padding: '11px 24px', background: '#3c6e47', color: '#fff',
        border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
        cursor: 'pointer', width: '100%'
      }}>
        {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save preferences'}
      </button>
      <div style={{ fontSize: 12, color: '#888', marginTop: 8, textAlign: 'center' }}>
        These preferences will apply from next week's menu generation
      </div>
    </div>
  )
}
