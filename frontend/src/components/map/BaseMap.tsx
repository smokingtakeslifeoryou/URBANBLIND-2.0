"use client";

import DeckGL from '@deck.gl/react';
import { FlyToInterpolator } from '@deck.gl/core';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useState, useEffect, useCallback, useRef } from 'react';
import { CameraScanner } from '../vision/CameraScanner';
import { IncidentDashboard } from '../ui/IncidentDashboard';

const INITIAL_VIEW_STATE = {
  longitude: 49.1088,
  latitude: 55.7963,
  zoom: 14,
  pitch: 45,
  bearing: 0
};

export function BaseMap() {
  const [networkData, setNetworkData] = useState(null);
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const [endPoint, setEndPoint] = useState<[number, number] | null>(null);
  const [routeData, setRouteData] = useState(null);
  const [viewState, setViewState] = useState<any>(INITIAL_VIEW_STATE);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [incidentRefreshTrigger, setIncidentRefreshTrigger] = useState(0);
  
  // Управление голосовым сопровождением
  const [isMuted, setIsMuted] = useState(true);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const speak = useCallback((text: string) => {
    if (isMutedRef.current) return;
    
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // AI-зрение
  const [isVisionEnabled, setIsVisionEnabled] = useState(false);

  // Коллбэк при обнаружении угрозы — перезагружаем граф (красные линии)
  const handleHazardDetected = useCallback(() => {
    fetch('http://localhost:8000/api/map/network')
      .then(res => res.json())
      .then(data => setNetworkData(data))
      .catch(err => console.error("Ошибка обновления графа:", err));
  }, []);

  // === НОВЫЙ WEBSOCKET КЛИЕНТ (с автореконнектом) ===
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWebSocket = () => {
      ws = new WebSocket('ws://localhost:8000/ws/incidents');

      ws.onopen = () => {
        console.log("WebSocket: Соединение установлено");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'HAZARD_UPDATED') {
            console.log("WebSocket: HAZARD_UPDATED -> Обновляем карту и дашборд");
            handleHazardDetected();
            setIncidentRefreshTrigger(Date.now());
          }
        } catch (err) {
          console.error("Ошибка парсинга WS:", err);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket: Соединение закрыто. Переподключение через 3 секунды...");
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (err) => {
        console.error("WebSocket: Ошибка", err);
        ws.close(); // Форсируем вызов onclose для реконнекта
      };
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null; // Отключаем реконнект при размонтировании
        ws.close();
      }
    };
  }, [handleHazardDetected]);

  useEffect(() => {
    fetch('http://localhost:8000/api/map/network')
      .then(res => res.json())
      .then(data => setNetworkData(data))
      .catch(err => console.error("Ошибка загрузки GeoJSON:", err));
  }, []);

  const buildRoute = useCallback(async (start: [number, number], end: [number, number]) => {
    try {
      const response = await fetch('http://localhost:8000/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_lat: start[1],
          start_lon: start[0],
          end_lat: end[1],
          end_lon: end[0]
        })
      });
      if (response.ok) {
        const data = await response.json();
        setRouteData(data);
        if (data.features && data.features.length > 0) {
          speak("Безопасный маршрут построен");
        } else {
          speak("К сожалению, маршрут не найден");
        }
      } else {
        speak("Произошла ошибка при расчете маршрута");
      }
    } catch {
      speak("Сетевая ошибка");
    }
  }, [speak]); // Добавили speak в зависимости

  useEffect(() => {
    if (startPoint && endPoint) {
      buildRoute(startPoint, endPoint);
    }
  }, [endPoint, startPoint, buildRoute]);

  const searchDestination = async () => {
    if (!searchQuery.trim()) return;

    speak("Ищу адрес");
    setIsSearching(true);

    try {
      const query = encodeURIComponent(`Казань ${searchQuery}`);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
        { headers: { 'Accept-Language': 'ru' } }
      );
      const results = await response.json();

      if (results && results.length > 0) {
        const lat = parseFloat(results[0].lat);
        const lon = parseFloat(results[0].lon);

        setEndPoint([lon, lat]);
        setViewState((prev: any) => ({
          ...prev,
          longitude: lon,
          latitude: lat,
          zoom: 16,
          transitionDuration: 1200,
          transitionInterpolator: new FlyToInterpolator()
        }));
        speak("Адрес найден, выстраиваю маршрут");
      } else {
        speak("Адрес не найден, попробуйте уточнить запрос");
      }
    } catch {
      speak("Ошибка при поиске адреса");
    } finally {
      setIsSearching(false);
    }
  };

  const locateUser = () => {
    if ('geolocation' in navigator) {
      speak("Определяю ваше местоположение. Пожалуйста, подождите.");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { longitude, latitude } = position.coords;
          setStartPoint([longitude, latitude]);
          setEndPoint(null);
          setRouteData(null);
          setViewState((prev: any) => ({
            ...prev,
            longitude,
            latitude,
            zoom: 16,
            transitionDuration: 1500,
            transitionInterpolator: new FlyToInterpolator()
          }));
          speak("Ваше местоположение определено. Выберите точку финиша.");
        },
        () => speak("Не удалось определить местоположение. Проверьте разрешения браузера."),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      speak("Геолокация не поддерживается вашим устройством");
    }
  };

  const handleMapClick = async (info: any) => {
    if (!info.coordinate) return;
    const [lon, lat] = info.coordinate;

    if (!startPoint || (startPoint && endPoint)) {
      setStartPoint([lon, lat]);
      setEndPoint(null);
      setRouteData(null);
      speak("Точка старта установлена вручную");
    } else if (startPoint && !endPoint) {
      setEndPoint([lon, lat]);
      speak("Ищу безопасный маршрут по пешеходным зонам");
    }
  };

  const networkLayer = new GeoJsonLayer({
    id: 'real-network-edges-layer',
    data: networkData,
    pickable: true,
    stroked: false,
    filled: false,
    extruded: false,
    lineWidthScale: 5,
    lineWidthMinPixels: 2,
    getLineColor: (d: any) => {
      const risk = d.properties?.current_risk_weight;
      return risk > 0 ? [255, 50, 50, 255] : [100, 255, 100, 150];
    },
    getLineWidth: 1,
    updateTriggers: {
      getLineColor: [networkData] // форсирует перерасчёт цветов при обновлении данных
    }
  });

  const routeLayer = routeData && new GeoJsonLayer({
    id: 'route-line-layer',
    data: routeData,
    stroked: true,
    filled: false,
    lineWidthScale: 5,
    lineWidthMinPixels: 4,
    getLineColor: [0, 191, 255, 255],
    getLineWidth: 2
  });

  const markersData: { position: [number, number]; color: number[] }[] = [];
  if (startPoint) markersData.push({ position: startPoint, color: [16, 185, 129] });
  if (endPoint) markersData.push({ position: endPoint, color: [245, 158, 11] });

  const markersLayer = new ScatterplotLayer({
    id: 'route-markers-layer',
    data: markersData,
    pickable: false,
    opacity: 1,
    stroked: true,
    filled: true,
    radiusMinPixels: 6,
    radiusMaxPixels: 20,
    lineWidthMinPixels: 2,
    getPosition: (d: any) => d.position,
    getFillColor: (d: any) => d.color,
    getLineColor: [255, 255, 255],
    getRadius: 15
  });

  const renderOverlay = () => {
    let statusText = "📍 Шаг 1: Кликните карту или найдите адрес";
    if (startPoint && !endPoint) statusText = "🎯 Шаг 2: Кликните финиш или введите адрес";
    if (routeData) statusText = "✅ Безопасный маршрут проложен!";

    return (
      <div className="absolute top-6 left-6 z-20 bg-black/60 backdrop-blur-md p-5 rounded-2xl border border-white/20 shadow-2xl text-white font-sans max-w-sm pointer-events-auto transition-all duration-300">
        
        {/* Заголовок и переключатель звука */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold tracking-wider uppercase text-emerald-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Навигатор UrbanBlind
          </h3>
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`text-lg transition-opacity ${isMuted ? 'opacity-50 hover:opacity-80' : 'opacity-100 hover:opacity-80'}`}
            title={isMuted ? "Включить голосовое сопровождение" : "Выключить голосовое сопровождение"}
          >
            {isMuted ? "🔇" : "🔊"}
          </button>
        </div>

        <p className="text-sm font-medium mb-4 text-white/90 leading-relaxed">{statusText}</p>

        {/* Поиск адреса */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchDestination()}
            placeholder="Улица, место в Казани..."
            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-emerald-400/60 transition-colors"
          />
          <button
            onClick={searchDestination}
            disabled={isSearching}
            className="px-3 py-2 bg-blue-500/30 hover:bg-blue-500/50 disabled:opacity-50 disabled:cursor-wait transition-colors rounded-xl text-sm font-semibold border border-blue-400/30"
          >
            {isSearching ? '⏳' : '🔍'}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {/* GPS-кнопка */}
          <button
            onClick={locateUser}
            className="w-full py-2.5 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 transition-colors rounded-xl text-sm font-semibold tracking-wide border border-emerald-500/30 flex items-center justify-center gap-2"
          >
            🧭 Найти Меня (GPS)
          </button>

          {/* Кнопка AI-зрения */}
          <button
            onClick={() => setIsVisionEnabled(prev => !prev)}
            className={`w-full py-2.5 transition-colors rounded-xl text-sm font-semibold tracking-wide border flex items-center justify-center gap-2 ${
              isVisionEnabled
                ? 'bg-violet-500/30 hover:bg-violet-500/50 text-violet-200 border-violet-400/30'
                : 'bg-white/10 hover:bg-white/20 text-white/80 border-white/10'
            }`}
          >
            {isVisionEnabled ? '👁️ AI-зрение ON' : '👁️ Включить AI-зрение'}
          </button>

          {/* Сброс */}
          {(startPoint || endPoint) && (
            <button
              onClick={() => {
                setStartPoint(null);
                setEndPoint(null);
                setRouteData(null);
                setSearchQuery('');
                speak("Маршрут сброшен");
              }}
              className="w-full py-2.5 bg-white/10 hover:bg-white/25 transition-colors rounded-xl text-sm font-semibold tracking-wide border border-white/10"
            >
              Сбросить маршрут
            </button>
          )}

          {/* Кнопка сброса рисков — для демо и модератора */}
          <button
            onClick={async () => {
              try {
                await fetch('http://localhost:8000/api/map/reset_risks', { method: 'POST' });
                // Перезагружаем граф — красные линии исчезают
                handleHazardDetected();
                speak("Все риски сброшены");
              } catch (e) {
                console.error("Ошибка сброса рисков:", e);
              }
            }}
            className="w-full py-2.5 bg-amber-500/15 hover:bg-amber-500/30 text-amber-300/80 hover:text-amber-200 transition-colors rounded-xl text-sm font-semibold tracking-wide border border-amber-500/20 flex items-center justify-center gap-2"
          >
            ♻️ Сбросить риски
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 w-full h-full z-0 font-sans pointer-events-none">
      <div className="absolute inset-0 z-20 pointer-events-none">
        {renderOverlay()}
        
        {/* === НОВЫЙ БЛОК: Панель модератора справа === */}
        <IncidentDashboard refreshTrigger={incidentRefreshTrigger} />

        {/* AI-камера: плавающее окно в правом нижнем углу */}
        {isVisionEnabled && (
          <CameraScanner
            onClose={() => setIsVisionEnabled(false)}
            userLocation={startPoint ?? undefined}
            onHazardDetected={handleHazardDetected}
          />
        )}
      </div>
      <div className="absolute inset-0 pointer-events-auto">
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState }) => setViewState(viewState)}
          controller={true}
          onClick={handleMapClick}
          getCursor={({ isDragging }) => isDragging ? 'grabbing' : 'crosshair'}
          layers={[networkLayer, routeLayer, markersLayer].filter(Boolean)}
        >
          <Map mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" />
        </DeckGL>
      </div>
    </div>
  );
}
