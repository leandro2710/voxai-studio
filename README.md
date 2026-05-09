# VoxAI Studio

Plataforma Neural de Síntese de Voz.

## Estrutura

```
voxai-studio/     → App frontend (React + Vite)
voxai-api/        → API de voz (Python + Piper TTS)
```

## Como rodar o frontend

```bash
npm install
npm run dev
```

## Como fazer build para APK

```bash
npm run build
npx cap add android
npx cap sync
npx cap open android
```

## VoxAI API

A API roda em: https://voxai-api.onrender.com

Endpoints:
- GET  /health      → Status da API
- GET  /voices      → Lista de vozes
- POST /synthesize  → Gerar áudio

## Deploy da API

1. Suba a pasta `voxai-api/` no GitHub
2. Conecte ao Render.com
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
