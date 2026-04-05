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
function getWeekStart() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return monday.toISOString().split('T')[0]
}
