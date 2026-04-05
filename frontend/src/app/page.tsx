"use client";

import { useState } from "react";
import { FloatingSearchBar } from "../components/ui/FloatingSearchBar";
import { BaseMap } from "../components/map/BaseMap";

export default function Home() {
  const [showMap, setShowMap] = useState(false);

  if (!showMap) {
    return (
      <main className="relative w-full h-screen flex flex-col items-center justify-center bg-pearl-gray">
        <div className="text-center z-10 flex flex-col items-center">
          <h1 className="text-6xl md:text-8xl font-black text-gray-900 tracking-tighter mb-4 drop-shadow-sm">
            Urban-Blind
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-12 font-medium tracking-wide">
            Доступная среда Казани
          </p>
          <button 
            onClick={() => setShowMap(true)}
            className="px-10 py-5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg rounded-2xl shadow-xl shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95"
          >
            Начать навигацию
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative w-full h-screen overflow-hidden bg-pearl-gray">
      {/* UI Слой - Плавающая панель поиска и ИИ Юби (z-index выше карты) */}
      <FloatingSearchBar />

      {/* Интерактивная Карта MapLibre */}
      <BaseMap />
    </main>
  );
}
