export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url param required' })

  // Only allow homechef.com URLs for security
  if (!url.includes('homechef.com')) {
    return res.status(403).json({ error: 'Only homechef.com URLs are allowed' })
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; recipe-parser/1.0)' }
    })
    const html = await response.text()
    res.status(200).send(html)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
