"use client";

import { useEffect, useRef, useState } from 'react';

interface CameraScannerProps {
  onClose?: () => void;
  userLocation?: [number, number]; // [longitude, latitude]
  onHazardDetected?: () => void;   // коллбэк для обновления карты
}

export function CameraScanner({ onClose, userLocation, onHazardDetected }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Фикс stale closure: храним userLocation в ref
  const userLocationRef = useRef<[number, number] | undefined>(userLocation);

  const [status, setStatus] = useState<'loading' | 'active' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastAlert, setLastAlert] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Синхронизируем ref при каждом изменении userLocation
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // Захват кадра и отправка на анализ
  const captureAndAnalyze = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const image_base64 = canvas.toDataURL('image/jpeg', 0.5);

    // Собираем тело запроса с координатами через REF (фикс stale closure)
    const currentLocation = userLocationRef.current;
    const body: Record<string, any> = { image_base64 };
    if (currentLocation) {
      body.lon = currentLocation[0];
      body.lat = currentLocation[1];
      console.log(`📍 Отправка кадра с координатами:`, body.lon, body.lat);
    } else {
      console.warn('⚠️ Нет координат пользователя, фронтенд не передаёт координаты');
    }

    try {
      const response = await fetch('http://localhost:8000/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.hazard_detected && result.message) {
          setLastAlert(result.message);
          // Уведомляем BaseMap обновить сетевые данные (без голоса!)
          if (onHazardDetected) onHazardDetected();
        }
      }
    } catch (err) {
      console.error("Ошибка анализа кадра:", err);
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        setStatus('active');

        // Анализ каждые 60 секунд (стабильно)
        intervalRef.current = setInterval(captureAndAnalyze, 60000);

      } catch (err: any) {
        setStatus('error');
        if (err.name === 'NotAllowedError') {
          setErrorMessage('Доступ к камере запрещён');
        } else if (err.name === 'NotFoundError') {
          setErrorMessage('Камера не найдена');
        } else {
          setErrorMessage('Неизвестная ошибка');
        }
      }
    };

    startCamera();

    // Cleanup: останавливаем камеру и интервал
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="absolute bottom-6 right-6 z-30 pointer-events-auto">
      {/* Скрытый canvas для захвата кадров */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div
        className="relative bg-black/70 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl overflow-hidden"
        style={{ width: '240px' }}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              status === 'active'  ? 'bg-emerald-400 animate-pulse' :
              status === 'loading' ? 'bg-amber-400 animate-pulse'   :
                                     'bg-red-400'
            }`}></span>
            <span className="text-xs font-bold tracking-wider uppercase text-white/80">
              {status === 'active'  ? 'AI-Зрение ON'     :
               status === 'loading' ? 'Инициализация...' :
                                      'Ошибка'}
            </span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white/90 transition-colors text-sm font-bold leading-none"
              aria-label="Закрыть камеру"
            >
              ✕
            </button>
          )}
        </div>

        {/* Видео или ошибка */}
        {status !== 'error' ? (
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full"
              style={{ height: '135px', objectFit: 'cover', display: 'block' }}
            />
            {status === 'active' && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-emerald-400 rounded-tl-sm"></div>
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-emerald-400 rounded-tr-sm"></div>
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-emerald-400 rounded-bl-sm"></div>
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-emerald-400 rounded-br-sm"></div>
                <div className="absolute left-4 right-4 top-1/2 h-px bg-emerald-400/40"></div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-4 py-5 gap-2">
            <span className="text-2xl">📷</span>
            <p className="text-xs text-red-300 text-center leading-relaxed">
              {errorMessage}
            </p>
          </div>
        )}

        {/* Статус / предупреждения */}
        <div className="px-3 py-2">
          {lastAlert ? (
            <div className="bg-red-500/20 border border-red-400/30 rounded-lg px-2 py-1.5">
              <p className="text-xs text-red-300 leading-snug">⚠️ {lastAlert}</p>
            </div>
          ) : (
            <p className="text-xs text-white/40 tracking-wide text-center">
              {status === 'active' ? 'Анализ пространства...' : ''}
            </p>
          )}
        </div>

        {/* Индикатор координат + кнопка ручной отметки */}
        {status === 'active' && (
          <div className="px-3 pb-2 flex flex-col gap-1.5">
            {userLocationRef.current ? (
              <>
                <p className="text-xs text-emerald-400/70 text-center tracking-wide">
                  📍 Геопривязка активна
                </p>
                {/* Кнопка ручной отметки препятствия для тестирования */}
                <button
                  onClick={async () => {
                    setIsSending(true);
                    const loc = userLocationRef.current!;
                    try {
                      const res = await fetch('http://localhost:8000/api/vision/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          image_base64: 'test',
                          lat: loc[1],
                          lon: loc[0],
                          force_hazard: true  // признак для мока
                        })
                      });
                      const data = await res.json();
                      if (data.hazard_detected) {
                        setLastAlert(data.message || 'Обнаружено учебное препятствие');
                        // Вызов коллбека без голоса
                        if (onHazardDetected) onHazardDetected();
                      }
                    } catch(e) {
                      console.error(e);
                    } finally {
                      setIsSending(false);
                    }
                  }}
                  disabled={isSending}
                  className="w-full py-1.5 bg-orange-500/20 hover:bg-orange-500/40 disabled:opacity-50 text-orange-300 text-xs font-semibold rounded-lg border border-orange-400/30 transition-colors"
                >
                  {isSending ? 'Отправка...' : '⚠️ Тест: Отметить препятствие'}
                </button>
              </>
            ) : (
              <p className="text-xs text-white/30 text-center">
                Нет геопривязки
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
