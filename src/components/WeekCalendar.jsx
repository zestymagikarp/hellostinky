import { useState, useEffect } from 'react'
import { getMealSchedule, saveMealSchedule, getWeekStart } from '../lib/supabase'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FULL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function WeekCalendar({ householdId, meals, weekLabel = 'this week' }) {
  const [schedule, setSchedule] = useState({}) // { Mon: mealId, ... }
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const weekStart = getWeekStart()

  useEffect(() => {
    if (householdId) getMealSchedule(householdId, weekStart).then(s => setSchedule(s || {}))
  }, [householdId, weekStart])

  async function assignMeal(day, mealId) {
    const updated = { ...schedule, [day]: mealId }
    if (!mealId) delete updated[day]
    setSchedule(updated)
    await saveMealSchedule(householdId, weekStart, updated)
  }

  function getToday() {
    const d = new Date().getDay()
    return DAYS[d === 0 ? 6 : d - 1]
  }

  const today = getToday()
  const unscheduled = meals.filter(m => !Object.values(schedule).includes(m.id))

  return (
    <div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
        Drag meals onto days, or tap a day to assign. Tap a meal to remove it from that day.
      </div>

      {/* Day columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 16 }}>
        {DAYS.map(day => {
          const assignedId = schedule[day]
          const meal = meals.find(m => m.id === assignedId)
          const isToday = day === today

          return (
            <div key={day}
              onDragOver={e => { e.preventDefault(); setDragOver(day) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => { e.preventDefault(); setDragOver(null); if (dragging) assignMeal(day, dragging) }}
              style={{
                background: dragOver === day ? '#eaf3de' : isToday ? '#f0f9ff' : '#f9f9f7',
                border: dragOver === day ? '2px solid #3c6e47' : isToday ? '1.5px solid #7dd3fc' : '0.5px solid rgba(0,0,0,0.08)',
                borderRadius: 10, padding: '8px 4px', minHeight: 90,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? '#0284c7' : '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                {day}{isToday && ' •'}
              </div>
              {meal ? (
                <div onClick={() => assignMeal(day, null)}
                  style={{ fontSize: 18, cursor: 'pointer', textAlign: 'center', lineHeight: 1 }}
                  title={`${meal.name} — tap to remove`}
                >
                  {meal.emoji || '🍽'}
                  <div style={{ fontSize: 9, color: '#555', marginTop: 3, lineHeight: 1.2, wordBreak: 'break-word', textAlign: 'center' }}>
                    {meal.name.length > 14 ? meal.name.slice(0, 13) + '…' : meal.name}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#ccc', marginTop: 8 }}>+</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Unscheduled meals to drag from */}
      {unscheduled.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Unscheduled meals — drag onto a day:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unscheduled.map(meal => (
              <div key={meal.id}
                draggable
                onDragStart={() => setDragging(meal.id)}
                onDragEnd={() => setDragging(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)',
                  borderRadius: 20, padding: '6px 12px', fontSize: 12,
                  cursor: 'grab', userSelect: 'none',
                  opacity: dragging === meal.id ? 0.5 : 1
                }}
              >
                <span>{meal.emoji || '🍽'}</span>
                <span>{meal.name}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Scheduled summary */}
      {Object.keys(schedule).length > 0 && (
        <div style={{ marginTop: 16, background: '#f9f9f7', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8 }}>Week plan</div>
          {DAYS.filter(d => schedule[d]).map(day => {
            const meal = meals.find(m => m.id === schedule[day])
            if (!meal) return null
            return (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                <span style={{ width: 28, fontSize: 11, fontWeight: 600, color: '#888' }}>{day}</span>
                <span>{meal.emoji}</span>
                <span>{meal.name}</span>
                {meal.time && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>{meal.time} min</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
