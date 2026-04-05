import { useState, useEffect, useCallback } from 'react'
import { supabase, getMyHousehold, getRecipes, getWeeklyMenu, saveWeeklyMenu, getMyPicks, savePicks, getAllPicks, getHouseholdMembers, saveRecipe, deleteRecipe } from '../lib/supabase'
import { generateWeeklyMenu, generateGroceryList, extractRecipesFromPDF } from '../lib/ai'
import MealCard from '../components/MealCard'

const EMOJIS = ['🍗','🥩','🥦','🍝','🍜','🥗','🍣','🍛','🥘','🫕','🍲','🌮','🐟','🍱','🥙']
const rndEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)]

export default function MainApp({ user }) {
  const [tab, setTab] = useState('menu')
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

  const memberNames = Object.fromEntries(members.map(m => [m.user_id, m.profiles?.name || m.profiles?.email || 'Partner']))
  const memberColors = ['#3c6e47','#e8a020','#1e40af','#9333ea']

  useEffect(() => { loadAll() }, [])

  // Real-time picks sync
  useEffect(() => {
    if (!household) return
    const channel = supabase.channel('picks-' + household.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks', filter: `household_id=eq.${household.id}` }, () => {
        loadAllPicks(household.id)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [household])

  async function loadAll() {
    const hh = await getMyHousehold(user.id)
    if (!hh) return
    setHousehold(hh)
    const [recs, menu, picks, apicks, mems] = await Promise.all([
      getRecipes(hh.id),
      getWeeklyMenu(hh.id),
      getMyPicks(hh.id, user.id),
      getAllPicks(hh.id),
      getHouseholdMembers(hh.id),
    ])
    setRecipes(recs)
    setMembers(mems)
    setMyPicks(picks)
    setAllPicks(apicks)
    if (menu?.meals) {
      try { setWeeklyMenuState(JSON.parse(menu.meals)) } catch {}
    } else {
      refreshWeeklyMenu(hh.id, recs)
    }
  }

  async function loadAllPicks(hhId) {
    const ap = await getAllPicks(hhId)
    setAllPicks(ap)
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

  async function refreshWeeklyMenu(hhId = household?.id, recs = recipes) {
    if (!hhId) return
    setMenuLoading(true)
    try {
      const meals = await generateWeeklyMenu(recs)
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
      setGroceryItems(items.map((it, i) => ({ ...it, id: i, checked: false })))
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
      if (file.size > 15 * 1024 * 1024) {
        setUploadItems(prev => [...prev, { key: Date.now() + file.name, name: file.name, status: 'err', msg: 'File too large (max 15MB). Try splitting the PDF into smaller parts.' }])
        continue
      }
      const itemKey = Date.now() + file.name
      setUploadItems(prev => [...prev, { key: itemKey, name: file.name, status: 'loading', msg: 'Reading PDF...' }])
      try {
        const b64 = await new Promise((res, rej) => {
          const fr = new FileReader()
          fr.onload = () => res(fr.result.split(',')[1])
          fr.onerror = rej
          fr.readAsDataURL(file)
        })
        setUploadItems(prev => prev.map(it => it.key === itemKey ? { ...it, msg: 'Extracting recipes with AI...' } : it))
        const extracted = await extractRecipesFromPDF(b64)
        const arr = Array.isArray(extracted) ? extracted : [extracted]
        setUploadItems(prev => prev.map(it => it.key === itemKey ? { ...it, msg: `Saving ${arr.length} recipes...` } : it))
        for (const r of arr) {
          const saved = await saveRecipe({ ...r, emoji: rndEmoji() }, household.id)
          setRecipes(prev => [saved, ...prev])
        }
        setUploadItems(prev => prev.map(it => it.key === itemKey ? { ...it, status: 'done', count: arr.length, names: arr.map(r => r.name) } : it))
      } catch (err) {
        setUploadItems(prev => prev.map(it => it.key === itemKey ? { ...it, status: 'err', msg: err.message } : it))
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
          <span>{myPicks.length}/{mealsPerWeek} picked</span>
        </div>
      </div>

      {/* Banner */}
      <div className="banner">
        <span>Pick <strong>{mealsPerWeek} meals</strong> — household box combines both of your choices</span>
        <span className="price">${totalPrice().toFixed(2)}</span>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[['menu', 'This week'], ['box', 'Household box'], ['grocery', 'Grocery list'], ['recipes', 'My recipes'], ['account', 'Account']].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
            {id === 'box' && combinedBox.length > 0 && <span style={{ marginLeft: 4, background: '#3c6e47', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>{combinedBox.length}</span>}
          </button>
        ))}
      </div>

      {/* ── Menu Tab ── */}
      {tab === 'menu' && (
        <div className="page">
          <div className="page-title">This week's menu</div>
          <div className="page-sub">Your partner's picks show their initial. Both-picked meals have a green glow.</div>

          <div className="controls">
            <label>Meals/week:</label>
            <select value={mealsPerWeek} onChange={e => setMealsPerWeek(+e.target.value)}>
              {[3,4,5,6].map(n => <option key={n} value={n}>{n} meals</option>)}
            </select>
            <label>Filter:</label>
            <select value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="">All</option>
              <option value="quick">Quick (&lt;25 min)</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="family">Family friendly</option>
              <option value="healthy">Healthy</option>
            </select>
            <button className="btn btn-green btn-sm" onClick={() => refreshWeeklyMenu()} disabled={menuLoading}>
              {menuLoading ? '...' : '✦ Refresh menu'}
            </button>
          </div>

          {menuLoading && (
            <div className="loading-bar">
              <div className="spinner" />
              Curating this week's seasonal menu...
            </div>
          )}

          <div className="meal-grid">
            {filteredMenu.map(r => (
              <MealCard
                key={r.id}
                recipe={r}
                isSelected={myPicksSet.has(r.id)}
                pickedBy={pickerMap[r.id] || []}
                memberNames={memberNames}
                onToggle={togglePick}
              />
            ))}
          </div>
          {filteredMenu.length === 0 && !menuLoading && (
            <div className="empty-state">
              <div className="empty-icon">🍽</div>
              No meals yet — click Refresh menu to generate this week's selection
            </div>
          )}
        </div>
      )}

      {/* ── Household Box Tab ── */}
      {tab === 'box' && (
        <div className="page">
          <div className="page-title">Household box</div>
          <div className="page-sub">All meals picked by anyone in your household this week</div>

          {combinedBox.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              No meals picked yet. Go to This week's menu to start picking!
            </div>
          ) : (
            <>
              <div className="box-summary">
                <div>
                  <div className="box-count">{combinedBox.length} meals</div>
                  <div className="box-label">combined from {members.length} household member{members.length !== 1 ? 's' : ''}</div>
                </div>
                <button className="btn btn-green btn-sm" onClick={() => setTab('grocery')}>Build grocery list →</button>
              </div>

              {/* Who picked what */}
              {allPicks.filter(p => (p.meal_ids || []).length > 0).map((p, i) => (
                <div key={p.user_id} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div className="avatar" style={{ background: memberColors[i % memberColors.length] }}>
                      {(memberNames[p.user_id] || '?')[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {p.user_id === user.id ? 'Your picks' : `${memberNames[p.user_id]}'s picks`}
                    </span>
                    <span style={{ fontSize: 12, color: '#888' }}>({(p.meal_ids || []).length} meals)</span>
                  </div>
                  <div className="meal-grid">
                    {(p.meal_ids || []).map(id => {
                      const r = weeklyMenu.find(x => x.id === id)
                      if (!r) return null
                      return (
                        <MealCard key={r.id} recipe={r} isSelected={p.user_id === user.id && myPicksSet.has(r.id)} pickedBy={pickerMap[r.id] || []} memberNames={memberNames} onToggle={togglePick} />
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Grocery Tab ── */}
      {tab === 'grocery' && (
        <div className="page">
          <div className="page-title">Grocery list</div>
          <div className="page-sub">Based on all household picks — shared ingredients combined</div>
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
                      <div key={it.id} className={`grocery-row${it.checked ? ' done' : ''}`}>
                        <input type="checkbox" checked={it.checked} onChange={() => setGroceryItems(prev => prev.map(x => x.id === it.id ? { ...x, checked: !x.checked } : x))} />
                        <span className="g-name">{it.name}</span>
                        {it.shared && <span className="shared-dot" />}
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
            <div key={it.key} className={`upload-item ${it.status === 'done' ? 'done' : it.status === 'err' ? 'err' : ''}`}>
              {it.status === 'loading' && <div className="spinner" style={{ borderTopColor: '#3c6e47', borderColor: '#c0dd97' }} />}
              {it.status === 'done' && <span>✓</span>}
              {it.status === 'err' && <span>✕</span>}
              <div style={{ flex: 1 }}>
                {it.status === 'loading' && <div>{it.msg || `Reading "${it.name}"...`}</div>}
                {it.status === 'done' && (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      Found {it.count} recipe{it.count !== 1 ? 's' : ''} in "{it.name}"
                    </div>
                    {it.names && (
                      <div style={{ fontSize: 11, opacity: 0.8 }}>
                        {it.names.join(' · ')}
                      </div>
                    )}
                  </>
                )}
                {it.status === 'err' && <div>Failed to read "{it.name}" — {it.msg}</div>}
              </div>
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
          <div className="page-title">Account</div>
          <div className="page-sub">Your household details</div>

          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '16px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>Your household</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{household?.name || 'My Household'}</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Invite code: <span style={{ fontWeight: 700, letterSpacing: 3, color: '#3c6e47' }}>{household?.invite_code}</span></div>
            <div style={{ fontSize: 12, color: '#888' }}>Share this code with your partner to join this household</div>
          </div>

          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Members</div>
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
        </div>
      )}
    </div>
  )
}
