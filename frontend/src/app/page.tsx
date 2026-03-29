import { FloatingSearchBar } from "../components/ui/FloatingSearchBar";
import { BaseMap } from "../components/map/BaseMap";

export default function Home() {
  return (
    <main className="relative w-full h-screen overflow-hidden bg-pearl-gray">
      {/* UI Слой - Плавающая панель поиска и ИИ Юби (z-index выше карты) */}
      <FloatingSearchBar />

      {/* Интерактивная Карта MapLibre */}
      <BaseMap />
    </main>
  );
}
