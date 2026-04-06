"use client";

import DeckGL from '@deck.gl/react';
import { FlyToInterpolator } from '@deck.gl/core';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useState, useEffect, useCallback } from 'react';
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
  
  // AI-зрение
  const [isVisionEnabled, setIsVisionEnabled] = useState(false);

  // Коллбэк при обнаружении угрозы
  const handleHazardDetected = useCallback(() => {
    fetch('http://localhost:8000/api/map/network')
      .then(res => res.json())
      .then(data => setNetworkData(data))
      .catch(err => console.error("Ошибка обновления графа:", err));
  }, []);

  // WEBSOCKET КЛИЕНТ
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWebSocket = () => {
      ws = new WebSocket('ws://localhost:8000/ws/incidents');

      ws.onopen = () => console.log("WebSocket установлен");

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'HAZARD_UPDATED') {
            handleHazardDetected();
            setIncidentRefreshTrigger(Date.now());
          }
        } catch (err) {
          console.error("Ошибка парсинга WS:", err);
        }
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
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
      }
    } catch (e) {
      console.error(e);
    }
  }, []); 

  useEffect(() => {
    if (startPoint && endPoint) {
      buildRoute(startPoint, endPoint);
    }
  }, [endPoint, startPoint, buildRoute]);

  const searchDestination = async () => {
    if (!searchQuery.trim()) return;
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
          ...prev, longitude: lon, latitude: lat, zoom: 16,
          transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator()
        }));
      }
    } catch(e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const locateUser = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { longitude, latitude } = position.coords;
          setStartPoint([longitude, latitude]);
          setEndPoint(null);
          setRouteData(null);
          setViewState((prev: any) => ({
            ...prev, longitude, latitude, zoom: 16,
            transitionDuration: 1500, transitionInterpolator: new FlyToInterpolator()
          }));
        },
        () => console.error("Геолокация недоступна"),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  const handleMapClick = async (info: any) => {
    if (!info.coordinate) return;
    const [lon, lat] = info.coordinate;

    if (!startPoint || (startPoint && endPoint)) {
      setStartPoint([lon, lat]);
      setEndPoint(null);
      setRouteData(null);
    } else if (startPoint && !endPoint) {
      setEndPoint([lon, lat]);
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
      getLineColor: [networkData]
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
    let statusText = "Шаг 1: Кликните карту или найдите адрес";
    if (startPoint && !endPoint) statusText = "Шаг 2: Кликните финиш или введите адрес";
    if (routeData) statusText = "Безопасный маршрут проложен!";

    return (
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] sm:w-[380px] bg-white/90 backdrop-blur-xl border border-white/50 shadow-2xl rounded-[32px] p-5 text-slate-800 font-sans pointer-events-auto transition-all duration-500">
        
        {/* Заголовок */}
        <h3 className="text-xs font-bold tracking-wider uppercase text-emerald-500 flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Навигатор UrbanBlind
        </h3>

        <p className="text-sm font-semibold mb-4 text-slate-600 leading-relaxed">{statusText}</p>

        {/* Поиск адреса */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchDestination()}
            placeholder="Улица, место в Казани..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all font-medium"
          />
          <button
            onClick={searchDestination}
            disabled={isSearching}
            className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-wait transition-colors rounded-2xl text-sm font-bold border border-slate-200 text-slate-600 shadow-sm"
          >
            {isSearching ? '⏳' : '🔍'}
          </button>
        </div>

        {/* Сетка основных кнопок (Mobile First) */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* GPS-кнопка */}
          <button
            onClick={locateUser}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white transition-colors rounded-2xl text-[13px] font-bold tracking-wide shadow-md flex items-center justify-center gap-1.5"
          >
            🧭 Найти Меня
          </button>

          {/* Кнопка AI-зрения */}
          <button
            onClick={() => setIsVisionEnabled(prev => !prev)}
            className={`w-full py-3 transition-colors rounded-2xl text-[13px] font-bold tracking-wide border flex items-center justify-center gap-1.5 ${
              isVisionEnabled
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-md'
                : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100'
            }`}
          >
            {isVisionEnabled ? '👁️ AI ON' : '👁️ AI-зрение'}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {/* Сброс маршрута */}
          {(startPoint || endPoint) && (
            <button
              onClick={() => {
                setStartPoint(null);
                setEndPoint(null);
                setRouteData(null);
                setSearchQuery('');
              }}
              className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors rounded-2xl text-[13px] font-bold tracking-wide border border-slate-200"
            >
              Сбросить маршрут
            </button>
          )}

          {/* Кнопка сброса рисков */}
          <button
            onClick={async () => {
              try {
                await fetch('http://localhost:8000/api/map/reset_risks', { method: 'POST' });
                // Скрытый reload
                handleHazardDetected();
              } catch (e) {
                console.error("Ошибка сброса рисков:", e);
              }
            }}
            className="w-full py-3 bg-amber-50 hover:bg-amber-100 text-amber-600 transition-colors rounded-2xl text-[13px] font-bold tracking-wide border border-amber-200 flex items-center justify-center gap-2"
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
        
        {/* Главная панель управления (Bottom Sheet) */}
        {renderOverlay()}
        
        {/* Панель модератора (Smart Toast) */}
        <IncidentDashboard refreshTrigger={incidentRefreshTrigger} />

        {/* Сканер камеры (Z-index 30 перекроет нижнюю панель, если что-то наложится) */}
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
