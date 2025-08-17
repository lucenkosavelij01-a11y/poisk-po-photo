# API search

Serverless функция для Next.js или Vercel

## Эндпоинты
- GET /api/search проверка работы
- POST /api/search тело запроса JSON
  {
    "image": "https://example.com/pic.jpg или data:image/png;base64,...",
    "q": "необязательно"
  }

## Примеры
curl https://localhost:3000/api/search

curl -X POST https://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"image":"https://example.com/pic.jpg","q":"cat"}'

curl -X POST https://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"image":"data:image/png;base64,...."}'

## Запуск локально
- npm install
- npm run dev
- открой http://localhost:3000/api/search
