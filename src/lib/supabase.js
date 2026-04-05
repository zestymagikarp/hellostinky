import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ── Auth helpers ─────────────────────────────────────────────
export async function signUp(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name } }
  })
  if (error) throw error
  return data
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ── Household helpers ────────────────────────────────────────
export async function createHousehold(name, userId) {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase()
  const { data, error } = await supabase
    .from('households')
    .insert({ name, invite_code: code, created_by: userId })
    .select().single()
  if (error) throw error
  await supabase.from('household_members').insert({ household_id: data.id, user_id: userId, role: 'owner' })
  return data
}

export async function joinHousehold(code, userId) {
  const { data: hh, error } = await supabase
    .from('households')
    .select('*')
    .eq('invite_code', code.toUpperCase())
    .single()
  if (error || !hh) throw new Error('Household not found. Check the invite code.')
  const { error: me } = await supabase
    .from('household_members')
    .upsert({ household_id: hh.id, user_id: userId, role: 'member' })
  if (me) throw me
  return hh
}

export async function getMyHousehold(userId) {
  const { data } = await supabase
    .from('household_members')
    .select('household_id, households(*)')
    .eq('user_id', userId)
    .single()
  return data?.households || null
}

export async function getHouseholdMembers(householdId) {
  const { data } = await supabase
    .from('household_members')
    .select('user_id, role, profiles(name, email)')
    .eq('household_id', householdId)
  return data || []
}

// ── Recipes helpers ──────────────────────────────────────────
export async function getRecipes(householdId) {
  const { data } = await supabase
    .from('recipes')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
  return data || []
}

export async function saveRecipe(recipe, householdId) {
  const { data, error } = await supabase
    .from('recipes')
    .insert({ ...recipe, household_id: householdId })
    .select().single()
  if (error) throw error
  return data
}

export async function deleteRecipe(id) {
  await supabase.from('recipes').delete().eq('id', id)
}

// ── Weekly menu helpers ──────────────────────────────────────
export async function getWeeklyMenu(householdId) {
  const weekStart = getWeekStart()
  const { data } = await supabase
    .from('weekly_menus')
    .select('*')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
    .single()
  return data
}

export async function saveWeeklyMenu(householdId, meals) {
  const weekStart = getWeekStart()
  const { data, error } = await supabase
    .from('weekly_menus')
    .upsert({ household_id: householdId, week_start: weekStart, meals: JSON.stringify(meals) }, { onConflict: 'household_id,week_start' })
    .select().single()
  if (error) throw error
  return data
}

// ── Picks helpers ────────────────────────────────────────────
export async function getMyPicks(householdId, userId) {
  const weekStart = getWeekStart()
  const { data } = await supabase
    .from('picks')
    .select('meal_ids')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .single()
  return data?.meal_ids || []
}

export async function savePicks(householdId, userId, mealIds) {
  const weekStart = getWeekStart()
  await supabase
    .from('picks')
    .upsert({ household_id: householdId, user_id: userId, week_start: weekStart, meal_ids: mealIds },
      { onConflict: 'household_id,user_id,week_start' })
}

export async function getAllPicks(householdId) {
  const weekStart = getWeekStart()
  const { data } = await supabase
    .from('picks')
    .select('user_id, meal_ids, profiles(name)')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
  return data || []
}

// ── Util ─────────────────────────────────────────────────────
export function getWeekStart(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday.toISOString().split('T')[0]
}

// ── Next-week menu helpers ────────────────────────────────────
export async function getNextWeekMenu(householdId) {
  const weekStart = getWeekStart(1)
  const { data } = await supabase
    .from('weekly_menus')
    .select('*')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
    .single()
  return data
}

export async function saveNextWeekMenu(householdId, meals) {
  const weekStart = getWeekStart(1)
  const { data, error } = await supabase
    .from('weekly_menus')
    .upsert({ household_id: householdId, week_start: weekStart, meals: JSON.stringify(meals) }, { onConflict: 'household_id,week_start' })
    .select().single()
  if (error) throw error
  return data
}

export async function getMyNextWeekPicks(householdId, userId) {
  const weekStart = getWeekStart(1)
  const { data } = await supabase
    .from('picks')
    .select('meal_ids')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .single()
  return data?.meal_ids || []
}

export async function saveNextWeekPicks(householdId, userId, mealIds) {
  const weekStart = getWeekStart(1)
  await supabase
    .from('picks')
    .upsert({ household_id: householdId, user_id: userId, week_start: weekStart, meal_ids: mealIds },
      { onConflict: 'household_id,user_id,week_start' })
}

export async function getAllNextWeekPicks(householdId) {
  const weekStart = getWeekStart(1)
  const { data } = await supabase
    .from('picks')
    .select('user_id, meal_ids, profiles(name)')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
  return data || []
}

// ── Ratings helpers ──────────────────────────────────────────
export async function saveRating(householdId, userId, mealName, mealData, rating) {
  const weekStart = getWeekStart()
  await supabase.from('meal_ratings').upsert(
    { household_id: householdId, user_id: userId, meal_name: mealName, meal_data: mealData, rating, week_start: weekStart },
    { onConflict: 'household_id,user_id,meal_name,week_start' }
  )
}

export async function getMyRatings(householdId, userId) {
  const { data } = await supabase
    .from('meal_ratings')
    .select('meal_name, rating')
    .eq('household_id', householdId)
    .eq('user_id', userId)
  return data || []
}

export async function getAllRatings(householdId) {
  const { data } = await supabase
    .from('meal_ratings')
    .select('meal_name, rating, week_start, profiles(name)')
    .eq('household_id', householdId)
    .order('week_start', { ascending: false })
  return data || []
}

// ── History helpers ──────────────────────────────────────────
export async function archiveWeek(householdId, meals, weekStart) {
  await supabase.from('meal_history').upsert(
    { household_id: householdId, week_start: weekStart, meals: JSON.stringify(meals) },
    { onConflict: 'household_id,week_start' }
  )
}

export async function getMealHistory(householdId) {
  const { data } = await supabase
    .from('meal_history')
    .select('*')
    .eq('household_id', householdId)
    .order('week_start', { ascending: false })
    .limit(8)
  return data || []
}

// ── Push notification helpers ────────────────────────────────
export async function savePushSubscription(subscription, token) {
  await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ subscription })
  })
}

// ── Pantry helpers ───────────────────────────────────────────
export async function getPantry(householdId) {
  const { data } = await supabase.from('pantry_items').select('*').eq('household_id', householdId).order('name')
  return data || []
}
export async function addPantryItem(householdId, name, userId) {
  await supabase.from('pantry_items').upsert({ household_id: householdId, name: name.toLowerCase().trim(), added_by: userId }, { onConflict: 'household_id,name' })
}
export async function removePantryItem(householdId, name) {
  await supabase.from('pantry_items').delete().eq('household_id', householdId).eq('name', name.toLowerCase().trim())
}

// ── Preferences helpers ──────────────────────────────────────
export async function getPreferences(householdId) {
  const { data } = await supabase.from('household_preferences').select('*').eq('household_id', householdId).single()
  return data || { dietary: [], allergies: [], household_size: 2, cuisine_likes: [], cuisine_dislikes: [] }
}
export async function savePreferences(householdId, prefs) {
  await supabase.from('household_preferences').upsert({ household_id: householdId, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'household_id' })
}

// ── Meal notes helpers ────────────────────────────────────────
export async function getMealNotes(householdId) {
  const { data } = await supabase.from('meal_notes').select('*, profiles(name)').eq('household_id', householdId)
  return Object.fromEntries((data || []).map(n => [n.meal_name, n]))
}
export async function saveMealNote(householdId, mealName, note, userId) {
  await supabase.from('meal_notes').upsert({ household_id: householdId, meal_name: mealName, note, author_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'household_id,meal_name' })
}
export async function deleteMealNote(householdId, mealName) {
  await supabase.from('meal_notes').delete().eq('household_id', householdId).eq('meal_name', mealName)
}

// ── Schedule helpers ─────────────────────────────────────────
export async function getMealSchedule(householdId, weekStart) {
  const { data } = await supabase.from('meal_schedule').select('*').eq('household_id', householdId).eq('week_start', weekStart).single()
  return data?.schedule || {}
}
export async function saveMealSchedule(householdId, weekStart, schedule) {
  await supabase.from('meal_schedule').upsert({ household_id: householdId, week_start: weekStart, schedule, updated_at: new Date().toISOString() }, { onConflict: 'household_id,week_start' })
}
