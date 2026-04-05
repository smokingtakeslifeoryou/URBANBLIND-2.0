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

  useEffect(() => {
    fetch('http://localhost:8000/api/incidents')
      .then(res => res.json())
      .then(data => setIncidents(data))
      .catch(err => console.error("Ошибка загрузки инцидентов:", err));
  }, [refreshTrigger]); // Дашборд перезапрашивает данные при изменении триггера

  return (
    <div className="absolute top-6 right-6 z-20 w-80 bg-black/60 backdrop-blur-md border border-white/20 shadow-2xl rounded-2xl p-4 overflow-hidden flex flex-col max-h-[80vh] pointer-events-auto transition-all duration-300">
      <h3 className="text-xs font-bold tracking-wider uppercase text-emerald-400 mb-4 flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        Живой лог угроз (Жюри)
      </h3>
      
      <div className="overflow-y-auto pr-2 flex-1 flex flex-col gap-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
        {incidents.length === 0 ? (
          <p className="text-white/50 text-sm text-center py-4">Нет зафиксированных угроз</p>
        ) : (
          incidents.map((incident) => (
            <div key={incident.id} className="bg-white/10 rounded-xl p-3 border border-white/5 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  incident.status === 'verified' 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}>
                  {incident.status === 'verified' ? 'Подтверждено' : 'Ожидает консенсус'}
                </span>
                <span className="text-[10px] text-white/40 font-mono">
                  {new Date(incident.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                </span>
              </div>
              <p className="text-sm text-white/90 leading-tight">
                {incident.description}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
