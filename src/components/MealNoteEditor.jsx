import { useState } from 'react'
import { saveMealNote, deleteMealNote } from '../lib/supabase'

export default function MealNoteEditor({ householdId, mealName, existingNote, authorName, userId, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(existingNote?.note || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!text.trim()) {
      await deleteMealNote(householdId, mealName)
      onUpdate && onUpdate(mealName, null)
    } else {
      setSaving(true)
      await saveMealNote(householdId, mealName, text.trim(), userId)
      onUpdate && onUpdate(mealName, { note: text.trim() })
    }
    setSaving(false)
    setEditing(false)
  }

  async function remove() {
    await deleteMealNote(householdId, mealName)
    setText('')
    onUpdate && onUpdate(mealName, null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div style={{ marginTop: 12 }}>
        {existingNote?.note ? (
          <div style={{ background: '#fffbeb', border: '0.5px solid #fcd34d', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 11, color: '#92400e', marginBottom: 3, fontWeight: 600 }}>
              📝 Note {authorName ? `from ${authorName}` : ''}
            </div>
            <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>{existingNote.note}</div>
            <button onClick={() => setEditing(true)} style={{ marginTop: 6, fontSize: 11, color: '#92400e', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              Edit note
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={{
            fontSize: 12, color: '#888', background: 'none',
            border: '0.5px dashed rgba(0,0,0,0.15)', borderRadius: 8,
            padding: '6px 12px', cursor: 'pointer', width: '100%', textAlign: 'left'
          }}>
            + Add a note for this recipe (visible to your partner)
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="e.g. Add extra garlic, skip the cilantro, use low-sodium soy sauce..."
        autoFocus
        style={{
          width: '100%', padding: '8px 10px', fontSize: 13,
          border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8,
          minHeight: 72, resize: 'vertical', fontFamily: 'inherit'
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button onClick={save} disabled={saving} style={{
          flex: 1, padding: '8px', background: '#3c6e47', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
        }}>{saving ? 'Saving...' : 'Save note'}</button>
        {existingNote?.note && (
          <button onClick={remove} style={{
            padding: '8px 12px', background: '#fdecea', color: '#c0392b',
            border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer'
          }}>Delete</button>
        )}
        <button onClick={() => { setEditing(false); setText(existingNote?.note || '') }} style={{
          padding: '8px 12px', background: '#f5f5f3',
          border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#555'
        }}>Cancel</button>
      </div>
    </div>
  )
}
