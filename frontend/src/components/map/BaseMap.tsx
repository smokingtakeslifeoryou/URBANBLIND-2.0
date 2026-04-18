"use client";

import DeckGL from '@deck.gl/react';
import { FlyToInterpolator, WebMercatorViewport } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import Map, { Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useState, useEffect, useCallback, useRef } from 'react';
import { CameraScanner } from '../vision/CameraScanner';
import { IncidentDashboard } from '../ui/IncidentDashboard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_URL = process.env.NEXT_PUBLIC_API_URL 
  ? process.env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws') + '/ws/incidents'
  : 'ws://localhost:8000/ws/incidents';

const INITIAL_VIEW_STATE = {
  longitude: 49.1088,
  latitude: 55.7963,
  zoom: 14,
  pitch: 45,
  bearing: 0
};

const PinMarker = ({ color }: { color: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill={color} stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-xl cursor-pointer hover:scale-110 active:scale-95 transition-all duration-200">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3.5" fill="white" stroke="none" />
  </svg>
);

const ExpandableButton = ({ icon, text, onClick, isActive = false, className = "" }: any) => (
  <button
    onClick={onClick}
    className={`group relative flex items-center justify-start h-[50px] w-[50px] rounded-[25px] overflow-hidden transition-all duration-300 shadow-md hover:-translate-y-[4px] hover:w-[155px] active:scale-95 hover:brightness-110 ease-out ${isActive
      ? 'bg-[#1c3044] text-white border border-[#1c3044]'
      : 'bg-white text-[#1c3044] border border-slate-200'
      } ${className}`}
    style={{ transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
  >
    <div className="flex items-center justify-center min-w-[50px] h-full shrink-0">
      {icon}
    </div>
    <span className={`whitespace-nowrap font-bold text-[13px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pr-4`}>
      {text}
    </span>
  </button>
);

export function BaseMap() {
  const [isMounted, setIsMounted] = useState(false);
  const [networkData, setNetworkData] = useState(null);

  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const [endPoint, setEndPoint] = useState<[number, number] | null>(null);
  const [routeData, setRouteData] = useState(null);
  const [viewState, setViewState] = useState<any>(INITIAL_VIEW_STATE);

  // A -> B Search State
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [startResults, setStartResults] = useState<any[]>([]);
  const [endResults, setEndResults] = useState<any[]>([]);
  const [activeInput, setActiveInput] = useState<'start' | 'end' | null>(null);
  const [isListening, setIsListening] = useState<'start' | 'end' | null>(null);

  const [incidentRefreshTrigger, setIncidentRefreshTrigger] = useState(0);
  const [showZones, setShowZones] = useState(true);
  const [isVisionEnabled, setIsVisionEnabled] = useState(false);

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { setIsMounted(true); }, []);

  const fetchNetworkData = useCallback((lon: number, lat: number, zoom: number, width: number, height: number) => {
    try {
      if (!width || !height) return;
      const viewport = new WebMercatorViewport({ width, height, longitude: lon, latitude: lat, zoom });
      const bounds = viewport.getBounds();
      const minLon = bounds[0];
      const minLat = bounds[1];
      const maxLon = bounds[2];
      const maxLat = bounds[3];

      fetch(`${API_URL}/api/map/network?min_lon=${minLon}&min_lat=${minLat}&max_lon=${maxLon}&max_lat=${maxLat}`)
        .then(res => res.json())
        .then(data => setNetworkData(data))
        .catch(err => console.error("Ошибка обновления графа:", err));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleHazardDetected = useCallback(() => {
    fetchNetworkData(viewState.longitude, viewState.latitude, viewState.zoom, window.innerWidth, window.innerHeight);
  }, [fetchNetworkData, viewState]);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWebSocket = () => {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'HAZARD_UPDATED') {
            handleHazardDetected();
            setIncidentRefreshTrigger(Date.now());
          }
        } catch (err) { }
      };
      ws.onclose = () => { reconnectTimeout = setTimeout(connectWebSocket, 3000); };
      ws.onerror = () => ws.close();
    };

    connectWebSocket();
    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [handleHazardDetected]);

  useEffect(() => {
    fetchNetworkData(INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude, INITIAL_VIEW_STATE.zoom, window.innerWidth, window.innerHeight);
  }, [fetchNetworkData]);

  const handleViewStateChange = ({ viewState: newViewState }: any) => {
    setViewState(newViewState);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      fetchNetworkData(newViewState.longitude, newViewState.latitude, newViewState.zoom, window.innerWidth, window.innerHeight);
    }, 600);
  };

  const buildRoute = useCallback(async (start: [number, number], end: [number, number]) => {
    try {
      const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/foot/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`);
      if (osrmRes.ok) {
        const osrmData = await osrmRes.json();
        if (osrmData.routes && osrmData.routes.length > 0) {
          setRouteData({
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: osrmData.routes[0].geometry }]
          } as any);
        }
      }
    } catch (e) {
      console.error("OSRM Routing error:", e);
    }
  }, []);

  useEffect(() => {
    if (startPoint && endPoint) buildRoute(startPoint, endPoint);
  }, [endPoint, startPoint, buildRoute]);

  // Photon API Suggestions
  const fetchSuggestions = async (query: string, setter: React.Dispatch<React.SetStateAction<any[]>>) => {
    if (!query.trim()) {
      setter([]);
      return;
    }
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=ru`);
      const data = await res.json();
      setter(data.features || []);
    } catch (e) {
      console.error("Photon API Error", e);
    }
  };

  const handleSelectLocation = (result: any, type: 'start' | 'end') => {
    const coords = result.geometry.coordinates;
    const name = result.properties.name || result.properties.street || '';
    const city = result.properties.city || result.properties.state || '';
    const displayName = [name, city].filter(Boolean).join(', ');

    if (type === 'start') {
      setStartPoint([coords[0], coords[1]]);
      setStartQuery(displayName);
      setStartResults([]);
    } else {
      setEndPoint([coords[0], coords[1]]);
      setEndQuery(displayName);
      setEndResults([]);
    }
    setActiveInput(null);
    setViewState({
      longitude: coords[0], latitude: coords[1], zoom: 16, pitch: 45, bearing: 0,
      transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator()
    });
  };

  const startVoiceRecognition = (type: 'start' | 'end') => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Ваш браузер не поддерживает голосовой ввод");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(type);
    recognition.onend = () => setIsListening(null);
    recognition.onerror = () => setIsListening(null);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (type === 'start') {
        setStartQuery(transcript);
        fetchSuggestions(transcript, setStartResults);
        setActiveInput('start');
      } else {
        setEndQuery(transcript);
        fetchSuggestions(transcript, setEndResults);
        setActiveInput('end');
      }
    };

    recognition.start();
  };

  const locateUser = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { longitude, latitude } = position.coords;
          setStartPoint([longitude, latitude]);
          setStartQuery("Моё местоположение");
          setViewState({
            longitude, latitude, zoom: 16, pitch: 45, bearing: 0,
            transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator()
          });
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
      setStartQuery(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      setEndPoint(null);
      setEndQuery('');
      setRouteData(null);
    } else if (startPoint && !endPoint) {
      setEndPoint([lon, lat]);
      setEndQuery(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
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
    updateTriggers: { getLineColor: [networkData] }
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

  const renderOverlay = () => {
    let statusText = "Укажите точки старта и финиша";
    if (startPoint && !endPoint) statusText = "Шаг 2: Укажите финиш";
    if (routeData) statusText = "Безопасный маршрут проложен!";

    return (
      <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] sm:w-[380px] bg-white/90 backdrop-blur-xl border border-white/50 shadow-2xl rounded-[32px] p-5 text-slate-800 font-sans pointer-events-auto transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} animate-in fade-in slide-in-from-bottom-4`}>

        <h3 className="text-xs font-bold tracking-wider uppercase text-[#1c3044] flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-[#1c3044] animate-pulse"></span>
          Навигатор UrbanBlind
        </h3>
        <p className="text-sm font-semibold mb-4 text-slate-600 leading-relaxed">{statusText}</p>

        {/* Умный Поиск A -> B */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="relative">
            <input
              value={startQuery}
              onChange={(e) => {
                setStartQuery(e.target.value);
                fetchSuggestions(e.target.value, setStartResults);
              }}
              onFocus={() => setActiveInput('start')}
              placeholder="Откуда (адрес или заведение)..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-5 pr-14 py-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-[#1c3044] focus:ring-2 focus:ring-[#1c3044]/20 transition-all duration-200 ease-out font-medium shadow-sm hover:brightness-105 active:scale-[0.98]"
            />
            <div className="absolute right-2 top-1.5 flex gap-1">
              <button
                onClick={() => startVoiceRecognition('start')}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ease-out active:scale-90 ${isListening === 'start' ? 'bg-red-100 text-red-500 animate-pulse' : 'text-[#1c3044] hover:bg-slate-200 hover:brightness-110'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>
              </button>
            </div>

            {activeInput === 'start' && startResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 shadow-xl rounded-xl z-50 animate-in fade-in slide-in-from-top-2 duration-300 overflow-hidden">
                {startResults.map((r: any, i: number) => (
                  <div key={i} onClick={() => handleSelectLocation(r, 'start')} className="px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 hover:brightness-95 active:bg-slate-100 cursor-pointer transition-colors duration-200">
                    <p className="text-sm font-bold text-[#1c3044]">{r.properties.name || r.properties.street}</p>
                    <p className="text-xs text-slate-500">{[r.properties.city, r.properties.state, r.properties.country].filter(Boolean).join(', ')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <input
              value={endQuery}
              onChange={(e) => {
                setEndQuery(e.target.value);
                fetchSuggestions(e.target.value, setEndResults);
              }}
              onFocus={() => setActiveInput('end')}
              placeholder="Куда (адрес или заведение)..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-5 pr-14 py-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-[#1c3044] focus:ring-2 focus:ring-[#1c3044]/20 transition-all duration-200 ease-out font-medium shadow-sm hover:brightness-105 active:scale-[0.98]"
            />
            <div className="absolute right-2 top-1.5 flex gap-1">
              <button
                onClick={() => startVoiceRecognition('end')}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ease-out active:scale-90 ${isListening === 'end' ? 'bg-red-100 text-red-500 animate-pulse' : 'text-[#1c3044] hover:bg-slate-200 hover:brightness-110'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>
              </button>
            </div>
            {activeInput === 'end' && endResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 shadow-xl rounded-xl z-50 animate-in fade-in slide-in-from-top-2 duration-300 overflow-hidden">
                {endResults.map((r: any, i: number) => (
                  <div key={i} onClick={() => handleSelectLocation(r, 'end')} className="px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 hover:brightness-95 active:bg-slate-100 cursor-pointer transition-colors duration-200">
                    <p className="text-sm font-bold text-[#1c3044]">{r.properties.name || r.properties.street}</p>
                    <p className="text-xs text-slate-500">{[r.properties.city, r.properties.state, r.properties.country].filter(Boolean).join(', ')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 mt-2 px-1">
          <span className="text-sm font-semibold text-[#1c3044]">Показывать зоны рисков</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={showZones} onChange={() => setShowZones(!showZones)} className="sr-only peer" />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all active:scale-95 peer-checked:bg-[#1c3044]"></div>
          </label>
        </div>

        <div className="flex justify-center gap-3 flex-wrap">
          <ExpandableButton
            onClick={locateUser}
            icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><circle cx="12" cy="12" r="7" /></svg>}
            text="Найти Меня"
          />

          <ExpandableButton
            onClick={() => setIsVisionEnabled(prev => !prev)}
            icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>}
            text={isVisionEnabled ? 'AI ON' : 'AI-зрение'}
            isActive={isVisionEnabled}
          />

          <ExpandableButton
            onClick={async () => {
              try {
                await fetch(`${API_URL}/api/map/reset_risks`, { method: 'POST' });
                handleHazardDetected();
              } catch (e) { console.error(e); }
            }}
            icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>}
            text="Сброс Рисков"
            className="text-amber-600 bg-amber-50 border-amber-200"
          />

          {(startPoint || endPoint) && (
            <ExpandableButton
              onClick={() => { setStartPoint(null); setStartQuery(''); setEndPoint(null); setEndQuery(''); setRouteData(null); }}
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>}
              text="Сброс Маршрута"
              className="text-slate-500 bg-slate-50 border-slate-200"
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 w-full h-full z-0 font-sans pointer-events-none overflow-hidden bg-slate-50">
      <div className="absolute inset-0 z-20 pointer-events-none">
        {renderOverlay()}
        <IncidentDashboard refreshTrigger={incidentRefreshTrigger} />
        {isVisionEnabled && (
          <CameraScanner onClose={() => setIsVisionEnabled(false)} userLocation={startPoint ?? undefined} onHazardDetected={handleHazardDetected} />
        )}
      </div>
      <div className="absolute inset-0 pointer-events-auto">
        <DeckGL
          viewState={viewState}
          onViewStateChange={handleViewStateChange}
          controller={true}
          onClick={handleMapClick}
          getCursor={({ isDragging }) => isDragging ? 'grabbing' : 'crosshair'}
          layers={[showZones && networkLayer, routeLayer].filter(Boolean)}
        >
          <Map mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json">
            {startPoint && (
              <Marker longitude={startPoint[0]} latitude={startPoint[1]} anchor="bottom">
                <PinMarker color="#10b981" />
              </Marker>
            )}
            {endPoint && (
              <Marker longitude={endPoint[0]} latitude={endPoint[1]} anchor="bottom">
                <PinMarker color="#1c3044" />
              </Marker>
            )}
          </Map>
        </DeckGL>
      </div>
    </div>
  );
}
