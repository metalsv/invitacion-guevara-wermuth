# Backend en Google Sheets — instalación (5 minutos)

Guarda cada confirmación como una fila en una hoja de cálculo de Google.
No hay servidor que mantener, no cuesta nada y la hoja se puede abrir desde el
teléfono, compartir con quien organice la cena o exportar a Excel.

```
Navegador  ──POST JSON──►  Apps Script (Web App)  ──►  Hoja "Confirmaciones"
                          │
Invitado   ──GET ?code──►  └──►  Hoja "Invitaciones" (cupo de 1 o 2 lugares)
```

---

## Paso 1 · Crear la hoja y el script

1. Entrar a <https://sheets.new> y renombrar el archivo, por ejemplo **Boda GW — confirmaciones**.
2. Menú **Extensiones ▸ Apps Script**.
3. Borrar todo lo que aparece en `Código.gs` y pegar el contenido completo de
   **`backend/apps-script.gs`**.
4. Guardar (💾 o `Ctrl+S`) y ponerle nombre al proyecto: `boda-gw`.

## Si sale «Google no ha verificado esta aplicación»

Es **normal** y no es un problema de seguridad: Google muestra ese aviso a
cualquier script propio que no ha pasado por su revisión (un trámite pensado
para aplicaciones públicas, no para un script personal).

El camino correcto, siendo su propio proyecto:

1. Clic en **Configuración avanzada** (abajo a la izquierda).
2. Clic en **Ir a «Proyecto sin título» (no seguro)**.
3. Revisar los permisos y **Permitir**.

Usted es el autor del script y el único que lo ejecuta; nadie más pasa por esa
pantalla. Los invitados usan la aplicación web publicada, que no pide permisos.

### Por qué salía y qué se cambió

El script usaba `MailApp` para mandarle un correo por cada confirmación. Ese
permiso («enviar correo en tu nombre») es **restringido** y es lo que dispara el
aviso. Se quitó: no hace falta.

Para recibir avisos sin código: en la hoja, **Herramientas ▸ Configuración de
notificaciones ▸ «Se realiza un cambio»**. Llega un correo con cada fila nueva,
sin permisos extra.

Además, `appsscript.json` declara los permisos mínimos (`spreadsheets.currentonly`:
sólo la hoja a la que está ligado el script), así que la pantalla pide mucho menos.

## Permisos mínimos (`appsscript.json`)

En el editor: **⚙ Configuración del proyecto ▸ mostrar el archivo de manifiesto
`appsscript.json`** y pegar el contenido de `backend/appsscript.json`. Deja declarado:

- `spreadsheets.currentonly` — sólo la hoja de la boda, nada más de la cuenta.
- `webapp.executeAs: USER_DEPLOYING` y `access: ANYONE_ANONYMOUS` — al publicar,
  los desplegables ya salen en «Ejecutar como: yo» y «Acceso: cualquier persona».

## Paso 2 · Preparar las hojas

1. En el editor de Apps Script, elegir en la lista de funciones **`preparar`** y pulsar **Ejecutar**.
2. La primera vez Google pide permisos: **Revisar permisos ▸ Elegir cuenta ▸
   Configuración avanzada ▸ Ir a boda-gw (no seguro) ▸ Permitir**.
   (El aviso aparece porque el script es suyo y no está verificado por Google.)
3. Volver a la hoja: deben existir tres pestañas — `Invitaciones`, `Confirmaciones`,
   `Resumen` — con dos invitaciones de ejemplo: `GW-01` (1 lugar) y `GW-02` (2 lugares).

> `Resumen` se recalcula solo en cada confirmación: personas que asisten,
> invitaciones que asisten, que no asisten y cuántas faltan por responder.

## Paso 3 · Publicar como aplicación web

1. **Implementar ▸ Nueva implementación ▸** engrane ▸ **Aplicación web**.
2. Rellenar:
   - **Descripción:** `rsvp v1`
   - **Ejecutar como:** `Yo (su correo)`
   - **Quién tiene acceso:** `Cualquier persona`
3. **Implementar** y copiar la **URL de la aplicación web** (termina en `/exec`).

> «Cualquier persona» es necesario para que el formulario pueda escribir sin que el
> invitado inicie sesión. No expone la hoja: sólo los dos puntos de entrada del script,
> que validan y limitan lo que aceptan.

## Paso 4 · Pegar la URL en el sitio

En `assets/js/config.js`:

```js
endpoint: 'https://script.google.com/macros/s/AKfycb.../exec',
```

Listo. Para comprobarlo, abrir `https://tu-sitio/?i=GW-02` (2 lugares) y confirmar:
la fila aparece en la pestaña `Confirmaciones` en 1 o 2 segundos.

## Las columnas `enlace` y `mensaje` se generan solas

En la hoja `Invitaciones` hay dos columnas calculadas (fórmulas, no texto):

| Columna | Qué hace |
|---|---|
| **F · enlace** | Arma la URL completa con el código de esa fila: `https://sitio/?i=GW-02`. Si la fila está vacía, queda en blanco. |
| **G · mensaje** | Arma el texto de WhatsApp con el nombre, la fecha, la dirección y **el cupo correcto** («Te reservamos 1 lugar» / «Les reservamos 2 lugares»). |

Basta escribir `codigo`, `nombre` y `cupo` en A, B y C: F y G aparecen solas, al
instante. No hay que copiar URLs a mano (ahí es donde se cometen los errores).

Las fórmulas cubren las filas con datos **más 25 de margen** (mínimo 30 filas),
así la hoja no se ve gigante. Si agrega más invitaciones que ese margen, ejecute
`sincronizarInvitados` otra vez y el rango se amplía solo.

Para copiar el mensaje: clic en la celda de G y *Ctrl+C*; se pega en WhatsApp con
sus saltos de línea.

Si algún día cambia el dominio, se edita `CFG.SITIO` arriba del script y se
ejecuta `sincronizarInvitados` una vez: las fórmulas se rehacen con la dirección
nueva.

## Paso 5 · Cargar la lista real de invitados

En la pestaña **Invitaciones**, una fila por invitación:

| codigo | nombre | cupo | telefono | notas |
|---|---|---|---|---|
| GW-01 | Ana Lucía Martínez | 1 | 7000-0000 | |
| GW-02 | Familia Guevara | 2 | | los papás |

- `codigo`: identificador único, sin espacios (se usa en el enlace `?i=GW-02`).
  Recomendación: **que el número final sea el número de lugares** — `GW-01` para
  una invitación de 1, `GW-02` para 2, `GW-12` para un grupo de 12.
- `nombre`: como se quiere que aparezca («Familia Guevara», «Ana Lucía Martínez»).
- `cupo`: **1** o **2**. Cualquier otro valor se interpreta como 1.

---

## Cómo se consulta

- **Pestaña `Confirmaciones`**: una fila por invitación (se actualiza si la persona
  vuelve a responder; la columna `actualizaciones` cuenta los cambios).
- **Pestaña `Resumen`**: totales para cocinar y para el salón.
- **Filtros**: `Datos ▸ Crear filtro` y filtrar `asiste = si`.
- **Al correo**: opcional — en `CFG.AVISAR_A` del script poner un correo y cada
  confirmación llega como notificación.

## Notas técnicas

- El cliente envía `POST` con `Content-Type: text/plain` a propósito: así el
  navegador no hace la petición de comprobación previa (preflight) que Apps Script
  no responde. El script lee el JSON desde `e.postData.contents`.
- `LockService` evita que dos confirmaciones simultáneas se pisen.
- **Validación doble**: el navegador valida para dar buen mensaje, el script vuelve a
  validar (largo, caracteres, y que el cupo venga de la hoja, no del cliente).
- **Anti-bot**: campo trampa invisible (`website`) + tiempo mínimo de 2 s entre la
  carga y el envío. Si se dispara, responde `ok` sin guardar.
- Para cambiar de hoja sin volver a publicar: poner el ID en `CFG.SHEET_ID`.
- Si se edita el script, hay que crear **nueva implementación** (o `Implementar ▸
  Administrar implementaciones ▸ editar ▸ Versión: nueva`) para que el sitio vea los
  cambios; la URL `/exec` se mantiene.

## Prueba sin salir del editor

Ejecutar la función **`probarEnvio`**: escribe una fila de prueba en
`Confirmaciones` y devuelve el JSON en el registro. Si eso funciona, el sitio también.

## Si algún día quieren migrar

El contrato es mínimo y está documentado en `app.js`: `GET ?code=` para leer la
invitación y `POST` con JSON para guardar. Cualquier backend (Supabase, Airtable,
una API propia) que respete esas dos rutas funciona sin tocar el frontend.