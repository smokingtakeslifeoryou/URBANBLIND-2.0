"use client";

import { useEffect, useState } from 'react';

type Incident = {
  id: number;
  description: string;
  status: string;
  confidence: number;
  created_at: string;
};

interface IncidentDashboardProps {
  refreshTrigger: number;
}

export function IncidentDashboard({ refreshTrigger }: IncidentDashboardProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isOpen, setIsOpen] = useState(false); // Smart Toast: изначально скрыт

  // Загрузка актуальных инцидентов
  useEffect(() => {
    fetch('http://localhost:8000/api/incidents')
      .then(res => res.json())
      .then(data => setIncidents(data))
      .catch(err => console.error("Ошибка загрузки инцидентов:", err));
  }, [refreshTrigger]);

  // Эффект авто-открытия и скрытия при получении веб-сокета
  useEffect(() => {
    // Пропускаем открытие при первичной загрузке страницы (когда trigger = 0)
    if (refreshTrigger === 0) return;

    // Открываем панель, чтобы жюри увидело уведомление
    setIsOpen(true);

    // Таймер на 8 секунд
    const timer = setTimeout(() => {
      setIsOpen(false);
    }, 8000);

    // Очищаем таймер, если прилетел новый инцидент до истечения 8 секунд
    return () => clearTimeout(timer);
  }, [refreshTrigger]);

  if (!isOpen) {
    return (
      <div className="absolute top-6 right-6 z-20 pointer-events-auto">
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-white/90 backdrop-blur-xl border border-slate-200 shadow-lg rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
          Лог угроз
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-6 right-6 z-20 w-72 bg-white/90 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-3xl p-4 overflow-hidden flex flex-col max-h-64 pointer-events-auto transition-all duration-300">
      
      {/* Заголовок с кнопкой закрытия */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-[11px] font-bold tracking-wider uppercase text-slate-700 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Жюри: Лог угроз
        </h3>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-1"
          title="Свернуть"
        >
          ✕
        </button>
      </div>
      
      {/* Список инцидентов */}
      <div className="overflow-y-auto pr-2 flex-1 flex flex-col gap-2.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full">
        {incidents.length === 0 ? (
          <p className="text-slate-400 text-xs text-center py-4 font-medium">Активных угроз нет</p>
        ) : (
          incidents.map((incident) => (
            <div key={incident.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-sm">
              <div className="flex justify-between items-center mb-1.5">
                <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border ${
                  incident.status === 'verified' 
                    ? 'bg-red-50 text-red-600 border-red-100' 
                    : 'bg-amber-50 text-amber-600 border-amber-100'
                }`}>
                  {incident.status === 'verified' ? 'Подтверждено' : 'Ожидает'}
                </span>
                <span className="text-[9px] text-slate-400 font-mono font-medium">
                  {new Date(incident.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-tight font-medium">
                {incident.description}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
