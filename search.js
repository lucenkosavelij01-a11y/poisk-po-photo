// api/search.js
// Серверная функция для Vercel / Node 18+
// Требуется переменная среды VISION_API_KEY с ключом Google Cloud Vision API

const fs = require('fs');
const path = require('path');

// Простые CORS заголовки
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Нормализация текста для сопоставления
function normalize(str = '') {
  return String(str)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Разбиение в токены
function toTokens(str = '') {
  return normalize(str).split(' ').filter(Boolean);
}

// Небольшая карта синонимов англ → рус для лучшего матчинга
const SYN = {
  't shirt': ['футболка', 'майка', 'тшорт', 'т-шорт'],
  'tshirt': ['футболка', 'майка'],
  'shirt': ['рубашка', 'сорочка', 'шорт не одежда'],
  'sneaker': ['кроссовки', 'кеды'],
  'sneakers': ['кроссовки', 'кеды'],
  'shoe': ['обувь', 'ботинки', 'туфли', 'кроссовки'],
  'shoes': ['обувь', 'ботинки', 'туфли', 'кроссовки'],
  'dress': ['платье'],
  'jeans': ['джинсы'],
  'bag': ['сумка', 'рюкзак'],
  'backpack': ['рюкзак'],
  'watch': ['часы'],
  'jacket': ['куртка', 'пиджак'],
  'coat': ['пальто'],
  'hoodie': ['худи', 'толстовка'],
  'sweatshirt': ['свитшот', 'толстовка'],
  'skirt': ['юбка'],
  'pants': ['штаны', 'брюки'],
  'trousers': ['брюки'],
  'shorts': ['шорты'],
  'hat': ['шапка', 'шляпа'],
  'cap': ['кепка', 'бейсболка'],
  'glasses': ['очки'],
  'red': ['красный'],
  'black': ['черный', 'чёрный'],
  'white': ['белый'],
  'blue': ['синий', 'голубой'],
  'green': ['зеленый', 'зелёный'],
  'cotton': ['хлопок', 'хлопчатобумажный'],
};

// Формируем список терминов для каждого лейбла
function termsForLabel(label) {
  const base = normalize(label).replace(/-/g, ' ');
  const tokens = base.split(' ').filter(Boolean);

  const terms = new Set();
  if (base) terms.add(base);
  tokens.forEach(t => terms.add(t));

  // Синонимы для базы и токенов
  const addSyn = (key) => {
    const s = SYN[key];
    if (s && s.length) s.forEach(x => terms.add(normalize(x)));
  };
  addSyn(base);
  tokens.forEach(addSyn);

  return Array.from(terms);
}

// Подсчет релевантности товара на основе лейблов
function scoreProduct(product, labelObjs) {
  const text = normalize(
    `${product.title || ''} ${product.description || ''} ${(product.tags || []).join(' ')}`
  );

  const tokens = new Set(toTokens(text));
  const tagTokens = new Set(
    (product.tags || []).flatMap(t => toTokens(t))
  );

  let score = 0;
  const matched = [];

  for (const lab of labelObjs) {
    const terms = termsForLabel(lab.description);
    let matchedThisLabel = false;

    for (const term of terms) {
      const isPhrase = term.includes(' ');
      const inText = isPhrase ? text.includes(term) : tokens.has(term);

      if (inText) {
        // Базовый вклад веса лейбла
        let add = lab.score || 0.5;

        // Бонус если термин совпадает с тегом
        if (!isPhrase && tagTokens.has(term)) add += 0.2;

        score += add;
        matchedThisLabel = true;
      }
    }

    if (matchedThisLabel) {
      matched.push({
        label: lab.description,
        weight: lab.score,
      });
    }
  }

  return { score, matched };
}

module.exports = async (req, res) => {
  try {
    setCors(res);
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Читаем тело запроса
    const body = req.body || (await new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        try {
          resolve(JSON.parse(data || '{}'));
        } catch (e) {
          resolve({});
        }
      });
    }));

    if (!body || !body.image) {
            return res.status(400).json({ error: 'No image provided' });
    }

    // Получаем base64 из data URL или чистого base64
    const dataUrl = String(body.image);
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

    const apiKey =
      process.env.VISION_API_KEY ||
      process.env.GOOGLE_VISION_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing Vision API key. Set env VISION_API_KEY in Vercel project settings',
      });
    }

    // Загружаем каталог товаров
    const productsPath = path.join(__dirname, '..', 'products.json'); // при другой структуре поправьте путь
    const productsRaw = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(productsRaw);

    // Запрос к Google Vision API
    const visionResp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: 'LABEL_DETECTION', maxResults: 20 }],
            },
          ],
        }),
      }
    );

    if (!visionResp.ok) {
      const text = await visionResp.text().catch(() => '');
      return res.status(502).json({
        error: 'Vision API request failed',
        details: text,
      });
    }

    const visionData = await visionResp.json();
    const anns =
      visionData?.responses?.[0]?.labelAnnotations &&
      Array.isArray(visionData.responses[0].labelAnnotations)
        ? visionData.responses[0].labelAnnotations
        : [];

    const labels = anns.map((a) => ({
      description: a.description,
      score: a.score,
      topicality: a.topicality,
    }));

    // Матчинг товаров
    const scored = products.map((p) => {
      const { score, matched } = scoreProduct(p, labels);
      return { ...p, score, matched };
    });

    // Сортируем по релевантности и отдаем топ N
    const limit = Number(body.limit) > 0 ? Math.min(Number(body.limit), 50) : 10;
    scored.sort((a, b) => b.score - a.score);
    const result = scored
      .filter((p) => p.score > 0)
      .slice(0, limit);

    return res.status(200).json({
      ok: true,
      labels,
      count: result.length,
      products: result,
    });
  } catch (err) {
    console.error('search error', err);
    return res.status(500).json({
      error: 'Server error',
      details: err?.message || String(err),
    });
  }
};
