"use client";

import DeckGL from '@deck.gl/react';
import { HexagonLayer } from '@deck.gl/aggregation-layers';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

interface RiskDataPoint {
  position: [number, number];
}

// 1. Создаем реалистичное распределение точек в круговой зоне (а не квадратом)
const MOCK_DATA: RiskDataPoint[] = [];
for (let i = 0; i < 6000; i++) {
  // Вероятность попадания в один из "эпицентров"
  const isHotspot = Math.random() > 0.8;
  
  // Рассчитываем расстояние от центра (ближе к центру = плотнее)
  const radius = isHotspot 
    ? Math.sqrt(Math.random()) * 0.08  // Мелкие кластеры-очаги (красные пики)
    : Math.sqrt(Math.random()) * 0.35; // Общее распределение по краю города

  // Расчет круговых координат
  const angle = Math.random() * Math.PI * 2;
  const centerLon = isHotspot && Math.random() > 0.5 ? 37.5 : 37.6173; // Второй микро-центр для разнообразия
  
  MOCK_DATA.push({
    position: [
      centerLon + radius * Math.cos(angle), 
      55.7558 + (radius * Math.sin(angle) * 0.6) // 0.6 компенсирует растяжение проекции на этих широтах
    ]
  });
}

const INITIAL_VIEW_STATE = {
  longitude: 37.6173,
  latitude: 55.7558,
  zoom: 10.5,
  pitch: 45,
  bearing: 0
};

// Материал для придания гексагонам мягкости матового пластика
const premiumMaterial = {
  ambient: 0.8,
  diffuse: 0.5,
  shininess: 10,
  specularColor: [255, 255, 255]
};

export function BaseMap() {
  const hexagonLayer = new HexagonLayer<RiskDataPoint>({
    id: 'risk-hexagon-layer',
    data: MOCK_DATA,
    getPosition: (d) => d.position,
    
    // Дизайн "Premium Analytical"
    radius: 200,          // Вернули мелкую детализированную сетку
    extruded: true,
    elevationScale: 3,    // Очень мягкий подъем столбиков
    elevationRange: [0, 800], // Ограничитель высоты
    coverage: 0.9,        // Зазоры в 10% между гексагонами для воздушности
    opacity: 0.85,        // Полупрозрачность слоя
    material: premiumMaterial,
    
    // Полупрозрачная палитра (RGBA) для гармонии с Pearl-Gray фоном
    colorRange: [
      [16, 185, 129, 180],  // Безопасно (Полупрозрачный изумрудный)
      [112, 194, 82, 200],  
      [205, 185, 30, 210],  
      [245, 158, 11, 230],  // Внимание (Плотный янтарный)
      [235, 106, 32, 240],  
      [226, 54, 54, 255]    // Опасно (Терракотовый)
    ],
    
    transitions: {
      elevationScale: 1000
    }
  });

  return (
    <div className="absolute inset-0 w-full h-full z-0">
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={[hexagonLayer]}
      >
        <Map 
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        />
      </DeckGL>
    </div>
  );
}
