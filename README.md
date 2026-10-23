# Invitación digital — Guevara & Wermuth

Invitación web con confirmación de asistencia, hecha a partir del diseño original:
mismo fondo verde petróleo, misma caligrafía, mismo marco y las **mismas flores del
arte original** (recortadas de la imagen y limpiadas de texto).

- Invitación: `index.html` — reproduce la tarjeta 1:1 (proporción 1024 × 1536).
- Confirmación: formulario debajo, con cupo reservado (**1 o 2 lugares**) por invitación.
- Guardado: Google Sheets vía Google Apps Script (gratis, sin servidor) o un endpoint propio.
- Extras: evento para el calendario (`.ics` y Google Calendar) y enlace «cómo llegar».

Sin dependencias, sin compilación: son archivos estáticos. Peso total de la página
(HTML + CSS + JS) **≈ 12 KB gzip**; con fuentes e imágenes, ~210 KB la primera visita.

---

## 1. Ver la invitación ahora

```bash
cd "/home/patrick/Documentos/formulario boda aida"
./ver.sh
```

Eso imprime algo así:

```
  Invitación en marcha. Abre en el navegador:
    http://127.0.0.1:8787/?i=GW-01     ← 1 lugar  (Ana Lucía)
    http://127.0.0.1:8787/?i=GW-02     ← 2 lugares (Familia Guevara)
    http://localhost:8787/             ← sin código (1 lugar)
    http://10.20.20.96:8787/?i=GW-02   ← desde el teléfono (misma wifi)
```

> ⚠️ **La URL lleva el puerto.** `http://127.0.0.1/` o `http://localhost/` (sin
> `:8787`) no responden: en el puerto 80 de esta máquina no hay nada. Copie la URL
> completa de la lista que imprime el script.
>
> El servidor se queda en primer plano: `Ctrl+C` lo detiene. Si prefiere otro puerto:
> `./ver.sh 9000`.

El servidor de prueba guarda lo que se confirma en `backend/confirmaciones.json`,
así se ve de inmediato si el flujo funciona.

> **En local no hay que configurar nada**: si la página se abre desde
> `127.0.0.1`/`localhost` (o desde la IP de la red local) y no hay `endpoint` en
> `config.js`, usa el backend de pruebas del mismo origen (`/api/rsvp`). Por eso
> `?i=GW-01` muestra 1 lugar y `?i=GW-02` muestra 2 (el número del código dice
> cuántos lugares son). En un dominio real el endpoint es obligatorio.

Para previsualizar un cupo **sin backend**: `?l=2` (o `?l=1`). Es solo vista
previa; cuando hay endpoint, manda el cupo de la hoja de cálculo.

| Qué muestra | Cómo se comprueba |
|---|---|
| Cupo correcto | la tarjeta dice "Espacio reservado: 2", el panel dice "2 lugares" y aparece el campo del acompañante |
| Invitación reconocida | arriba del título del formulario: «Invitación para …» |
| Código que no existe | aviso: «No pudimos verificar los lugares de esta invitación…» |

---

## 2. Conectar la hoja de Google (una sola vez)

Sigue **`backend/README.md`**: son 5 minutos y termina con una URL que se pega en
`assets/js/config.js`, en la línea `endpoint: ''`.

---

## 3. Mandar las invitaciones

1. Arma la lista en un CSV (`codigo,nombre,cupo`), por ejemplo `invitados.csv`.
2. Genera los enlaces y los mensajes:

```bash
python3 tools/generar-enlaces.py invitados.csv https://tu-dominio.com
```

Salen dos archivos: `enlaces.csv` (tabla con el enlace y el enlace de WhatsApp por
invitado) y `mensajes.txt` (un mensaje listo para copiar y pegar). Cada invitado
recibe **su** enlace, y ese enlace ya sabe si tiene 1 o 2 lugares.

---

## 4. Dónde publicarlo

Cualquier hosting estático sirve porque no hay backend propio:

| Opción | Cómo | Costo |
|---|---|---|
| **Netlify Drop** (lo más rápido) | Arrastrar la carpeta en app.netlify.com/drop | gratis |
| **GitHub Pages** | Subir el repo ▸ Settings ▸ Pages ▸ rama `main` | gratis |
| **Cloudflare Pages** | Conectar el repo, build vacío, salida `/` | gratis |
| **Su VPS con Podman + Caddy** | `DESPLIEGUE.md` (mismo esquema que el sitio CBES) | ya lo tiene |

---

## 5. Estructura

```
.
├── index.html                 ← la invitación + el formulario
├── assets/
│   ├── css/styles.css         ← todo el diseño (tokens + tarjeta + formulario)
│   ├── js/config.js           ← ⚠️ aquí se pega el endpoint y los datos del evento
│   ├── js/app.js              ← cupo, validación, envío, calendario
│   ├── fonts/                 ← Great Vibes + EB Garamond (self-hosted, 108 KB)
│   └── img/floral-*.webp      ← adornos recortados del arte original
├── backend/
│   ├── apps-script.gs         ← pegar en Google Apps Script
│   ├── servidor-prueba.py     ← backend falso para probar en local
│   └── README.md              ← instalación paso a paso
├── tools/
│   ├── preparar-imagenes.py   ← regenera los adornos desde la imagen original
│   └── generar-enlaces.py     ← CSV → enlaces + mensajes de WhatsApp
├── INVITACIONES.md            ← cómo se maneja 1 vs 2 lugares
└── DESPLIEGUE.md              ← publicar en Netlify / VPS
```

## 6. Qué se cambia y dónde

| Quiero cambiar… | Archivo |
|---|---|
| Textos de la invitación (nombres, fecha, lugar, hora) | `index.html` |
| Fecha/hora del evento para el calendario y el mapa | `assets/js/config.js` → `evento` |
| URL del backend | `assets/js/config.js` → `endpoint` |
| Fecha límite de confirmación | `index.html` (bloque `.panel__deadline`) |
| Colores, tipografías, medidas de la tarjeta | `assets/css/styles.css` (`:root` y `.card`) |
| Tamaño de la invitación en pantalla grande | `assets/css/styles.css` → `--card-max` (760 px por defecto) |

### Sobre el tamaño en desktop

A partir de 1100 px de ancho el sitio se parte en dos columnas: la invitación a la
izquierda y la confirmación a la derecha (pegada, acompaña el scroll). La invitación
**se lleva el alto de la pantalla**: su ancho es 2/3 del alto disponible, con un mínimo
de 600 px para que nunca se vea chica.

| Pantalla | Ancho de la invitación |
|---|---|
| 1920 × 1080 | 683 px (cabe completa) |
| 1440 × 900 | 600 px (se ve el 97 %) |
| 1366 × 768 | 600 px (se ve el 83 %, se baja un poco) |
| 1024 × 768 y tablets | 560 px, una sola columna |
| 390 (teléfono) | 366 px, a todo el ancho |

Para forzar el modo «póster» (más grande que la pantalla, con scroll) suba el tope:

```css
--card-max: 900px;   /* o cambie el 0.6667 del cálculo por 0.9 */
```

---

## 8. Si algo no cuadra

| Síntoma | Causa más probable | Solución |
|---|---|---|
| Siempre dice «Espacio reservado: 1» | no hay `endpoint` en `config.js` (o el fetch falló) | pegarlo; en local basta con usar `backend/servidor-prueba.py`. La consola del navegador dice exactamente qué pasó |
| Aparece «No pudimos verificar los lugares…» | el código `?i=` no está en la hoja `Invitaciones`, o el Web App no responde | revisar el código y que la URL termine en `/exec` |
| El enlace de 2 lugares muestra 1 | falta la columna `cupo` con valor `2` en esa fila | corregir la hoja (no hace falta republicar el script) |
| El navegador sigue mostrando la versión vieja | caché | subir el `?v=` de `index.html` (`styles.css?v=…`, `app.js?v=…`) |
| «Falta configurar el destino en config.js» al enviar | no hay endpoint ni WhatsApp/correo de respaldo | configurar `endpoint` o, como mínimo, `whatsapp` |