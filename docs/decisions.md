# Decisiones donde el reglamento FAI 2026 no define

- SEP = 0,5127 × (2 × hAcc + vAcc), igual que Skyderby.
- Separación (5.6.3) medida en 3D, sincronizando los saltos por hora GPS.
- Apertura estimada cuando la velocidad total baja de 25 m/s.
- Varias penalidades en un salto se suman, con tope de 100 %.
- Penalidad de carril = propuesta del software. Si el desvío queda a menos de 15 m de 300, 450 o 600 m del eje, el juez tiene que confirmarla. El juez puede correr el inicio del carril ±5 s (cada segundo mueve ~34 m el resultado en casos reales).
- Cambiar una decisión borra las firmas del salto y reabre la tarea si estaba validada.
- Rotación de pasadas (5.5.6): una posición por tarea, tanto las pasadas como los pilotos dentro de cada pasada.
- Equipos en Argentina: club o grupo del perfil del piloto, no la federación nacional. Integrantes configurable (FAI: 3).
- Perfiles de juzgamiento:
  - FAI estricto: 2 revisiones, Flight Director a bordo, GPS o salida fuera de norma → el juez valida o da re-salto.
  - Argentina (club y entrenamiento): 1 revisión, salidas con cronómetro y cámara, GPS y salida fuera de norma solo avisan.
  - Personalizado. La jornada muestra siempre en qué se aparta de FAI.
- Pasada en el mapa (5.5.1, 5.5.4): es solo una ayuda para planificar los puntos y no puntúa. Marca una salida cada 600 m y un carril aproximado desde cada salida a su punto (salida N → punto N, y se vuelve a empezar si hay más salidas que puntos); el carril que puntúa es el de 2.2, desde la posición del piloto al inicio de la validación.
- Calcular la pasada (`/jump-run`, 5.5.1 y 5.5.4): perpendicular al viento de ~3000 m (700 hPa del pronóstico de Open-Meteo, o el que se cargue), con el centro a la distancia a barlovento del aterrizaje que se elija. El avión vuela cruzado al viento: velocidad sobre el suelo √(TAS² − viento²), y los segundos entre salidas se redondean hacia arriba para no bajar de la separación. Avisa si el viento o las ráfagas en el suelo pasan de 11 m/s. No puntúa; el plan queda en el navegador y se trae desde los ajustes de la jornada.
- Ranking público: cuentan solo las jornadas publicadas, de competencia o de entrenamiento, con la ventana FAI de 2500 a 1500 m. Cada salto se puntúa dentro de su jornada, con sus penalidades (5.10.1), y se compara el resultado (s, m o km/h), no el porcentaje. No cuentan los saltos anulados ni los que quedaron en cero.
- Saltos sueltos (`/tracks`): se puntúan en el navegador con la ventana FAI y la elevación que se elija; no se guardan ni cuentan para el ranking.

# Validación hecha
- Copa del Mundo FAI 2025 (Skyderby, competencia 619): 333 de 333 saltos con el resultado oficial. Salida ±0,41 s.
- Penalidad de carril: mismo nivel en 17 de 18 penalizados. Diferencia: Kleine, Tiempo 1 (juez 153,7 m → 20 %; plataforma 142,1 m → 10 %). Dos casos a 0,3 y 0,4 m del límite que los jueces no penalizaron.
