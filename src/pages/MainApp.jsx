import { useState, useEffect, useCallback } from 'react'
import { supabase, getMyHousehold, getRecipes, getWeeklyMenu, saveWeeklyMenu, getMyPicks, savePicks, getAllPicks, getHouseholdMembers, saveRecipe, deleteRecipe, saveRating, archiveWeek, getNextWeekMenu, saveNextWeekMenu, getMyNextWeekPicks, saveNextWeekPicks, getAllNextWeekPicks, getMealNotes, getPantry } from '../lib/supabase'
import { generateWeeklyMenu, generateGroceryList, extractRecipesFromText, extractRecipesFromImages } from '../lib/ai'
import { extractTextFromPDF, extractImagesFromPDF, isScannedPDF } from '../lib/pdfExtract'
import { useScheduler, requestNotificationPermission } from '../lib/scheduler'
import MealCard from '../components/MealCard'
import RecipeDrawer from '../components/RecipeDrawer'
import RatingModal from '../components/RatingModal'
import HistoryTab from '../components/HistoryTab'
import PantryTracker from '../components/PantryTracker'
import ProteinSwapModal from '../components/ProteinSwapModal'
import WeekCalendar from '../components/WeekCalendar'
import PreferencesPanel from '../components/PreferencesPanel'

const EMOJIS = ['🍗','🥩','🥦','🍝','🍜','🥗','🍣','🍛','🥘','🫕','🍲','🌮','🐟','🍱','🥙']
const rndEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)]

export default function MainApp({ user }) {
  const [tab, setTab] = useState('thisweek')
  const [household, setHousehold] = useState(null)
  const [members, setMembers] = useState([])
  const [recipes, setRecipes] = useState([])
  const [weeklyMenu, setWeeklyMenuState] = useState([])
  const [myPicks, setMyPicks] = useState([])
  const [allPicks, setAllPicks] = useState([])
  const [groceryItems, setGroceryItems] = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [groceryLoading, setGroceryLoading] = useState(false)
  const [uploadItems, setUploadItems] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [filter, setFilter] = useState('')
  const [mealsPerWeek, setMealsPerWeek] = useState(3)
  const [form, setForm] = useState({ name:'', subtitle:'', time:30, servings:4, calories:'', price:9.99, badge:'', tags:'', ingredients:'' })
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [showRating, setShowRating] = useState(false)
  const [mealsToRate, setMealsToRate] = useState([])
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    localStorage.getItem('hellostinky_notifications') === 'true'
  )
  // Next week state
  const [nextWeekMenu, setNextWeekMenu] = useState([])
  const [nextWeekPicks, setNextWeekPicks] = useState([])
  const [nextWeekAllPicks, setNextWeekAllPicks] = useState([])
  const [nextMenuLoading, setNextMenuLoading] = useState(false)
  const [nextWeekFilter, setNextWeekFilter] = useState('')
  const [proteinSwapRecipe, setProteinSwapRecipe] = useState(null) // recipe pending add-to-box
  // Meal notes, pantry, preferences state
  const [mealNotes, setMealNotes] = useState({})
  const [pantryItems, setPantryItems] = useState([])
  const [accountSubTab, setAccountSubTab] = useState('household')
  const [preferences, setPreferences] = useState({})

  const memberNames = Object.fromEntries(members.map(m => [m.user_id, m.profiles?.name || m.profiles?.email || 'Partner']))
  const memberColors = ['#3c6e47','#e8a020','#1e40af','#9333ea']

  useEffect(() => { loadAll() }, [])

  // Real-time picks sync
  useEffect(() => {
    if (!household) return
    const channel = supabase.channel('picks-' + household.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks', filter: `household_id=eq.${household.id}` }, () => {
        loadAllPicks(household.id)
        loadAllNextWeekPicks(household.id)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [household])

  // Scheduler: Thursday notifications, Sunday clear, Monday refresh
  useScheduler({
    householdId: household?.id,
    userId: user.id,
    weeklyMenu,
    myPicks,
    onClearBox: clearBox,
    onRefreshMenu: () => refreshWeeklyMenu(),
    onArchiveWeek: handleArchiveWeek,
  })

  async function loadAll() {
    const hh = await getMyHousehold(user.id)
    if (!hh) return
    setHousehold(hh)
    const [recs, menu, picks, apicks, mems, nextMenu, nextPicks, nextApicks] = await Promise.all([
      getRecipes(hh.id),
      getWeeklyMenu(hh.id),
      getMyPicks(hh.id, user.id),
      getAllPicks(hh.id),
      getHouseholdMembers(hh.id),
      getNextWeekMenu(hh.id),
      getMyNextWeekPicks(hh.id, user.id),
      getAllNextWeekPicks(hh.id),
    ])
    setRecipes(recs)
    setMembers(mems)
    setMyPicks(picks)
    setAllPicks(apicks)
    setNextWeekPicks(nextPicks)
    setNextWeekAllPicks(nextApicks)
    getMealNotes(hh.id).then(setMealNotes)
    getPantry(hh.id).then(setPantryItems)
    import('../lib/supabase').then(m => m.getPreferences(hh.id)).then(setPreferences)
    if (menu?.meals) {
      try { setWeeklyMenuState(JSON.parse(menu.meals)) } catch {}
    } else {
      refreshWeeklyMenu(hh.id, recs)
    }
    if (nextMenu?.meals) {
      try { setNextWeekMenu(JSON.parse(nextMenu.meals)) } catch {}
    } else {
      refreshNextWeekMenu(hh.id, recs)
    }
  }

  async function loadAllPicks(hhId) {
    const ap = await getAllPicks(hhId)
    setAllPicks(ap)
  }

  async function loadAllNextWeekPicks(hhId) {
    const ap = await getAllNextWeekPicks(hhId)
    setNextWeekAllPicks(ap)
  }

  // Called when user taps "Add to box" on next week menu — show protein swap modal first
  function handleAddToBox(id) {
    const recipe = nextWeekMenu.find(r => r.id === id)
    // If already in box, remove immediately (no swap needed)
    if (nextWeekPicks.includes(id)) {
      toggleNextWeekPick(id)
      return
    }
    // Show protein swap modal before adding
    setProteinSwapRecipe(recipe)
  }

  // Called when user confirms from protein swap modal (with or without swap)
  async function handleProteinSwapConfirm(recipeWithSwap) {
    // If protein was swapped, update the recipe in nextWeekMenu in memory
    if (recipeWithSwap._proteinSwap) {
      setNextWeekMenu(prev => prev.map(r =>
        r.id === recipeWithSwap.id ? { ...r, ...recipeWithSwap } : r
      ))
    }
    setProteinSwapRecipe(null)
    await toggleNextWeekPick(recipeWithSwap.id)
  }

  async function toggleNextWeekPick(id) {
    const idx = nextWeekPicks.indexOf(id)
    const target = mealsPerWeek
    const next = idx >= 0
      ? nextWeekPicks.filter(x => x !== id)
      : nextWeekPicks.length >= target
        ? [...nextWeekPicks.slice(1), id]
        : [...nextWeekPicks, id]
    setNextWeekPicks(next)
    await saveNextWeekPicks(household.id, user.id, next)
    await loadAllNextWeekPicks(household.id)
  }

  async function refreshNextWeekMenu(hhId = household?.id, recs = recipes) {
    if (!hhId) return
    setNextMenuLoading(true)
    try {
      const meals = await generateWeeklyMenu(recs, preferences)
      const tagged = meals.map(r => ({ ...r, id: r.id || Date.now() + Math.random(), emoji: rndEmoji() }))
      setNextWeekMenu(tagged)
      await saveNextWeekMenu(hhId, tagged)
    } catch (e) { alert('Could not generate next week menu: ' + e.message) }
    setNextMenuLoading(false)
  }

  function getNextWeekPickerMap() {
    const map = {}
    nextWeekAllPicks.forEach(p => {
      ;(p.meal_ids || []).forEach(id => {
        if (!map[id]) map[id] = []
        if (!map[id].includes(p.user_id)) map[id].push(p.user_id)
      })
    })
    return map
  }

  function getNextWeekCombinedBox() {
    const map = getNextWeekPickerMap()
    return Object.keys(map).map(Number)
  }

  // Map mealId -> array of userIds who picked it
  function getPickerMap() {
    const map = {}
    allPicks.forEach(p => {
      ;(p.meal_ids || []).forEach(id => {
        if (!map[id]) map[id] = []
        if (!map[id].includes(p.user_id)) map[id].push(p.user_id)
      })
    })
    return map
  }

  async function togglePick(id) {
    const next = myPicks.includes(id)
      ? myPicks.filter(x => x !== id)
      : myPicks.length >= mealsPerWeek
        ? [...myPicks.slice(1), id]
        : [...myPicks, id]
    setMyPicks(next)
    await savePicks(household.id, user.id, next)
    await loadAllPicks(household.id)
    updatePrice(next)
  }

  function updatePrice(picks = myPicks) {
    // price display handled inline
  }

  function totalPrice(picks = myPicks) {
    return picks.reduce((s, id) => {
      const r = weeklyMenu.find(r => r.id === id)
      return s + (r ? (r.price || 9.99) * (r.servings || 4) : 0)
    }, 0)
  }

  async function clearBox() {
    if (!household) return
    // Archive current picks then clear
    const pickedMeals = weeklyMenu.filter(r => myPicks.includes(r.id))
    if (pickedMeals.length > 0) {
      setMealsToRate(pickedMeals)
      setShowRating(true)
    }
    await savePicks(household.id, user.id, [])
    setMyPicks([])
    updatePrice([])
    updateTopbar()
  }

  async function handleArchiveWeek(meals, weekStart) {
    if (!household) return
    await archiveWeek(household.id, meals, weekStart)
  }

  async function handleReAddRecipe(meal) {
    if (!household) return
    const saved = await saveRecipe({ ...meal, emoji: meal.emoji || rndEmoji() }, household.id)
    setRecipes(prev => [saved, ...prev])
  }

  async function enableNotifications() {
    const { data: { session } } = await supabase.auth.getSession()
    const ok = await requestNotificationPermission(session?.access_token)
    if (ok) {
      setNotificationsEnabled(true)
      alert('Notifications enabled! You\'ll get a reminder every Thursday at 9am to pick your meals.')
    } else {
      alert('Could not enable notifications. Please allow notifications in your browser settings.')
    }
  }

  async function handleRatingSubmit(ratings) {
    if (!household) return
    for (const [mealName, rating] of Object.entries(ratings)) {
      if (rating !== 0) {
        const meal = mealsToRate.find(m => m.name === mealName)
        await saveRating(household.id, user.id, mealName, meal, rating)
      }
    }
    setShowRating(false)
    setMealsToRate([])
  }

  async function refreshWeeklyMenu(hhId = household?.id, recs = recipes) {
    if (!hhId) return
    setMenuLoading(true)
    try {
      const meals = await generateWeeklyMenu(recs, preferences)
      const tagged = meals.map(r => ({ ...r, id: r.id || Date.now() + Math.random(), emoji: rndEmoji() }))
      setWeeklyMenuState(tagged)
      await saveWeeklyMenu(hhId, tagged)
    } catch (e) { alert('Could not generate menu: ' + e.message) }
    setMenuLoading(false)
  }

  async function buildGroceryList() {
    const combined = getCombinedBox()
    const sel = weeklyMenu.filter(r => combined.includes(r.id))
    if (!sel.length) { alert('No meals selected by anyone yet!'); return }
    setGroceryLoading(true)
    try {
      const items = await generateGroceryList(sel)
      const pantryNames = new Set(pantryItems.map(p => p.name.toLowerCase()))
      setGroceryItems(items.map((it, i) => ({
        ...it, id: i,
        checked: pantryNames.has(it.name?.toLowerCase()),
        inPantry: pantryNames.has(it.name?.toLowerCase())
      })))
    } catch (e) { alert('Could not build grocery list: ' + e.message) }
    setGroceryLoading(false)
  }

  function getCombinedBox() {
    const pickerMap = getPickerMap()
    return Object.keys(pickerMap).map(Number)
  }

  // Recipes tab
  async function handleFiles(files) {
    for (const file of Array.from(files)) {
      if (file.type !== 'application/pdf') continue
      const itemKey = Date.now() + file.name
      const setProgress = (msg, pct) => setUploadItems(prev => prev.map(it =>
        it.key === itemKey ? { ...it, msg, pct: pct ?? it.pct } : it
      ))
      setUploadItems(prev => [...prev, { key: itemKey, name: file.name, status: 'loading', msg: 'Reading PDF...', pct: 0 }])
      try {
        setProgress('Detecting PDF type...', 5)
        const scanned = await isScannedPDF(file)
        let arr = []

        if (!scanned) {
          setProgress('Extracting text from PDF...', 15)
          const text = await extractTextFromPDF(file)
          const kb = Math.round(text.length / 1000)
          setProgress(`Found ${kb}k characters — scanning for recipes...`, 30)
          // Hook into extractRecipesFromText progress via a wrapper
          arr = await extractRecipesFromText(text, (chunkDone, chunkTotal) => {
            const pct = 30 + Math.round((chunkDone / chunkTotal) * 55)
            setProgress(`Scanning chunk ${chunkDone} of ${chunkTotal}...`, pct)
          })
        } else {
          setProgress('Scanned PDF detected — rendering pages...', 10)
          const pages = await extractImagesFromPDF(file, (done, total) => {
            const pct = 10 + Math.round((done / total) * 30)
            setProgress(`Rendering page ${done} of ${total}...`, pct)
          })
          setProgress(`Reading ${pages.length} pages with AI vision...`, 40)
          arr = await extractRecipesFromImages(pages, (done, total) => {
            const pct = 40 + Math.round((done / total) * 45)
            setProgress(`Reading page ${done} of ${total} with AI...`, pct)
          })
        }

        if (arr.length === 0) throw new Error('No recipes found. Make sure the PDF contains recipe content.')
        setProgress(`Saving ${arr.length} recipes...`, 90)
        for (let i = 0; i < arr.length; i++) {
          const saved = await saveRecipe({ ...arr[i], emoji: rndEmoji() }, household.id)
          setRecipes(prev => [saved, ...prev])
          const pct = 90 + Math.round(((i + 1) / arr.length) * 10)
          setProgress(`Saving recipe ${i + 1} of ${arr.length}...`, pct)
        }
        setUploadItems(prev => prev.map(it => it.key === itemKey
          ? { ...it, status: 'done', pct: 100, count: arr.length, names: arr.map(r => r.name) } : it))
      } catch (err) {
        setUploadItems(prev => prev.map(it => it.key === itemKey ? { ...it, status: 'err', pct: 0, msg: err.message } : it))
      }
    }
  }

  async function handleSaveRecipe(e) {
    e.preventDefault()
    const ingLines = form.ingredients.trim().split('\n').filter(Boolean)
    const ingredients = ingLines.map(l => { const p = l.split(','); return { item: p[0]?.trim() || l, amount: p[1]?.trim() || '' } })
    const r = {
      name: form.name, subtitle: form.subtitle,
      time: parseInt(form.time) || 30, servings: parseInt(form.servings) || 4,
      calories: parseInt(form.calories) || null, price: parseFloat(form.price) || 9.99,
      badge: form.badge, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      ingredients, emoji: rndEmoji()
    }
    const saved = await saveRecipe(r, household.id)
    setRecipes(prev => [saved, ...prev])
    setForm({ name:'', subtitle:'', time:30, servings:4, calories:'', price:9.99, badge:'', tags:'', ingredients:'' })
    setShowAddForm(false)
  }

  async function handleDeleteRecipe(id) {
    await deleteRecipe(id)
    setRecipes(prev => prev.filter(r => r.id !== id))
  }

  // Filtered menu
  const filteredMenu = weeklyMenu.filter(r => {
    if (!filter) return true
    if (filter === 'quick') return r.time <= 25
    return (r.tags || []).includes(filter)
  })

  const pickerMap = getPickerMap()
  const combinedBox = getCombinedBox()
  const myPicksSet = new Set(myPicks)

  const myName = user.user_metadata?.name || user.email?.split('@')[0] || 'You'

  return (
    <div className="app">
      {/* Topbar */}
      <div className="topbar">
        <div className="logo">🌿 HelloStinky</div>
        <div className="topbar-right">
          <span className="topbar-user">{myName}</span>
          <span style={{ opacity: 0.6 }}>|</span>
          <span>Next week: {nextWeekPicks.length}/{mealsPerWeek} picked</span>
        </div>
      </div>

      {/* Banner */}
      <div className="banner">
        <span>Picking for <strong>next week</strong> — this week's meals are in the This week tab</span>
        <span className="price">${totalPrice().toFixed(2)}</span>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[
          ['thisweek', 'This week 🍽'],
          ['nextweek', 'Next week 📋'],
          ['grocery', 'Grocery list'],
          ['recipes', 'My recipes'],
          ['history', 'History'],
          ['account', 'Account'],
        ].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
            {id === 'nextweek' && getNextWeekCombinedBox().length > 0 && <span style={{ marginLeft: 4, background: '#3c6e47', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>{getNextWeekCombinedBox().length}</span>}
          </button>
        ))}
      </div>

      {/* ── This Week Tab (current box — cook from it) ── */}
      {tab === 'thisweek' && (
        <div className="page">
          <div className="page-title">This week</div>
          <div className="page-sub">Your current box — tap any meal to view the full recipe and cooking steps</div>

          {combinedBox.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              No meals in this week's box yet.
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-green btn-sm" onClick={() => setTab('nextweek')}>Pick meals for next week →</button>
              </div>
            </div>
          ) : (
            <>
              <div className="box-summary">
                <div>
                  <div className="box-count">{combinedBox.length} meals</div>
                  <div className="box-label">in this week's household box</div>
                </div>
                <button className="btn btn-green btn-sm" onClick={() => setTab('grocery')}>Grocery list →</button>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📅 Week planner</div>
                <WeekCalendar householdId={household?.id} meals={weeklyMenu.filter(r => combinedBox.includes(r.id))} />
              </div>
              {allPicks.filter(p => (p.meal_ids || []).length > 0).map((p, i) => (
                <div key={p.user_id} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div className="avatar" style={{ background: memberColors[i % memberColors.length] }}>
                      {(memberNames[p.user_id] || '?')[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {p.user_id === user.id ? 'Your picks' : `${memberNames[p.user_id]}'s picks`}
                    </span>
                  </div>
                  <div className="meal-grid">
                    {(p.meal_ids || []).map(id => {
                      const r = weeklyMenu.find(x => x.id === id)
                      if (!r) return null
                      return (
                        <div key={r.id} style={{ position: 'relative' }}>
                          <MealCard recipe={r} isSelected={false} pickedBy={[]} memberNames={memberNames} onToggle={() => setSelectedRecipe(r)} />
                          <button onClick={() => setSelectedRecipe(r)} style={{
                            position: 'absolute', top: 8, right: 8,
                            background: 'rgba(255,255,255,0.92)', border: '0.5px solid rgba(0,0,0,0.12)',
                            borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', color: '#3c6e47', zIndex: 10
                          }}>Cook →</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Next Week Tab (pick meals for upcoming week) ── */}
      {tab === 'nextweek' && (() => {
        const nextPickerMap = getNextWeekPickerMap()
        const nextPicksSet = new Set(nextWeekPicks)
        const filteredNext = nextWeekMenu.filter(r => {
          if (!nextWeekFilter) return true
          if (nextWeekFilter === 'quick') return r.time <= 25
          return (r.tags || []).includes(nextWeekFilter)
        })
        return (
          <div className="page">
            <div className="page-title">Next week's menu</div>
            <div className="page-sub">Pick your meals for next week — your choices sync with your partner in real time</div>

            <div className="controls">
              <label>Meals/week:</label>
              <select value={mealsPerWeek} onChange={e => setMealsPerWeek(+e.target.value)}>
                {[3,4,5,6].map(n => <option key={n} value={n}>{n} meals</option>)}
              </select>
              <label>Filter:</label>
              <select value={nextWeekFilter} onChange={e => setNextWeekFilter(e.target.value)}>
                <option value="">All</option>
                <option value="quick">Quick (&lt;25 min)</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="family">Family friendly</option>
                <option value="healthy">Healthy</option>
              </select>
              <button className="btn btn-green btn-sm" onClick={() => refreshNextWeekMenu()} disabled={nextMenuLoading}>
                {nextMenuLoading ? '...' : '✦ Refresh menu'}
              </button>
            </div>

            <div style={{ background: '#f0f9ff', border: '0.5px solid #bae6fd', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#0c4a6e' }}>
              📋 You've picked <strong>{nextWeekPicks.length}</strong> of <strong>{mealsPerWeek}</strong> meals for next week
            </div>

            {nextMenuLoading && <div className="loading-bar"><div className="spinner" />Curating next week's seasonal menu...</div>}

            <div className="meal-grid">
              {filteredNext.map(r => (
                <div key={r.id} style={{ position: 'relative' }}>
                  <MealCard
                    recipe={r}
                    isSelected={nextPicksSet.has(r.id)}
                    pickedBy={nextPickerMap[r.id] || []}
                    memberNames={memberNames}
                    onToggle={handleAddToBox}
                  />
                  <button onClick={() => setSelectedRecipe(r)} style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'rgba(255,255,255,0.92)', border: '0.5px solid rgba(0,0,0,0.12)',
                    borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', color: '#3c6e47', zIndex: 10
                  }}>View</button>
                </div>
              ))}
            </div>
            {filteredNext.length === 0 && !nextMenuLoading && (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                No meals yet — click Refresh menu to generate next week's selection
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Grocery Tab ── */}
      {tab === 'grocery' && (
        <div className="page">
          <div className="page-title">Grocery list</div>
          <div className="page-sub">Based on all household picks — shared ingredients combined</div>

          <details style={{ marginBottom: 16, background: '#fafaf8', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '12px 14px' }}>
            <summary style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
              🏠 Pantry tracker — skip items you already have
            </summary>
            <div style={{ marginTop: 12 }}>
              <PantryTracker householdId={household?.id} userId={user.id} groceryItems={groceryItems} />
            </div>
          </details>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-green btn-sm" onClick={buildGroceryList} disabled={groceryLoading}>
              ✦ {groceryLoading ? 'Building...' : 'Build grocery list'}
            </button>
            <button className="btn btn-sm" onClick={() => setGroceryItems([])}>Clear</button>
          </div>
          {groceryLoading && <div className="loading-bar"><div className="spinner" />Compiling optimized grocery list...</div>}
          {groceryItems.length === 0 && !groceryLoading && (
            <div className="empty-state"><div className="empty-icon">🛒</div>Click "Build grocery list" to compile from your household's picks</div>
          )}
          {groceryItems.length > 0 && (() => {
            const cats = {}
            groceryItems.forEach(it => { if (!cats[it.category]) cats[it.category] = []; cats[it.category].push(it) })
            const sharedCount = groceryItems.filter(i => i.shared).length
            return (
              <>
                <div style={{ marginBottom: 14 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eaf3de', color: '#27500a', padding: '5px 12px', borderRadius: 20, fontSize: 12 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3c6e47', display: 'inline-block' }} />
                    {sharedCount} shared ingredients — less waste
                  </span>
                </div>
                {Object.entries(cats).map(([cat, items]) => (
                  <div key={cat} style={{ marginBottom: 16 }}>
                    <div className="grocery-cat-head">{cat}</div>
                    {items.map(it => (
                      <div key={it.id} className={`grocery-row${it.checked ? ' done' : ''}`} style={{ opacity: it.inPantry ? 0.5 : 1 }}>
                        <input type="checkbox" checked={it.checked} onChange={() => setGroceryItems(prev => prev.map(x => x.id === it.id ? { ...x, checked: !x.checked } : x))} />
                        <span className="g-name">{it.name}</span>
                        {it.shared && <span className="shared-dot" />}
                        {it.inPantry && <span style={{ fontSize: 10, background: '#eaf3de', color: '#27500a', padding: '1px 6px', borderRadius: 20 }}>pantry</span>}
                        <span className="g-qty">{it.amount}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )
          })()}
        </div>
      )}

      {/* ── Recipes Tab ── */}
      {tab === 'recipes' && (
        <div className="page">
          <div className="page-title">My recipes</div>
          <div className="page-sub">Add recipes manually or upload PDFs — they'll appear in next week's curated menu</div>

          <div
            className="upload-zone"
            onClick={() => document.getElementById('pdf-input').click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag') }}
            onDragLeave={e => e.currentTarget.classList.remove('drag')}
            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('drag'); handleFiles(e.dataTransfer.files) }}
          >
            <input id="pdf-input" type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            <div style={{ fontSize: 28 }}>📄</div>
            <p><strong>Click to upload</strong> or drag &amp; drop recipe PDFs</p>
            <p>AI extracts all recipe details automatically</p>
          </div>

          {uploadItems.map(it => (
            <div key={it.key} style={{
              background: it.status === 'done' ? '#eaf3de' : it.status === 'err' ? '#fdecea' : '#f5f5f3',
              borderRadius: 10, padding: '12px 14px', marginBottom: 8,
              border: `0.5px solid ${it.status === 'done' ? '#c0dd97' : it.status === 'err' ? '#f09595' : 'rgba(0,0,0,0.08)'}`
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: it.status === 'loading' ? 10 : 0 }}>
                {it.status === 'loading' && <div className="spinner" style={{ borderTopColor: '#3c6e47', borderColor: '#c0dd97', flexShrink: 0 }} />}
                {it.status === 'done' && <span style={{ color: '#3c6e47', fontSize: 16, flexShrink: 0 }}>✓</span>}
                {it.status === 'err' && <span style={{ color: '#c0392b', fontSize: 16, flexShrink: 0 }}>✕</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.name}
                  </div>
                  <div style={{ fontSize: 12, color: it.status === 'err' ? '#c0392b' : it.status === 'done' ? '#27500a' : '#555' }}>
                    {it.status === 'loading' && (it.msg || 'Reading...')}
                    {it.status === 'done' && `Found ${it.count} recipe${it.count !== 1 ? 's' : ''}`}
                    {it.status === 'err' && it.msg}
                  </div>
                </div>
                {it.status === 'loading' && it.pct > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#3c6e47', flexShrink: 0 }}>{it.pct}%</span>
                )}
              </div>

              {/* Progress bar */}
              {it.status === 'loading' && (
                <div style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 20, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 20,
                    background: 'linear-gradient(90deg, #3c6e47, #5a9c6a)',
                    width: `${it.pct || 0}%`,
                    transition: 'width 0.4s ease',
                    minWidth: it.pct > 0 ? 12 : 0
                  }} />
                </div>
              )}

              {/* Done: recipe names */}
              {it.status === 'done' && it.names && it.names.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {it.names.slice(0, 8).map((name, i) => (
                    <span key={i} style={{
                      fontSize: 11, background: '#fff', color: '#27500a',
                      padding: '2px 8px', borderRadius: 20,
                      border: '0.5px solid #c0dd97'
                    }}>{name}</span>
                  ))}
                  {it.names.length > 8 && (
                    <span style={{ fontSize: 11, color: '#3c6e47', padding: '2px 4px' }}>+{it.names.length - 8} more</span>
                  )}
                </div>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
            <button className="btn btn-green btn-sm" onClick={() => setShowAddForm(v => !v)}>+ Add manually</button>
          </div>

          {showAddForm && (
            <form className="recipe-form" onSubmit={handleSaveRecipe}>
              <div className="form-grid-2">
                <div className="form-row"><label>Recipe name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Lemon Herb Chicken" required /></div>
                <div className="form-row"><label>Subtitle</label><input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="with rice and greens" /></div>
              </div>
              <div className="form-grid-3">
                <div className="form-row"><label>Cook time (min)</label><input type="number" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} min={5} /></div>
                <div className="form-row"><label>Servings</label><input type="number" value={form.servings} onChange={e => setForm(f => ({ ...f, servings: e.target.value }))} min={1} /></div>
                <div className="form-row"><label>Cal/serving</label><input type="number" value={form.calories} onChange={e => setForm(f => ({ ...f, calories: e.target.value }))} placeholder="520" /></div>
              </div>
              <div className="form-grid-3">
                <div className="form-row"><label>Price/serving ($)</label><input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
                <div className="form-row"><label>Badge</label>
                  <select value={form.badge} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))}>
                    <option value="">None</option>
                    <option value="calorie">Calorie smart</option>
                    <option value="quick">20-min meal</option>
                    <option value="gourmet">Gourmet</option>
                    <option value="taste">Taste tours</option>
                  </select>
                </div>
                <div className="form-row"><label>Tags</label><input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="chicken, healthy" /></div>
              </div>
              <div className="form-row"><label>Ingredients (one per line: item, amount)</label>
                <textarea value={form.ingredients} onChange={e => setForm(f => ({ ...f, ingredients: e.target.value }))} placeholder={"chicken breast, 600g\nlemon, 2\ngarlic, 3 cloves"} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="submit" className="btn btn-green btn-sm">Save recipe</button>
                <button type="button" className="btn btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            </form>
          )}

          <div className="meal-grid" style={{ marginTop: 4 }}>
            {recipes.map(r => (
              <div key={r.id} className="meal-card">
                <div className="meal-thumb"><span style={{ fontSize: 32 }}>{r.emoji || '🍽'}</span></div>
                <div className="meal-body">
                  <div className="meal-name">{r.name}</div>
                  <div className="meal-sub">{r.subtitle || ''}</div>
                  <div className="meal-meta"><span>{r.time || 30} min</span><span className="dot">·</span><span>{(r.ingredients || []).length} ingredients</span></div>
                  {r.calories && <span className="cal-pill" style={{ marginTop: 4 }}>🔥 {Math.round(r.calories)} cal</span>}
                </div>
                <div className="meal-footer">
                  <button className="add-box-btn" style={{ color: '#c0392b', borderColor: '#c0392b' }} onClick={() => handleDeleteRecipe(r.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
          {recipes.length === 0 && <div className="empty-state"><div className="empty-icon">📖</div>No recipes yet. Upload a PDF or add one manually.</div>}
        </div>
      )}

      {/* ── Account Tab ── */}
      {tab === 'account' && (
        <div className="page">
          <div className="page-title">Account & settings</div>

          {/* Sub-tab bar */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: '#f5f5f3', borderRadius: 10, padding: 4 }}>
            {[['household', '🏡 Household'], ['preferences', '🥗 Food prefs'], ['notifications', '🔔 Notifications']].map(([id, label]) => (
              <button key={id} onClick={() => setAccountSubTab(id)} style={{
                flex: 1, padding: '8px 6px', fontSize: 12, fontWeight: 500,
                background: accountSubTab === id ? '#fff' : 'transparent',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                color: accountSubTab === id ? '#1a1a1a' : '#888',
                boxShadow: accountSubTab === id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}>{label}</button>
            ))}
          </div>

          {accountSubTab === 'household' && (
            <>
              <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '16px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your household</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{household?.name || 'My Household'}</div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>Invite code:</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 6, color: '#3c6e47', background: '#eaf3de', padding: '10px 16px', borderRadius: 8, textAlign: 'center', marginBottom: 8 }}>{household?.invite_code}</div>
                <div style={{ fontSize: 12, color: '#888' }}>Share this 6-letter code with your partner so they can join</div>
              </div>
              <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '16px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Members ({members.length})</div>
                {members.map((m, i) => (
                  <div key={m.user_id} className="member-row">
                    <div className="avatar" style={{ background: memberColors[i % memberColors.length] }}>
                      {(m.profiles?.name || m.profiles?.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{m.profiles?.name || 'Member'} {m.user_id === user.id ? '(you)' : ''}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{m.profiles?.email}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 11, color: '#888', background: '#f5f5f3', padding: '2px 8px', borderRadius: 20 }}>{m.role}</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-sm" onClick={() => { import('../lib/supabase').then(m => m.signOut()).then(() => window.location.reload()) }}>Sign out</button>
            </>
          )}

          {accountSubTab === 'preferences' && (
            <PreferencesPanel householdId={household?.id} />
          )}

          {accountSubTab === 'notifications' && (
            <div>
              <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '16px', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📅 Thursday reminders</div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Get a push notification every Thursday at 9am to pick next week's meals</div>
                {notificationsEnabled ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3c6e47', fontSize: 13 }}>
                    <span>✓</span> Notifications enabled
                  </div>
                ) : (
                  <button onClick={enableNotifications} className="btn btn-green btn-sm">Enable notifications</button>
                )}
              </div>
              <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '16px', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🗑 Sunday reset</div>
                <div style={{ fontSize: 13, color: '#666' }}>Every Sunday at 11pm your box is automatically cleared and archived. You'll be asked to rate that week's meals.</div>
              </div>
              <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📋 Monday menu</div>
                <div style={{ fontSize: 13, color: '#666' }}>Every Monday at 6am a fresh seasonal menu is generated for next week based on your preferences and past ratings.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <div className="page">
          <div className="page-title">Meal history</div>
          <div className="page-sub">Past weeks — tap to expand and re-add favourites</div>
          <HistoryTab householdId={household?.id} onReAddRecipe={handleReAddRecipe} />
        </div>
      )}

      {/* ── Floating notification prompt on account tab ── */}
      {tab === 'account' && !notificationsEnabled && (
        <div style={{ position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 50 }}>
          <div style={{ background: '#3c6e47', color: '#fff', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>🔔 Enable reminders</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Get notified every Thursday to pick meals</div>
            </div>
            <button onClick={enableNotifications} style={{ background: '#fff', color: '#3c6e47', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              Turn on
            </button>
          </div>
        </div>
      )}

      {/* ── Rating Modal ── */}
      {showRating && (
        <RatingModal
          meals={mealsToRate}
          onSubmit={handleRatingSubmit}
          onSkip={() => { setShowRating(false); setMealsToRate([]) }}
        />
      )}

      {/* ── Recipe Drawer ── */}
      <RecipeDrawer
        recipe={selectedRecipe}
        onClose={() => setSelectedRecipe(null)}
        householdId={household?.id}
        userId={user.id}
        mealNotes={mealNotes}
        onNoteUpdate={(name, note) => setMealNotes(n => ({ ...n, [name]: note }))}
      />
    </div>
  )
}
