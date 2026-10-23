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
  // Si el script está ligado a una hoja (Extensiones ▸ Apps Script) déjalo así.
  // Si es un script independiente, pon aquí el ID de la hoja:
  SHEET_ID: '',
  // Filas mínimas entre el envío y la llegada del formulario (dificulta bots)
  MIN_SEGUNDOS: 2,
  AVISAR_A: ''            // correo opcional para recibir cada confirmación
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
      hoja.appendRow(['codigo', 'nombre', 'cupo', 'telefono', 'notas']);
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
      if (String(fila[rCod]).trim().toUpperCase() === codigo.toUpperCase() &&
          String(fila[rAsi]) === 'si') { confirmado = true; }
    }

    return json_({
      ok: true, encontrada: true, nombre: invitacion.nombre,
      cupo: invitacion.cupo, confirmado: confirmado
    });
  } catch (err) {
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

    if (CFG.AVISAR_A && asiste === 'si') {
      MailApp.sendEmail({
        to: CFG.AVISAR_A,
        subject: `Confirmación: ${nombre}${acompanante ? ' + ' + acompanante : ''}`,
        body: `${nombre} confirmó ${personas} persona(s).\n` +
              `Código: ${codigo || '(sin código)'}\nCupo de la invitación: ${cupo}\n` +
              `Restricciones: ${restricciones || '—'}\nMensaje: ${mensaje || '—'}`
      });
    }

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
  const n = sincronizarInvitados();     // crea o actualiza, nunca duplica
  actualizarResumen_();
  Logger.log('Invitaciones sincronizadas: ' + n);
  Logger.log('Listo. Ahora publica: Implementar ▸ Nueva implementación ▸ Aplicación web.');
  Logger.log('Ejecutar como: yo · Quién tiene acceso: cualquier persona.');
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