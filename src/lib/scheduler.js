import { useEffect, useRef } from 'react'
import { savePushSubscription } from './supabase'

const VAPID_PUBLIC_KEY = null // Set this if you add VAPID keys later

// ── Push notification setup ──────────────────────────────────
export async function requestNotificationPermission(token) {
  if (!('Notification' in window)) return false
  if (!('serviceWorker' in navigator)) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  try {
    const reg = await navigator.serviceWorker.ready
    // If no VAPID key configured, use basic local scheduling instead
    if (!VAPID_PUBLIC_KEY) {
      localStorage.setItem('hellostinky_notifications', 'true')
      return true
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY
    })
    await savePushSubscription(sub, token)
    return true
  } catch (e) {
    console.warn('Push subscription failed, using local notifications:', e)
    localStorage.setItem('hellostinky_notifications', 'true')
    return true
  }
}

// ── Local notification (fallback when app is open) ───────────
export function scheduleLocalNotification(title, body, delayMs) {
  if (Notification.permission !== 'granted') return
  setTimeout(() => {
    new Notification(title, { body, icon: '/icon-192.png' })
  }, delayMs)
}

// ── Time helpers ─────────────────────────────────────────────
function getMsUntilNextThursday9am() {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 4=Thu
  let daysUntilThursday = (4 - day + 7) % 7
  if (daysUntilThursday === 0 && now.getHours() >= 9) daysUntilThursday = 7
  const next = new Date(now)
  next.setDate(now.getDate() + daysUntilThursday)
  next.setHours(9, 0, 0, 0)
  return next.getTime() - now.getTime()
}

function getMsUntilSunday11pm() {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  let daysUntilSunday = day === 0 ? 0 : (7 - day)
  if (daysUntilSunday === 0 && now.getHours() >= 23) daysUntilSunday = 7
  const next = new Date(now)
  next.setDate(now.getDate() + daysUntilSunday)
  next.setHours(23, 0, 0, 0)
  return next.getTime() - now.getTime()
}

function getMsUntilNextMonday6am() {
  const now = new Date()
  const day = now.getDay()
  let daysUntilMonday = day === 1 ? 7 : (1 - day + 7) % 7
  const next = new Date(now)
  next.setDate(now.getDate() + daysUntilMonday)
  next.setHours(6, 0, 0, 0)
  return next.getTime() - now.getTime()
}

// ── Main scheduler hook ──────────────────────────────────────
export function useScheduler({ householdId, userId, weeklyMenu, myPicks, onClearBox, onRefreshMenu, onArchiveWeek, onPromoteWeek }) {
  const timersRef = useRef([])

  function clearTimers() {
    timersRef.current.forEach(t => clearTimeout(t))
    timersRef.current = []
  }

  function addTimer(fn, delay) {
    const t = setTimeout(fn, delay)
    timersRef.current.push(t)
    return t
  }

  useEffect(() => {
    if (!householdId) return
    clearTimers()

    // ── Thursday 9am: notify to pick meals ────────────────
    const thursdayDelay = getMsUntilNextThursday9am()
    addTimer(() => {
      if (Notification.permission === 'granted') {
        new Notification('🌿 HelloStinky — Pick your meals!', {
          body: "This week's menu is ready. Tap to pick your meals for next week!",
          icon: '/icon-192.png'
        })
      }
      // Re-schedule for next week
    }, thursdayDelay)

    // ── Sunday 11pm: archive this week, promote next week → this week ──
    const sundayDelay = getMsUntilSunday11pm()
    addTimer(async () => {
      // 1. Archive current this-week meals before overwriting
      if (weeklyMenu.length > 0 && myPicks.length > 0) {
        const now = new Date()
        const day = now.getDay()
        const diff = now.getDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(now.setDate(diff))
        const weekStart = monday.toISOString().split('T')[0]
        await onArchiveWeek(weeklyMenu.filter(r => myPicks.includes(r.id)), weekStart)
      }
      // 2. Promote next week picks → this week (replaces clear)
      if (onPromoteWeek) {
        await onPromoteWeek()
      } else {
        await onClearBox()
      }
    }, sundayDelay)

    // ── Monday 6am: generate a fresh NEXT week menu ───────
    const mondayDelay = getMsUntilNextMonday6am()
    addTimer(() => {
      onRefreshMenu() // this now calls refreshNextWeekMenu in MainApp
    }, mondayDelay)

    return clearTimers
  }, [householdId, weeklyMenu.length, myPicks.length])
}
