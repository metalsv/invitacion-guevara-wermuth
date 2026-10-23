# «1 lugar reservado» vs «2 lugares reservados» — cómo se resuelve

## El punto de partida

En la invitación impresa el cupo **no es una pregunta, es un dato**: la tarjeta ya dice
"Espacio reservado: 1" o "Espacio reservado: 2". En la versión web tiene que pasar lo
mismo — el invitado no elige cuántos lugares tiene, sólo confirma si los usa.

Y hay un segundo detalle: si el formulario fuera uno solo para todos, cualquiera podría
poner "vamos 6" y no habría manera de saber quién tiene derecho a cuántos.

## Las opciones que existen (y cuál conviene)

| Enfoque | Cómo funciona | Riesgo / costo | ¿Cuándo? |
|---|---|---|---|
| **A. Enlace único por invitación** ✅ | La URL lleva un código (`?i=GW-01`). El cupo vive en la hoja de cálculo; el sitio lo muestra y el servidor lo hace respetar | Hay que generar y repartir enlaces uno por uno (automatizado aquí) | **Recomendado.** Es el estándar de las webs de boda (Zola, The Knot, Joy) |
| B. Dos páginas: `1lugar.html` y `2lugares.html` | Dos archivos iguales con el número cambiado | Nadie impide reenviar el de 2 lugares; no se sabe quién confirmó sin pedir el nombre; dos copias del diseño que se desincronizan | Solo si son literalmente dos grupos y no importa el control |
| C. Un solo formulario libre | El invitado escribe cuántas personas vienen | Se llena de "vamos 5"; hay que llamar a corregir | Nunca para una boda sentada |
| D. Formularios separados (uno por grupo) | Un Google Form por invitación o por cupo | Decenas de formularios, respuestas dispersas, nada de diseño propio | No escala |
| E. Código visible que el invitado escribe | "Ingresa el código de tu invitación" | Fricción y errores de tipeo; la gente escribe el código del primo | Solo si se pierde el enlace |

## Lo que se hace en la práctica (y está implementado aquí)

1. **Un enlace por invitación.** Cada invitación recibe una URL única:
   `https://tu-sitio/?i=GW-02`. Conviene que **el número del código sea el número
   de lugares** (`GW-01` = 1 lugar, `GW-02` = 2): así el enlace se identifica de
   un vistazo y no hay confusión al repartirlos. `tools/generar-enlaces.py` avisa
   si el código y la columna `cupo` no coinciden.
2. **El cupo viene del servidor.** Al abrir el enlace, el sitio consulta la hoja y pinta
   "Espacio reservado: 2". Si alguien cambia el `2` por un `9` en la URL, no pasa nada:
   el cupo se vuelve a leer de la hoja al guardar (`doPost` en `apps-script.gs`).
3. **El formulario solo pide lo que falta saber:** ¿vienes?, nombre de quien confirma y,
   si el cupo es 2, el nombre del acompañante. Nada de "número de personas".
4. **Se puede cambiar de opinión.** Volver a entrar al mismo enlace y responder otra vez
   **actualiza** la fila (columna `actualizaciones`), no duplica.
5. **Cierre con fecha límite.** "Te pedimos confirmar antes del 7 de noviembre" en el
   panel del formulario; después de esa fecha la lista ya está cerrada para el salón.
6. **Después de confirmar:** el sitio muestra el resumen, el botón para agregar el evento
   al calendario y el enlace «cómo llegar». Eso reduce los "¿a qué hora era?".

### Cómo se ve en la hoja

| codigo | nombre | cupo | asiste | acompanante | personas |
|---|---|---|---|---|---|
| GW-01 | Ana Lucía Martínez | 1 | si | | 1 |
| GW-02 | Familia Guevara | 2 | si | María López | 2 |
| GW-03 | Los Hernández | 2 | no | | 0 |

`personas` lo calcula el script: es el número que se le pasa al salón.

## Casos borde y qué hacer

| Situación | Qué hacer |
|---|---|
| **Quiere traer a alguien y sólo tiene 1 lugar** | El campo del acompañante ni aparece. Si insiste, se resuelve por fuera (teléfono) y se le sube el cupo en la hoja: la próxima vez que abra su enlace verá 2 |
| **Confirma y luego no puede** | Vuelve a su enlace y marca "No podré asistir": la fila se actualiza a `personas = 0` |
| **Confirma por el grupo familiar** | Es lo normal: el nombre es el de la invitación ("Familia Guevara") y el acompañante cubre al segundo lugar |
| **Niños** | Se deciden antes de imprimir: o cuentan como lugar (cupo 2) o se avisa en el texto. No se deja al formulario decidirlo |
| **Se le acabó el tiempo** | La fecha límite es informativa; si necesitan cerrar de verdad, se apaga el formulario poniendo `endpoint: ''` en `config.js` (queda el respaldo por WhatsApp) |
| **Alguien reenvía su enlace** | Puede confirmar por otros, pero sólo con el cupo de esa invitación y el nombre que escriba queda registrado: se detecta al revisar la hoja |
| **Invitación cancelada / duplicada** | Se borra o se marca la fila en `Invitaciones`; el enlace deja de encontrar cupo y cae a 1 lugar |

## Texto sugerido para enviar por WhatsApp

> Hola {nombre}, con mucha alegría te compartimos la invitación de nuestra boda civil:
> {enlace}
> Tu espacio es de {1 lugar reservado / 2 lugares reservados}. Ahí mismo puedes confirmar
> tu asistencia{ y decirnos el nombre de tu acompañante}.
> ¡Te esperamos!
> — Guevara & Wermuth · sábado 14 de noviembre · 5:00 p.m. · Pampa el Volcán

`tools/generar-enlaces.py` arma exactamente ese mensaje (y el enlace `wa.me` listo para
abrir) por cada fila del CSV. No hay que escribir ni un enlace a mano.

---

## Cómo queda montado, en una línea

> El cupo es un atributo de la invitación (hoja `Invitaciones`), el formulario solo
> recoge la decisión, y el servidor valida ambos lados.