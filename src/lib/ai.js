const API_URL = 'https://api.anthropic.com/v1/messages'

async function callClaude(messages, system = '', maxTokens = 1000) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system, messages })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err)
  }
  const data = await res.json()
  return data.content.map(b => b.text || '').join('')
}

function parseJSON(raw) {
  let cleaned = raw.trim()
  // Strip markdown code fences if present
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  const s = cleaned.indexOf('['), e = cleaned.lastIndexOf(']')
  if (s !== -1 && e !== -1) return JSON.parse(cleaned.slice(s, e + 1))
  const s2 = cleaned.indexOf('{'), e2 = cleaned.lastIndexOf('}')
  if (s2 !== -1 && e2 !== -1) return JSON.parse(cleaned.slice(s2, e2 + 1))
  throw new Error('No JSON found in response')
}

// ── Weekly menu ──────────────────────────────────────────────
// AI's ONLY job here: select which saved recipes to show + add seasonal notes.
// All real recipe data (ingredients, instructions) comes from the saved recipes DB.
export async function generateWeeklyMenu(recipes, preferences = {}) {
  const month = new Date().toLocaleString('en-US', { month: 'long' })
  const prefStr = [
    preferences.dietary?.length ? `Dietary: ${preferences.dietary.join(', ')}` : '',
    preferences.allergies?.length ? `Allergies/avoid: ${preferences.allergies.join(', ')}` : '',
    preferences.cuisine_likes?.length ? `Preferred cuisines: ${preferences.cuisine_likes.join(', ')}` : '',
    preferences.cuisine_dislikes?.length ? `Avoid these cuisines: ${preferences.cuisine_dislikes.join(', ')}` : '',
  ].filter(Boolean).join('. ')

  let prompt, system

  if (recipes.length > 0) {
    // Just pass names + IDs — don't need to send full ingredient lists
    const pool = recipes.map(r => `ID:${r.id}|${r.name}`).join('\n')
    prompt = `It is ${month}. I have these saved recipes:\n${pool}\n\nSelect 12-15 recipes for this week's menu. Prioritize: (1) variety, (2) seasonal relevance for ${month}${prefStr ? ', (3) household preferences: ' + prefStr : ''}.\n\nReturn ONLY a JSON array. Each object must have:\n- id: the original recipe ID (copy exactly as shown)\n- seasonal: a short seasonal note string or null\n\nDo NOT change any other fields. Return ONLY the JSON array.`
    system = 'You are a meal planning assistant. Return only a valid JSON array of {id, seasonal} objects. No other fields. No markdown.'
  } else {
    // No saved recipes — generate from scratch (new user)
    prompt = `It is ${month}. Generate 12 diverse seasonal meal recipes.${prefStr ? ' Household preferences: ' + prefStr + '.' : ''} Return a JSON array where each object has: name, subtitle, time (int minutes), servings (int, default 4), calories (int per serving), price (float 9-12), badge (calorie|quick|gourmet|taste or empty string), tags (array), ingredients (array of {item, amount}), instructions (array of step strings — the actual cooking steps), seasonal (string or null). Include 2 vegetarian options. Return ONLY the JSON array.`
    system = 'You are a seasonal recipe generator. Return only a valid JSON array. No markdown.'
  }

  const raw = await callClaude([{ role: 'user', content: prompt }], system, 4000)
  return parseJSON(raw)
}

// ── Grocery list ─────────────────────────────────────────────
export async function generateGroceryList(meals, householdSize = 2) {
  const details = meals.map(r => {
    let ings = r.ingredients || []
    if (typeof ings === 'string') { try { ings = JSON.parse(ings) } catch { ings = [] } }
    if (!Array.isArray(ings)) ings = []
    // r.servings has already been set to the user's chosen serving size by the caller
    const targetServings = r.servings || 4
    const baseServings = r._baseServings || targetServings // original recipe serving count
    return `${r.name} (recipe base: ${baseServings} servings, USE ${targetServings} servings):\n${ings.map(i => `  - ${i.item}: ${i.amount}`).join('\n')}`
  }).join('\n\n')

  const raw = await callClaude(
    [{ role: 'user', content: `I am cooking for ${householdSize} people. Here are the selected meals with their ingredients:\n\n${details}\n\nCreate an optimized grocery list. Rules:\n1. Each recipe shows its base serving count and the target serving count to USE. Scale ingredient amounts from base to target (e.g. if base is 2 servings and target is 6, multiply all amounts by 3).\n2. After scaling, combine the same ingredient across multiple recipes by adding the scaled amounts together. For example if recipe A needs 0.75 avocado and recipe B needs 0.5 avocado after scaling, that's 1.25 avocados total → round up to 2 avocados.\n3. Convert all final amounts to practical grocery store units — never use grams or millilitres. Use real store sizes:\n   - Meat/fish: count or lbs (e.g. "2 chicken breasts (~1.5 lb)", "1 lb ground beef", "4 salmon fillets")\n   - Produce: count or bunch, always round UP to whole units (e.g. "2 avocados", "1 bunch cilantro", "1 head garlic")\n   - Canned goods: include the real can/jar size in oz that you'd find at the store, e.g. "1 can (10oz) red enchilada sauce", "2 cans (15oz each) black beans", "1 can (28oz) crushed tomatoes", "1 jar (16oz) salsa". Common sizes: enchilada sauce 10oz or 19oz, black beans 15oz, diced tomatoes 14.5oz, tomato sauce 8oz or 15oz, coconut milk 13.5oz, chicken broth 14.5oz\n   - Condiments/sauces in bottles: "1 bottle hot sauce", "1 bottle (12oz) BBQ sauce"\n   - Dairy: practical container size (e.g. "1 container (16oz) Greek yogurt", "1 bag (8oz) shredded cheddar", "1 block (8oz) cream cheese")\n   - Spices used in small amounts (under 2 tsp total): "to taste"\n   - Bread/buns: whole count (e.g. "4 brioche buns", "1 loaf sourdough")\n   - Eggs: "X eggs"\n4. Mark shared:true if the ingredient appears in 2 or more recipes\n5. Return ONLY valid JSON: [{"name":"item","amount":"store-friendly qty with size","category":"Produce|Meat & Seafood|Dairy|Pantry|Bakery|Frozen|Other","shared":true/false}]` }],
    'You are a grocery list expert. Scale recipe amounts to the household size, combine shared ingredients correctly, and output practical store-friendly quantities. Return only a JSON array. No markdown.',
    2000
  )
  return parseJSON(raw)
}

// ── PDF extraction (text-based PDFs) ────────────────────────
// Extracts ingredients AND instructions directly from PDF text.
// AI must not invent anything — only extract what is literally in the text.
export async function extractRecipesFromText(text, onProgress) {
  const CHUNK_SIZE = 4000
  const chunks = []

  const recipeKeywords = ['ingredients', 'instructions', 'calories', 'protein', 'carbs', 'per serving', 'per sandwich', 'per burger']
  const lines = text.split('\n')
  let buffer = ''
  let inRecipe = false

  for (const line of lines) {
    const lower = line.toLowerCase()
    if (recipeKeywords.some(k => lower.includes(k))) inRecipe = true
    if (inRecipe) {
      buffer += line + '\n'
      if (buffer.length >= CHUNK_SIZE) {
        chunks.push(buffer)
        buffer = ''
      }
    }
  }
  if (buffer.trim().length > 100) chunks.push(buffer)
  if (chunks.length === 0) {
    for (let i = 0; i < text.length; i += CHUNK_SIZE) chunks.push(text.slice(i, i + CHUNK_SIZE))
  }

  let allRecipes = []
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]
    if (chunk.trim().length < 100) { onProgress && onProgress(ci + 1, chunks.length); continue }
    onProgress && onProgress(ci + 1, chunks.length)
    try {
      const raw = await callClaude(
        [{ role: 'user', content: `Extract all complete recipes from this text. IMPORTANT: only extract information that is literally present in the text — do NOT invent or guess any ingredients or instructions. If a field is not in the text, omit it or use null.\n\nFor each recipe return a JSON object with:\n- name: recipe name as written\n- subtitle: one-line description if present, else null\n- time: total minutes if stated, else null\n- servings: number of servings if stated, else 4\n- calories: calories per serving if stated (look for "X Calories" or "per serving"), else null\n- price: estimated USD per serving (8-14), or null\n- badge: one of calorie|quick|gourmet|taste if clearly applicable, else empty string\n- tags: array from [chicken,beef,pork,fish,vegetarian,vegan,pasta,healthy,quick,family,spicy] based on ingredients present\n- ingredients: array of {item, amount} — ONLY ingredients explicitly listed in the text\n- instructions: array of step strings — ONLY steps explicitly written in the text. Copy them faithfully.\n- seasonal: null\n\nIf no complete recipes found, return []. Return ONLY a raw JSON array.\n\nText:\n${chunk}` }],
        'You are a recipe extraction assistant. Extract ONLY what is in the text. Never invent ingredients or instructions. Return only a raw valid JSON array.',
        3000
      )
      let cleaned = raw.trim()
      const s = cleaned.indexOf('['), e = cleaned.lastIndexOf(']')
      if (s !== -1 && e !== -1) cleaned = cleaned.slice(s, e + 1)
      const found = JSON.parse(cleaned)
      if (Array.isArray(found)) allRecipes = [...allRecipes, ...found]
    } catch (e) {
      console.warn('Chunk extraction failed:', e.message)
    }
  }

  // Deduplicate by name
  const seen = new Set()
  return allRecipes.filter(r => {
    if (!r.name || seen.has(r.name.toLowerCase())) return false
    seen.add(r.name.toLowerCase())
    return true
  })
}

// ── PDF extraction (scanned image PDFs) ─────────────────────
// Same principle: extract only what's visible on the page.
export async function extractRecipesFromImages(pages, onProgress) {
  const BATCH = 1
  let allRecipes = []

  for (let i = 0; i < pages.length; i += BATCH) {
    const batch = pages.slice(i, i + BATCH)
    onProgress && onProgress(i + batch.length, pages.length)

    const imageContent = batch.map(p => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: p.b64 }
    }))

    try {
      const raw = await callClaude(
        [{
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text: `This is page ${i + 1} of ${pages[0].totalPages} from a recipe book. Extract any complete or partial recipes visible on this page.\n\nIMPORTANT: only extract what you can actually read on this page — do NOT invent or guess any ingredients or instructions.\n\nFor each recipe return a JSON object with:\n- name: recipe name as printed\n- subtitle: one-line description if visible, else null\n- time: total minutes if stated, else null\n- servings: servings if stated, else 4\n- calories: calories per serving if stated (look for calorie counts in boxes/headers), else null\n- price: null\n- badge: empty string\n- tags: array from [chicken,beef,pork,fish,vegetarian,vegan,pasta,healthy,quick,family,spicy]\n- ingredients: array of {item, amount} — ONLY what is printed on this page\n- instructions: array of step strings — ONLY steps printed on this page, copied faithfully\n- seasonal: null\n\nIf no recipe content is visible return []. Return ONLY a raw JSON array.`
            }
          ]
        }],
        'You are a recipe extraction assistant reading cookbook pages. Extract ONLY what is printed. Never invent ingredients or instructions. Return only a raw valid JSON array.',
        3000
      )
      let cleaned = raw.trim()
      const s = cleaned.indexOf('['), e = cleaned.lastIndexOf(']')
      if (s !== -1 && e !== -1) cleaned = cleaned.slice(s, e + 1)
      const found = JSON.parse(cleaned)
      if (Array.isArray(found)) allRecipes = [...allRecipes, ...found]
    } catch (err) {
      console.warn(`Page ${i + 1} failed:`, err.message)
    }
  }
  return allRecipes
}

// ── Instructions for recipe drawer ──────────────────────────
// Uses the stored instructions if available, only generates if truly missing.
export async function generateRecipeInstructions(recipe) {
  // If the recipe has stored instructions, format and return them directly
  let stored = recipe.instructions
  if (typeof stored === 'string') { try { stored = JSON.parse(stored) } catch { stored = null } }

  if (Array.isArray(stored) && stored.length > 0) {
    // Convert stored instruction steps to the drawer's expected format
    return {
      steps: stored.map((step, i) => {
        if (typeof step === 'string') {
          return { number: i + 1, title: `Step ${i + 1}`, instruction: step, duration: null }
        }
        return { number: i + 1, title: step.title || `Step ${i + 1}`, instruction: step.instruction || step.text || String(step), duration: step.duration || null }
      }),
      tips: [],
      storage: null
    }
  }

  // Only reach here if no stored instructions — generate from ingredients as a last resort
  let ings = recipe.ingredients || []
  if (typeof ings === 'string') { try { ings = JSON.parse(ings) } catch { ings = [] } }
  if (!Array.isArray(ings)) ings = []

  if (ings.length === 0) throw new Error('No ingredients available to generate instructions.')

  const ingStr = ings.map(i => `${i.item}: ${i.amount}`).join('\n')
  const raw = await callClaude(
    [{ role: 'user', content: `Recipe: ${recipe.name}\nSubtitle: ${recipe.subtitle || ''}\nIngredients:\n${ingStr}\n\nGenerate clear step-by-step cooking instructions. Return ONLY a JSON object: {"steps": [{"number": 1, "title": "Short title", "instruction": "Full step", "duration": "5 mins"}], "tips": ["tip1"], "storage": "storage note"}` }],
    'You are a professional chef. Return only valid JSON. No markdown.',
    2000
  )
  let cleaned = raw.trim()
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}')
  if (s !== -1 && e !== -1) cleaned = cleaned.slice(s, e + 1)
  return JSON.parse(cleaned)
}

// ── Protein swaps ────────────────────────────────────────────
export async function suggestProteinSwaps(recipe) {
  let ings = recipe.ingredients || []
  if (typeof ings === 'string') { try { ings = JSON.parse(ings) } catch { ings = [] } }
  if (!Array.isArray(ings)) ings = []
  const ingStr = ings.map(i => `${i.item}: ${i.amount}`).join('\n')
  const raw = await callClaude(
    [{ role: 'user', content: `Recipe: ${recipe.name}\nIngredients:\n${ingStr}\n\nIdentify the main protein and suggest 3-4 alternatives. Return ONLY a JSON object: {"original_protein": "chicken breast", "alternatives": [{"name": "turkey breast", "calories_diff": -20, "notes": "leaner, similar texture"}]}. If no clear protein return {"original_protein": null, "alternatives": []}` }],
    'You are a nutrition expert. Return only valid JSON. No markdown.',
    800
  )
  let cleaned = raw.trim()
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}')
  if (s !== -1 && e !== -1) cleaned = cleaned.slice(s, e + 1)
  return JSON.parse(cleaned)
}

// ── HomeChef nutrition fetcher ────────────────────────────────
export async function fetchHomeChefNutrition(url) {
  try {
    let fetchUrl = url.trim()
    if (!fetchUrl.startsWith('http')) fetchUrl = 'https://' + fetchUrl
    fetchUrl = fetchUrl.replace('www.homechef.com', 'homechef.com')
    if (!fetchUrl.includes('homechef.com')) return null
    const res = await fetch(`/api/fetch-url?url=${encodeURIComponent(fetchUrl)}`)
    if (!res.ok) return null
    const html = await res.text()
    const nutrition = {}
    const calMatch = html.match(/Calories[^<]*<[^>]*>\s*<strong>([\d,]+)<\/strong>/i) || html.match(/"calories"[^>]*>([\d,]+)/i)
    if (calMatch) nutrition.calories = parseInt(calMatch[1].replace(',', ''))
    const protMatch = html.match(/Protein[\s\S]{0,80}?<strong>([\d.]+)g?<\/strong>/i) || html.match(/"protein"[^>]*>([\d.]+)/i)
    if (protMatch) nutrition.protein = parseFloat(protMatch[1])
    const carbMatch = html.match(/Carbohydrates[\s\S]{0,80}?<strong>([\d.]+)g?<\/strong>/i) || html.match(/"carbohydrateContent"[^>]*>([\d.]+)/i)
    if (carbMatch) nutrition.carbs = parseFloat(carbMatch[1])
    return Object.keys(nutrition).length > 0 ? nutrition : null
  } catch { return null }
}

// ── fetchRecipeDetails — ONLY used for AI-generated meals with no saved data ──
// Never used for PDF-uploaded recipes.
export async function fetchRecipeDetails(recipe) {
  const raw = await callClaude(
    [{ role: 'user', content: `Generate complete recipe details for: "${recipe.name}"${recipe.subtitle ? ' (' + recipe.subtitle + ')' : ''}.\nReturn ONLY a JSON object with:\n- ingredients: array of {item, amount}\n- instructions: array of step strings\n- time: integer minutes\n- servings: integer (default 4)\n- calories: integer per serving\nReturn ONLY the JSON object, no markdown.` }],
    'You are a recipe details generator. Return only a valid JSON object. No markdown.',
    1500
  )
  let cleaned = raw.trim()
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}')
  if (s !== -1 && e !== -1) cleaned = cleaned.slice(s, e + 1)
  return JSON.parse(cleaned)
}

// ── HomeChef URL extractor ────────────────────────────────────
// Finds homechef.com recipe URLs embedded in PDF text
export function extractHomeChefUrls(text) {
  const matches = text.match(/https?:\/\/(?:www\.)?homechef\.com\/[^\s"')>]+/gi) || []
  // Deduplicate
  return [...new Set(matches)]
}
