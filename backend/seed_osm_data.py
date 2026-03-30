import asyncio
import osmnx as ox
from shapely.geometry import LineString
from sqlalchemy import text
import sys

sys.path.append(".")

from database import AsyncSessionLocal

async def seed_real_city():
    print("🌍 Подключение к базе данных UrbanBlind...")
    async with AsyncSessionLocal() as session:
        print("🧹 Очистка старых моковых данных из графа...")
        await session.execute(text("TRUNCATE TABLE edges, nodes RESTART IDENTITY CASCADE;"))
        await session.commit()

        print("📡 Скачивание 1.5 км реальных пешеходных дорог центра Казани через OSMnx (может занять пару минут)...")
        # (55.7963, 49.1088) — координаты Казани, dist=1500 (1.5 км)
        G = ox.graph_from_point((55.7963, 49.1088), dist=1500, network_type='walk')
        
        print(f"✅ Граф скачан! Найдено узлов: {len(G.nodes)}, Ребер: {len(G.edges)}")
        
        # ======= Шаг В: Сохранение УЗЛОВ =======
        print("💾 Инсерт узлов в PostGIS (с пространственными индексами)...")
        for node_id, data in G.nodes(data=True):
            insert_node_query = text("""
                INSERT INTO nodes (id, geom) 
                VALUES (:id, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
            """)
            await session.execute(insert_node_query, {
                "id": node_id,    # Используем уникальный идентификатор OpenStreetMap
                "lon": data['x'], # Долгота
                "lat": data['y']  # Широта
            })
            
        # ======= Шаг Г: Сохранение РЕБЕР =======
        print("💾 Инсерт дорог в PostGIS и сборка геометрии...")
        for u, v, data in G.edges(data=True):
            # Дистанция (в метрах) служит нашей "базовой ценой" преодоления ребра
            # Иногда 'length' может быть массивом, берем первый элемент
            length = data.get('length', 10.0)
            if isinstance(length, list):
                length = length[0]
            
            # Извлекаем кривизну и точную геометрию дороги (LineString) от OSM
            geom = data.get('geometry')
            
            if geom:
                # Если OSM отдает извилистую дорожку
                geom_wkt = geom.wkt
            else:
                # Если дорожка прямая как стрела, строим линию сами
                u_data = G.nodes[u]
                v_data = G.nodes[v]
                geom_wkt = LineString([(u_data['x'], u_data['y']), (v_data['x'], v_data['y'])]).wkt

            insert_edge_query = text("""
                INSERT INTO edges (start_node_id, end_node_id, base_weight, current_risk_weight, geom)
                VALUES (:start_id, :end_id, :weight, 0, ST_GeomFromText(:geom_wkt, 4326))
            """)
            
            await session.execute(insert_edge_query, {
                "start_id": u,
                "end_id": v,
                "weight": float(length),
                "geom_wkt": geom_wkt
            })
            
        await session.commit()
    print("🏆 Реальный фрагмент города загружен в движок UrbanBlind!")

if __name__ == "__main__":
    if sys.platform == 'win32':
        # Необходимый патч для Windows и asyncio
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(seed_real_city())
