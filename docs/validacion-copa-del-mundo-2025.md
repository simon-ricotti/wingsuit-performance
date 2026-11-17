# Validación del motor de puntaje contra la Copa del Mundo FAI 2025

Nov 16, 2026 · @Simon

## Resultado

El motor de la plataforma reprodujo el resultado oficial de los 333 saltos de la Copa del Mundo FAI 2025 (111 de tiempo, 111 de distancia y 111 de velocidad): no hubo ninguna diferencia, ni antes ni después del redondeo del reglamento (5.10.1).

| Qué se comparó | Saltos | Coinciden | Diferencia máxima |
| --- | --- | --- | --- |
| Tiempo (s) | 111 | 111 | 0,00 s |
| Distancia (m) | 111 | 111 | 0,0 m |
| Velocidad (km/h) | 111 | 111 | 0,00 km/h |
| Instante de salida del avión | 333 | 333 dentro de ±0,41 s | mediana −0,11 s |
| Nivel de penalidad de carril | 333 | 330 | 3 casos al límite (ver abajo) |

En penalidades de carril, de los 18 saltos que penalizaron los jueces la plataforma propone el mismo nivel en 17. Las 3 diferencias son casos al límite entre dos niveles, donde decide el criterio del juez.

## Método

Se tomó un campeonato FAI completo, puntuado oficialmente con Skyderby, y se volvió a puntuar cada salto con el motor de la plataforma, sin ajustar nada a mano.

- **Evento:** 5.ª Copa del Mundo FAI de Wingsuit Flying, Prostějov, República Checa, agosto de 2025. 37 competidores, 3 rondas de cada tarea.
- **Datos:** los puntos de GPS de cada salto (FlySight, 5 Hz) y el resultado oficial, tal como los publica Skyderby. Se leyeron el 16 de noviembre de 2026.
- **Configuración del motor:** reglamento FAI 2026 sin cambios. Ventana de 2500 a 1500 m, elevación del DZ de 214 m (la que publica el evento), carril de 600 m desde 9 s después de llegar a 10 m/s, punto de referencia asignado a cada salto.
- **Comparación:** resultado de la tarea sin redondear y redondeado, instante de salida y nivel de penalidad de carril. Las penalidades oficiales son las que fijaron los jueces, con el motivo y la distancia que anotaron.

Antes de correr el evento se verificó que el motor diera exactamente los mismos números en la computadora del organizador y en el entorno de desarrollo, con un salto de prueba fijo.

## Penalidades de carril, salto por salto

La distancia fuera del carril que mide la plataforma quedó casi siempre a pocos metros de la que anotaron los jueces; donde se separa más es en saltos donde el juez midió sobre el mapa. Ordenado por distancia anotada por el juez.

| Competidor | Tarea | Juez: fuera del carril | Juez: penalidad | Plataforma: fuera del carril | Plataforma: penalidad |
| --- | --- | --- | --- | --- | --- |
| Luke Rogers | Tiempo 1 | 460,5 m | 50 % | 459,6 m | 50 % |
| Michal Giláni | Velocidad 1 | 201,5 m | 20 % | 202,6 m | 20 % |
| Lachlan Jensen | Velocidad 2 | 158,6 m | 20 % | 157,1 m | 20 % |
| Jörg Kleine | Tiempo 1 | 153,7 m | 20 % | 142,1 m | **10 %** |
| Enzo Dezulueta | Tiempo 3 | 133,0 m | 10 % | 133,6 m | 10 % |
| Adrien Devilette | Tiempo 1 | 123,6 m | 10 % | 125,4 m | 10 % |
| Luca Sala | Distancia 1 | 116,3 m | 10 % | 99,7 m | 10 % |
| Seyed M. Fattah Hosseini | Distancia 3 | 97,9 m | 10 % | 101,4 m | 10 % |
| Ali Asker | Tiempo 1 | 78,3 m | 10 % | 79,9 m | 10 % |
| Casey Flay | Velocidad 2 | 58,4 m | 10 % | 57,8 m | 10 % |
| Janne Saikko | Velocidad 3 | 33,2 m | 10 % | 33,3 m | 10 % |
| Guillaume Imbert | Tiempo 1 | 30,4 m | 10 % | 29,3 m | 10 % |
| Alessandro Urzi | Tiempo 2 | 29,1 m | 10 % | 30,3 m | 10 % |
| Guillaume Imbert | Tiempo 3 | 22,4 m | 10 % | 23,0 m | 10 % |
| Michal Giláni | Tiempo 1 | 20,0 m | 10 % | 14,0 m | 10 % |
| Marcelo Zoni | Distancia 1 | 12,9 m | 10 % | 12,5 m | 10 % |
| Guillaume Imbert | Distancia 2 | 11,5 m | 10 % | 9,1 m | 10 % |
| Casey Flay | Distancia 2 | 4,8 m | 10 % | 4,3 m | 10 % |
| Jörg Kleine | Velocidad 1 | sin penalidad | 0 % | 0,3 m | **10 %** |
| Liam Brands | Tiempo 3 | sin penalidad | 0 % | 0,4 m | **10 %** |

**Los tres casos distintos**

- **Jörg Kleine, tiempo 1:** el juez midió 153,7 m (apenas pasando el límite de 150 m para el 20 %) y la plataforma 142,1 m. El inicio del carril es muy sensible: en este salto cada segundo de diferencia mueve la medición unos 34 m, y el valor del juez equivale a empezar el carril unos 0,6 s antes.
- **Jörg Kleine, velocidad 1, y Liam Brands, tiempo 3:** la plataforma mide 0,3 y 0,4 m fuera del carril, dentro del error del GPS, y los jueces no penalizaron. Es una decisión de criterio en un caso al límite.

## Conclusiones y límites

El cálculo de tiempo, distancia y velocidad es equivalente al del sistema que puntuó la Copa del Mundo FAI 2025. La penalidad de carril coincide en el nivel en 330 de 333 saltos; los 3 restantes son casos al límite que tiene que decidir un juez.

**Lo que esta prueba no cubre**

- **La lectura de archivos:** se usaron los puntos que publica Skyderby, no los archivos originales del FlySight. La lectura de FlySight y Deep and Steep se probó aparte con los archivos de prueba de Skyderby y con los del entrenamiento.
- **La precisión (SEP):** ningún salto del evento pasó el límite de 10 m, así que no hubo re-saltos para comparar.
- **La separación de 150 m:** el evento no tuvo infracciones, así que no se pudo comparar.
- **Otros eventos:** conviene repetir la prueba con un segundo campeonato, por ejemplo el Mundial 2026, para mostrar que no es un resultado aislado.

**Cambios que se derivan para la plataforma**

- [ ] La penalidad de carril queda como propuesta: el juez la confirma o la cambia, y queda registrado quién la decidió.
- [ ] Marcar como "al límite" todo desvío a menos de 15 m de un cambio de nivel (300, 450 y 600 m del eje), para que el juez lo revise.
- [ ] Mostrar en el mapa el punto de inicio del carril y el punto de máximo desvío, y dejar que el juez ajuste el inicio.

## Fuentes

- [Skyderby, 5.ª Copa del Mundo FAI de Wingsuit Flying](https://www.skyderby.io/events/performance/619): resultados, penalidades y tracks de cada salto.
- [FAI ISC, Reglas de Competencia de Wingsuit Flying, edición 2026](https://www.dfv.aero/downloads/2026_ISC_CR_WS.pdf): definiciones de ventana, validación, carril y redondeo.
- [Skyderby, código abierto](https://github.com/skyderby/skyderby): referencia del cálculo y de la fórmula de SEP.
- [Wingsuit Performance](https://claude.ai/artifact/7wBWLfroc8VepSHQeE8eff): plataforma validada.
