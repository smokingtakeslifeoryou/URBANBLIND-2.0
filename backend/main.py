from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="UrbanBlind Core API",
    version="0.1.0"
)

# Настройка CORS: прозрачный доступ для Next.js фронтенда
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    """Тестовый эндпоинт доступности сервера"""
    return {
        "status": "ok",
        "engine": "UrbanBlind Core",
        "version": "0.1.0"
    }
