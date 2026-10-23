/**
 * ══════════════════════════════════════════════════════════════════════
 *  Guevara & Wermuth — confirmación de asistencia
 *  Backend en Google Apps Script: guarda las respuestas en una Hoja de
 *  Cálculo de Google (sin servidor, sin costo, sin base de datos).
 *
 *  Instalación (5 minutos): ver backend/README.md
 *  ══════════════════════════════════════════════════════════════════════
 */

/** ── Configuración ─────────────────────────────────────────────────── */
const CFG = {
  HOJA_INVITACIONES: 'Invitaciones',
  HOJA_RESPUESTAS: 'Confirmaciones',
  HOJA_CONFIG: 'Config',
  // Si el script está ligado a una hoja (Extensiones ▸ Apps Script) déjalo así.
  // Si es un script independiente, pon aquí el ID de la hoja:
  SHEET_ID: '',
  // Dirección pública del sitio: con ella se arman los enlaces de cada fila.
  // Si algún día ponen dominio propio, se cambia aquí y se pulsa
  // Ejecutar ▸ sincronizarInvitados (las fórmulas se rehacen solas).
  SITIO: 'https://boda-guevara-wermuth.artechstudio.net/',
  // Filas mínimas entre el envío y la llegada del formulario (dificulta bots)
  MIN_SEGUNDOS: 2,
  // Avisos por correo: NO se usan a propósito. Para enterarte de cada
  // confirmación, en la hoja: Herramientas ▸ Configuración de notificaciones.
  // (MailApp pedía permiso restringido y provocaba el aviso de Google.)
};

/** ── Lista de invitados ─────────────────────────────────────────────
 *  ÚNICO lugar donde se edita la lista: [codigo, nombre, cupo, telefono, notas]
 *  El número del código debe ser el número de lugares (GW-02 → 2).
 *  Se aplica a la hoja con: Ejecutar ▸ sincronizarInvitados
 *  (no borra nada: crea o actualiza por código).
 *  ──────────────────────────────────────────────────────────────────── */
const INVITADOS = [
  ['GW-01', 'Ana Lucía Martínez',    1, '', ''],
  ['GW-02', 'Familia Guevara',       2, '', ''],
  ['GW-03', 'Los Hernández',         2, '', '']
];

/** ── Utilidades ────────────────────────────────────────────────────── */
function libro_() {
  return CFG.SHEET_ID
    ? SpreadsheetApp.openById(CFG.SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function hoja_(nombre) {
  const libro = libro_();
  let hoja = libro.getSheetByName(nombre);
  if (!hoja) {
    hoja = libro.insertSheet(nombre);
    if (nombre === CFG.HOJA_INVITACIONES) {
      hoja.appendRow(['codigo', 'nombre', 'cupo', 'telefono', 'notas', 'enlace', 'mensaje']);
      hoja.setColumnWidth(6, 430);
      hoja.setColumnWidth(7, 430);
      hoja.getRange('A1:E1').setFontWeight('bold');
      hoja.setFrozenRows(1);
    } else {
      hoja.appendRow([
        'marca_tiempo', 'codigo', 'nombre', 'asiste', 'cupo',
        'acompanante', 'personas', 'restricciones', 'mensaje', 'actualizaciones'
      ]);
      hoja.getRange('A1:J1').setFontWeight('bold');
      hoja.setFrozenRows(1);
      hoja.setColumnWidth(1, 160);
      hoja.setColumnWidth(9, 320);
    }
  }
  return hoja;
}

/** Responde JSON (Apps Script ya agrega las cabeceras CORS). */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function texto_(v, max) {
  if (v === null || v === undefined) return '';
  // quita etiquetas y caracteres de control; nunca se confía en el cliente
  const limpio = String(v)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpio.slice(0, max);
}

/** ── GET: datos de una invitación (?code=GW-02) ─────────────────────── */
function doGet(e) {
  try {
    const codigo = texto_(e && e.parameter ? e.parameter.code : '', 40);
    if (!codigo) return json_({ ok: false, error: 'falta el código' });

    const hoja = hoja_(CFG.HOJA_INVITACIONES);
    const datos = hoja.getDataRange().getValues();
    const enc = datos.shift() || [];
    const iCod = enc.indexOf('codigo');
    const iNom = enc.indexOf('nombre');
    const iCup = enc.indexOf('cupo');

    let invitacion = null;
    for (const fila of datos) {
      if (!fila || fila[iCod] === undefined) continue;      // fila vacía
      if (String(fila[iCod]).trim().toUpperCase() === codigo.toUpperCase()) {
        invitacion = {
          nombre: String(fila[iNom] || ''),
          cupo: Number(fila[iCup] || 1) === 2 ? 2 : 1
        };
        break;
      }
    }
    if (!invitacion) return json_({ ok: true, encontrada: false, cupo: 1, nombre: '' });

    // ¿ya respondió?
    const resp = hoja_(CFG.HOJA_RESPUESTAS).getDataRange().getValues();
    const encR = resp.shift() || [];
    const rCod = encR.indexOf('codigo');
    const rAsi = encR.indexOf('asiste');
    let confirmado = false;
    for (const fila of resp) {
      if (!fila || fila[rCod] === undefined) continue;      // fila vacía
      if (String(fila[rCod]).trim().toUpperCase() === codigo.toUpperCase() &&
          String(fila[rAsi]) === 'si') { confirmado = true; }
    }

    return json_({
      ok: true, encontrada: true, nombre: invitacion.nombre,
      cupo: invitacion.cupo, confirmado: confirmado
    });
  } catch (err) {
    Logger.log(err.stack || String(err));
    return json_({ ok: false, error: String(err) });
  }
}

/** ── POST: registrar o actualizar una respuesta ─────────────────────── */
function doPost(e) {
  const bloqueo = LockService.getScriptLock();
  try {
    bloqueo.waitLock(20000);

    const cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // 1) frenos anti-bot
    if (cuerpo.website) return json_({ ok: true, ignorado: true });     // honeypot
    const enviado = Number(cuerpo.ts) || 0;
    if (enviado && (Date.now() - enviado) / 1000 < CFG.MIN_SEGUNDOS) {
      return json_({ ok: true, ignorado: true });
    }

    // 2) validación (el cliente valida, pero el servidor manda)
    const codigo = texto_(cuerpo.code, 40);
    const nombre = texto_(cuerpo.nombre, 80);
    const asiste = cuerpo.asiste === 'si' ? 'si' : 'no';
    const restricciones = texto_(cuerpo.restricciones, 140);
    const mensaje = texto_(cuerpo.mensaje, 400);

    if (nombre.length < 3) return json_({ ok: false, error: 'Nombre inválido' });
    if (!/^[A-Za-zÁÉÍÓÚÜÑÇáéíóúüñç' .-]{3,80}$/.test(nombre)) {
      return json_({ ok: false, error: 'El nombre tiene caracteres no permitidos' });
    }

    // 3) cupo real desde la hoja de invitaciones (nunca del cliente)
    let cupo = 1;
    let invitado = '';
    const hojaInv = hoja_(CFG.HOJA_INVITACIONES);
    const inv = hojaInv.getDataRange().getValues();
    const encI = inv.shift() || [];
    const iCod = encI.indexOf('codigo'), iNom = encI.indexOf('nombre'), iCup = encI.indexOf('cupo');
    for (const fila of inv) {
      if (codigo && String(fila[iCod]).trim().toUpperCase() === codigo.toUpperCase()) {
        cupo = Number(fila[iCup]) === 2 ? 2 : 1;
        invitado = String(fila[iNom] || '');
        break;
      }
    }

    let acompanante = cupo === 2 ? texto_(cuerpo.acompanante, 80) : '';
    const personas = asiste === 'si' ? (acompanante ? 2 : 1) : 0;

    // 4) ¿ya existía una respuesta para este código/nombre?
    const hojaResp = hoja_(CFG.HOJA_RESPUESTAS);
    const datos = hojaResp.getDataRange().getValues();
    const encR = datos.shift() || [];
    const col = n => encR.indexOf(n);
    let filaExistente = -1;
    for (let i = 0; i < datos.length; i++) {
      const fila = datos[i];
      const mismoCodigo = codigo && String(fila[col('codigo')]).trim().toUpperCase() === codigo.toUpperCase();
      const mismoNombre = !codigo && String(fila[col('nombre')]).trim().toLowerCase() === nombre.toLowerCase();
      if (mismoCodigo || mismoNombre) filaExistente = i + 2;
    }

    const sello = Utilities.formatDate(new Date(), 'America/El_Salvador', 'yyyy-MM-dd HH:mm:ss');

    if (filaExistente > 0) {
      const previas = Number(hojaResp.getRange(filaExistente, col('actualizaciones') + 1).getValue() || 0) + 1;
      hojaResp.getRange(filaExistente, 1, 1, 10).setValues([[
        sello, codigo, nombre, asiste, cupo, acompanante, personas,
        restricciones, mensaje, previas
      ]]);
    } else {
      hojaResp.appendRow([
        sello, codigo, nombre, asiste, cupo, acompanante, personas,
        restricciones, mensaje, 0
      ]);
    }

    // 5) resumen de cupos por invitación (hoja de control del organizador)
    actualizarResumen_();

    Logger.log(`Confirmación: ${nombre} · ${personas} persona(s) · código ${codigo || '(sin)'}`);

    return json_({ ok: true, actualizado: filaExistente > 0, cupo: cupo, personas: personas });
  } catch (err) {
    Logger.log(err.stack || String(err));   // queda en Ejecuciones del editor
    return json_({ ok: false, error: String(err) });
  } finally {
    try { bloqueo.releaseLock(); } catch (_) {}
  }
}

/** ── Hoja de resumen para consultar rápido ──────────────────────────── */
function actualizarResumen_() {
  const libro = libro_();
  let res = libro.getSheetByName('Resumen');
  if (!res) {
    res = libro.insertSheet('Resumen');
    res.appendRow(['Asisten (personas)', 'Invitaciones que asisten', 'No asisten', 'Sin responder', 'Total respondidas']);
    res.getRange('A1:E1').setFontWeight('bold');
  }
  const resp = hoja_(CFG.HOJA_RESPUESTAS).getDataRange().getValues();
  const enc = resp.shift() || [];
  const cP = enc.indexOf('personas'), cA = enc.indexOf('asiste');
  let personas = 0, si = 0, no = 0;
  for (const f of resp) {
    if (String(f[cA]) === 'si') { personas += Number(f[cP] || 0); si++; }
    else no++;
  }
  const inv = hoja_(CFG.HOJA_INVITACIONES).getDataRange().getValues();
  inv.shift();
  const sinResponder = Math.max(0, inv.length - si - no);
  res.getRange(2, 1, 1, 5).setValues([[personas, si, no, sinResponder, si + no]]);
}

/** ══════════════════════════════════════════════════════════════════════
 *  PREPARACIÓN — ejecutar UNA VEZ desde el editor de Apps Script
 *  (menú Ejecutar ▸ preparar). Crea las hojas, encabezados y 2 ejemplos.
 *  ══════════════════════════════════════════════════════════════════════ */
function preparar() {
  hoja_(CFG.HOJA_INVITACIONES);
  hoja_(CFG.HOJA_RESPUESTAS);
  prepararConfig_();
  const n = sincronizarInvitados();     // crea o actualiza, nunca duplica
  actualizarResumen_();
  Logger.log('Invitaciones sincronizadas: ' + n);
  Logger.log('Listo. Ahora publica: Implementar ▸ Nueva implementación ▸ Aplicación web.');
  Logger.log('Ejecutar como: yo · Quién tiene acceso: cualquier persona.');
}

/** ── Configuración desde la hoja ──────────────────────────────────────
 *  La pestaña "Config" guarda lo que puede cambiar sin tocar el código:
 *    sitio  → dirección pública (de ahí salen los enlaces de cada invitado)
 *    fecha  → cómo se escribe la fecha en el mensaje de WhatsApp
 *    lugar  → el lugar en ese mismo mensaje
 *  Si falta la pestaña o una fila, se usa el valor de CFG aquí abajo.
 *  ──────────────────────────────────────────────────────────────────── */
function valorConfig_(clave, porDefecto) {
  try {
    const hoja = libro_().getSheetByName(CFG.HOJA_CONFIG);
    if (hoja) {
      const filas = hoja.getDataRange().getValues();
      for (const f of filas) {
        if (String(f[0] || '').trim().toLowerCase() === clave) {
          const v = String(f[1] || '').trim();
          if (v) return v;
        }
      }
    }
  } catch (err) {
    Logger.log('Config: ' + (err.stack || err));
  }
  return porDefecto;
}

function sitio_() { return valorConfig_('sitio', CFG.SITIO); }

/** Crea la pestaña Config si no existe (no pisa lo que ya haya). */
function prepararConfig_() {
  const libro = libro_();
  let hoja = libro.getSheetByName(CFG.HOJA_CONFIG);
  if (!hoja) hoja = libro.insertSheet(CFG.HOJA_CONFIG);
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(['clave', 'valor']);
    hoja.appendRow(['sitio', CFG.SITIO]);
    hoja.appendRow(['fecha', 'sábado 14 de noviembre a las 5:00 p.m.']);
    hoja.appendRow(['lugar', 'Pampa el Volcán']);
    hoja.getRange('A1:B1').setFontWeight('bold');
    hoja.setColumnWidth(1, 120);
    hoja.setColumnWidth(2, 460);
    hoja.setFrozenRows(1);
    Logger.log('Pestaña Config creada.');
  }
  return hoja;
}

/** ── Enlaces automáticos ─────────────────────────────────────────────
 *  Escribe en la hoja dos columnas calculadas:
 *    F  enlace   → la URL completa para el invitado (?i=CODIGO)
 *    G  mensaje  → texto listo para pegar en WhatsApp, con el cupo correcto
 *
 *  Se escriben como VALORES (no fórmulas) y se recalculan solas con onEdit:
 *  en cuanto alguien escribe o corrige el código, el nombre o el cupo en
 *  A, B o C, las columnas F y G se actualizan. Así funciona igual con la
 *  hoja en español, en inglés o en cualquier idioma (las fórmulas en inglés
 *  dan #ERROR! en una hoja en español).
 *  ──────────────────────────────────────────────────────────────────── */

/** onEdit: se dispara al editar la hoja. Mantiene F y G al día. */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const hoja = e.range.getSheet();
    if (hoja.getName() !== CFG.HOJA_INVITACIONES) return;
    const primera = e.range.getRow();
    const cuantas = e.range.getNumRows();
    if (e.range.getColumn() > 3) return;          // sólo A, B o C
    for (let i = 0; i < cuantas; i++) {
      const fila = primera + i;
      if (fila >= 2) actualizarFila_(hoja, fila);
    }
  } catch (err) {
    Logger.log('onEdit: ' + (err.stack || err));
  }
}

/** Recalcula el enlace y el mensaje de una fila concreta. */
function actualizarFila_(hoja, fila) {
  const v = hoja.getRange(fila, 1, 1, 3).getValues()[0];
  const codigo = String(v[0] || '').trim();
  const nombre = String(v[1] || '').trim();
  const cupo = Number(v[2] || 1) === 2 ? 2 : 1;

  if (!codigo) {
    hoja.getRange(fila, 6, 1, 2).setValues([['', '']]);
    return;
  }
  hoja.getRange(fila, 6).setValue(enlaceDe_(codigo));
  hoja.getRange(fila, 7).setValue(nombre ? mensajeDe_(codigo, nombre, cupo) : '');
}

/** Recorre todas las filas con código: un solo clic deja todo listo. */
function rehacerEnlaces() {
  const hoja = hoja_(CFG.HOJA_INVITACIONES);
  const ultima = hoja.getLastRow();
  let n = 0;
  for (let fila = 2; fila <= ultima; fila++) {
    const codigo = String(hoja.getRange(fila, 1).getValue() || '').trim();
    if (!codigo) continue;
    actualizarFila_(hoja, fila);
    n++;
  }
  hoja.getRange(1, 6).setValue('enlace').setFontWeight('bold');
  hoja.getRange(1, 7).setValue('mensaje').setFontWeight('bold');
  hoja.getRange('F2:F').setVerticalAlignment('top');
  hoja.getRange('G2:G').setWrap(true);     // toda la columna, también las filas futuras
  hoja.setColumnWidth(6, 430);
  hoja.setColumnWidth(7, 430);
  hoja.setFrozenRows(1);
  Logger.log('Enlaces actualizados en ' + n + ' invitación(es).');
  return n;
}

function enlaceDe_(codigo) {
  const base = String(sitio_() || '').replace(/\/+$/, '');
  return base + '/?i=' + encodeURIComponent(codigo);
}

function mensajeDe_(codigo, nombre, cupo) {
  const cupoTexto = cupo === 2 ? 'Les reservamos 2 lugares.' : 'Te reservamos 1 lugar.';
  const cuando = valorConfig_('fecha', 'sábado 14 de noviembre a las 5:00 p.m.');
  const donde = valorConfig_('lugar', 'Pampa el Volcán');
  return '¡Hola ' + nombre + '!' + '\n\n' +
         'Nos casamos el ' + cuando + ' en ' + donde + '.' + '\n\n' +
         cupoTexto + ' Confirma aquí:' + '\n' +
         enlaceDe_(codigo) + '\n\n' +
         '¡Ojalá puedan acompañarnos!';
}

/** Aplica la constante INVITADOS a la hoja "Invitaciones".
 *  Si el código ya existe, actualiza sus datos; si no, lo agrega.
 *  Se puede ejecutar cuantas veces se quiera: es idempotente. */
function sincronizarInvitados() {
  const hoja = hoja_(CFG.HOJA_INVITACIONES);
  const datos = hoja.getDataRange().getValues();
  const enc = datos.shift() || [];
  const iCod = enc.indexOf('codigo');
  if (iCod < 0) throw new Error('La hoja Invitaciones no tiene la columna "codigo"');

  const porCodigo = {};
  datos.forEach(function (fila, i) {
    const c = String(fila[iCod]).trim().toUpperCase();
    if (c) porCodigo[c] = i + 2;          // +2: encabezado + índice base 1
  });

  let creadas = 0, actualizadas = 0;
  INVITADOS.forEach(function (f) {
    const codigo = String(f[0]).trim();
    const nombre = String(f[1] || '').trim();
    const cupo = Number(f[2]) === 2 ? 2 : 1;
    const telefono = String(f[3] || '');
    const notas = String(f[4] || '');
    const fila = porCodigo[codigo.toUpperCase()];
    if (fila) {
      hoja.getRange(fila, 1, 1, 5).setValues([[codigo, nombre, cupo, telefono, notas]]);
      actualizadas++;
    } else {
      hoja.appendRow([codigo, nombre, cupo, telefono, notas]);
      creadas++;
    }
  });
  rehacerEnlaces();                   // deja la URL y el mensaje en cada fila
  Logger.log('Invitaciones: ' + creadas + ' nuevas, ' + actualizadas + ' actualizadas');
  return INVITADOS.length;
}

/** Atajo equivalente a preparar() para cuando sólo cambió la lista. */
function cargarLista() {
  sincronizarInvitados();
}

/** Prueba rápida del POST sin abrir el navegador. */
function probarEnvio() {
  const res = doPost({ postData: { contents: JSON.stringify({
    code: 'GW-02', nombre: 'Prueba Automática', asiste: 'si',
    acompanante: 'Acompañante de prueba', restricciones: 'ninguna',
    mensaje: 'mensaje de prueba', ts: Date.now() - 5000
  }) } });
  Logger.log(res.getContent());
}