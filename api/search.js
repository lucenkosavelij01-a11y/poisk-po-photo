// /api/search.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  // Базовый URL текущего деплоя
  const proto = String(req.headers['x-forwarded-proto'] || 'http')
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  const base = `${proto}://${host}`

  // Файл лежит в /public/products.json и доступен по пути /products.json
  const JSON_PATH = '/products.json'

  try {
    const r = await fetch(`${base}${JSON_PATH}`, { cache: 'no-store' })
    if (!r.ok) {
      return res
        .status(502)
        .json({ ok: false, error: `Failed to load ${JSON_PATH}: ${r.status}` })
    }

    const products = await r.json()

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      count: Array.isArray(products)
        ? products.length
        : (products?.items?.length ?? 0),
      products
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ ok: false, error: msg })
  }
}
