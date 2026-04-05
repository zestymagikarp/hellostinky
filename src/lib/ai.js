export async function callClaude(messages, system, maxTokens = 2000) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content?.map(b => b.text || '').join('') || ''
}

export function parseJSON(raw) {
  let cleaned = raw.replace(/```json|```/g, '').trim()
  // Find the outermost [ ... ] array
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1)
  return JSON.parse(cleaned)
}

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
    const pool = recipes.map(r =>
      `ID:${r.id}|${r.name}|ingredients:${(r.ingredients || []).map(i => i.item).join(',')}`
    ).join('\n')
    prompt = `It is ${month}. I have these recipes:\n${pool}\n\nSelect 12-15 recipes for this week's menu. Prioritize: (1) seasonal ingredients for ${month}, (2) maximum ingredient overlap to minimize grocery waste${prefStr ? ', (3) household preferences: ' + prefStr : ''}. For each recipe, add/update "seasonal" (short note or null) and estimate "calories" per serving if missing. Return ONLY a JSON array using the original recipe IDs plus updated fields. Keep all original recipe data.`
    system = 'You are a seasonal meal planning optimizer. Return only a valid JSON array. No markdown, no explanation.'
  } else {
    prompt = `It is ${month}. Generate 12 diverse seasonal meal recipes with maximum ingredient overlap to minimize grocery shopping.${prefStr ? ' Household preferences: ' + prefStr + '.' : ''} Return a JSON array where each object has exactly these fields: name (string), subtitle (string), time (integer minutes), servings (integer, use 4), calories (integer per serving), price (float 9-12), badge (calorie or quick or gourmet or taste or empty string), tags (array of strings), ingredients (array of objects with item and amount fields), seasonal (string or null). Include 2 vegetarian options. Return ONLY the JSON array, nothing else.`
    system = 'You are a seasonal recipe generator. Return only a valid JSON array. No markdown, no explanation.'
  }

  const raw = await callClaude([{ role: 'user', content: prompt }], system, 6000)
  return parseJSON(raw)
}

export async function generateGroceryList(meals) {
  const details = meals.map(r =>
    `${r.name}: ${(r.ingredients || []).map(i => `${i.item} ${i.amount}`).join(', ')}`
  ).join('\n')

  const raw = await callClaude(
    [{ role: 'user', content: `Selected meals:\n${details}\n\nCreate an optimized grocery list. Combine duplicates, scale amounts. Return ONLY valid JSON: [{"name":"item","amount":"combined qty","category":"Produce|Meat & Seafood|Dairy|Pantry|Bakery|Frozen|Other","shared":true/false}]` }],
    'You are a grocery optimizer. Return only a JSON array. No markdown.'
  )
  return parseJSON(raw)
}

export async function extractRecipesFromPDF(base64Data) {
  const raw = await callClaude(
    [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
        { type: 'text', text: 'Find EVERY recipe in this document and extract them all without skipping any. For each recipe return a JSON object with: name, subtitle (one-line description), time (int, total minutes), servings (int, default 4), calories (int per serving, estimate if needed), price (float, estimated USD per serving 8-14), badge (calorie|quick|gourmet|taste or empty string), tags (array from: chicken,beef,pork,fish,vegetarian,vegan,pasta,healthy,quick,family,spicy), ingredients (array of {item, amount}), seasonal (short note or null). Return ONLY a raw JSON array starting with [ and ending with ] — no markdown, no backticks, no explanation whatsoever.' }
      ]
    }],
    'You are a recipe extraction assistant. Return only a raw valid JSON array of all recipes found. No markdown, no backticks, no text outside the JSON array itself.',
    4000
  )
  // Robustly extract the JSON array even if there is stray text
  let cleaned = raw.trim()
  const startIdx = cleaned.indexOf('[')
  const endIdx = cleaned.lastIndexOf(']')
  if (startIdx !== -1 && endIdx !== -1) cleaned = cleaned.slice(startIdx, endIdx + 1)
  return JSON.parse(cleaned)
}

export async function extractRecipesFromImages(pages, onProgress) {
  // Send 1 page at a time for scanned PDFs — keeps payload small and reliable
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
              text: `This is page ${i + 1} of ${pages[0].totalPages} from a recipe book or cookbook. Extract any complete or partial recipes visible. For each recipe return a JSON object with: name, subtitle (one-line description), time (int, total minutes), servings (int, default 4), calories (int per serving, estimate if needed), price (float, estimated USD per serving 8-14), badge (calorie|quick|gourmet|taste or empty string), tags (array from: chicken,beef,pork,fish,vegetarian,vegan,pasta,healthy,quick,family,spicy), ingredients (array of {item, amount}), seasonal (short note or null). If no recipe content is visible return []. Return ONLY a raw JSON array.`
            }
          ]
        }],
        'You are a recipe extraction assistant reading scanned cookbook pages. Return only a raw valid JSON array. No markdown, no backticks.',
        3000
      )
      let cleaned = raw.trim()
      const s = cleaned.indexOf('['), e = cleaned.lastIndexOf(']')
      if (s !== -1 && e !== -1) cleaned = cleaned.slice(s, e + 1)
      const found = JSON.parse(cleaned)
      if (Array.isArray(found)) allRecipes = [...allRecipes, ...found]
    } catch (err) {
      console.warn(`Batch ${i}–${i + BATCH} failed:`, err.message)
    }
  }
  return allRecipes
}

export async function generateRecipeInstructions(recipe) {
  const ingredients = (recipe.ingredients || []).map(i => `${i.item}: ${i.amount}`).join('\n')
  const raw = await callClaude(
    [{ role: 'user', content: `Recipe: ${recipe.name}\nSubtitle: ${recipe.subtitle || ''}\nIngredients:\n${ingredients}\n\nGenerate clear step-by-step cooking instructions for this recipe. Return ONLY a JSON object with this exact shape: {"steps": [{"number": 1, "title": "Short title", "instruction": "Full instruction text", "duration": "5 mins"}], "tips": ["tip1", "tip2"], "storage": "How to store leftovers"}` }],
    'You are a professional chef writing clear home cooking instructions. Return only a valid JSON object. No markdown, no backticks.',
    2000
  )
  let cleaned = raw.trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1)
  return JSON.parse(cleaned)
}

export async function suggestProteinSwaps(recipe) {
  const ingredients = (recipe.ingredients || []).map(i => `${i.item}: ${i.amount}`).join('\n')
  const raw = await callClaude(
    [{ role: 'user', content: `Recipe: ${recipe.name}\nIngredients:\n${ingredients}\n\nIdentify the main protein(s) in this recipe and suggest 3-4 alternative proteins that would work well as substitutes. For each alternative, calculate the approximate calorie difference per serving compared to the original (positive means more calories, negative means fewer). Return ONLY a JSON object: {"original_protein": "ground beef", "alternatives": [{"name": "ground turkey", "calories_diff": -45, "notes": "leaner, milder flavour"}, ...]}. If no clear protein found return {"original_protein": null, "alternatives": []}` }],
    'You are a nutrition expert. Return only valid JSON. No markdown.',
    800
  )
  let cleaned = raw.trim()
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}')
  if (s !== -1 && e !== -1) cleaned = cleaned.slice(s, e + 1)
  return JSON.parse(cleaned)
}

export async function extractRecipesFromText(text, onProgress) {
  // Split text by recipe boundaries — look for page markers or recipe titles
  // This is much more efficient than fixed-size chunks
  const CHUNK_SIZE = 4000
  const chunks = []

  // Skip obvious non-recipe content (table of contents, intro pages)
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

  // Fallback: if no recipe keywords found, just chunk everything
  if (chunks.length === 0) {
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE))
    }
  }

  let allRecipes = []
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]
    if (chunk.trim().length < 100) { onProgress && onProgress(ci + 1, chunks.length); continue }
    onProgress && onProgress(ci + 1, chunks.length)
    try {
      const raw = await callClaude(
        [{ role: 'user', content: `Extract all complete recipes from this text. Only extract recipes that have both ingredients AND instructions. For each recipe return a JSON object with: name, subtitle (one-line description), time (int, total minutes), servings (int, default 4), calories (int per serving — use the value stated if present), price (float, estimated USD per serving 8-14), badge (calorie|quick|gourmet|taste or empty string), tags (array from: chicken,beef,pork,fish,vegetarian,vegan,pasta,healthy,quick,family,spicy), ingredients (array of {item, amount}), seasonal (short note or null). If no complete recipes found return []. Return ONLY a raw JSON array.\n\nText:\n${chunk}` }],
        'You are a recipe extraction assistant. Return only a raw valid JSON array. No markdown, no backticks.',
        2000
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

  // Deduplicate by recipe name
  const seen = new Set()
  return allRecipes.filter(r => {
    if (!r.name || seen.has(r.name.toLowerCase())) return false
    seen.add(r.name.toLowerCase())
    return true
  })
}
