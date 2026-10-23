#!/usr/bin/env node
/**
 * probar-backend.js — ejecuta backend/apps-script.gs EN LOCAL con una hoja
 * de cálculo falsa, para comprobar que la lógica funciona antes de pegarla
 * en Google Apps Script.
 *
 *   node tools/probar-backend.js
 *
 * Qué valida:
 *   1. preparar() crea las hojas y carga INVITADOS
 *   2. sincronizarInvitados() es idempotente (no duplica al correrlo otra vez)
 *   3. doGet  devuelve nombre y cupo de cada código
 *   4. doPost guarda una confirmación y actualiza el Resumen
 *   5. doPost rechaza un nombre inválido y respeta el honeypot
 *   6. el cupo sale de la hoja, no del cliente (un GW-01 no puede mandar 2)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');
const CODIGO = fs.readFileSync(path.join(RAIZ, 'backend', 'apps-script.gs'), 'utf8');

/* ── Hoja de cálculo falsa ─────────────────────────────────────────── */
class HojaFalsa {
  constructor(nombre) { this.nombre = nombre; this.filas = []; this.formulas = {}; }
  getName() { return this.nombre; }
  appendRow(fila) { this.filas.push(fila.slice()); return this; }
  getLastRow() { return this.filas.length; }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
  getDataRange() {
    const h = this;
    return { getValues: () => h.filas.map(f => f.slice()) };
  }
  getRange(fila, col, nFilas = 1, nCols = 1) {
    const h = this;
    const leer = () => {
      const salida = [];
      for (let i = 0; i < nFilas; i++) {
        const f = h.filas[fila - 1 + i] || [];
        const salidaFila = [];
        for (let j = 0; j < nCols; j++) {
          salidaFila.push(f[col - 1 + j] === undefined ? '' : f[col - 1 + j]);
        }
        salida.push(salidaFila);
      }
      return salida;
    };
    return {
      getValues: leer,
      getValue: () => leer()[0][0],
      setValues(vals) {
        vals.forEach((v, i) => {
          const idx = fila - 1 + i;
          h.filas[idx] = h.filas[idx] || [];
          v.forEach((x, j) => { h.filas[idx][col - 1 + j] = x; });
        });
        return this;
      },
      setValue(x) { h.filas[fila - 1] = h.filas[fila - 1] || []; h.filas[fila - 1][col - 1] = x; return this; },
      setFontWeight() { return this; },
      setWrap() { return this; },
      setVerticalAlignment() { return this; },
      setFormulas(vals) {
        vals.forEach((v, i) => v.forEach((x, j) => {
          h.formulas[(fila + i) + ':' + (col + j)] = x;
        }));
        return this;
      }
    };
  }
}

const libro = {
  hojas: {},
  getSheetByName(n) { return this.hojas[n] || null; },
  insertSheet(n) { this.hojas[n] = new HojaFalsa(n); return this.hojas[n]; }
};

const llamadas = [];
const contexto = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => libro, openById: () => libro },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: txt => ({ _txt: txt, setMimeType() { return this; }, getContent() { return this._txt; } })
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { formatDate: () => '2026-10-01 12:00:00' },
  MailApp: { sendEmail: o => llamadas.push(o) },
  Logger: { log: (...a) => console.log('   ', ...a) }
};
vm.createContext(contexto);
vm.runInContext(CODIGO, contexto);

/* ── Utilidades de prueba ──────────────────────────────────────────── */
let fallos = 0;
function ok(cond, texto, detalle = '') {
  console.log(`  ${cond ? '✓' : '✗'} ${texto}${detalle ? ' → ' + detalle : ''}`);
  if (!cond) fallos++;
}
function post(cuerpo) {
  const r = contexto.doPost({ postData: { contents: JSON.stringify(cuerpo) } });
  return JSON.parse(r.getContent());
}
function get(codigo) {
  const r = contexto.doGet({ parameter: { code: codigo } });
  return JSON.parse(r.getContent());
}
function filaDe(hoja, codigo) {
  return (libro.hojas[hoja]?.filas || []).find(f => String(f[0]) === codigo);
}

/* ── Pruebas ───────────────────────────────────────────────────────── */
console.log('\n1) preparar()');
contexto.preparar();
const inv = libro.hojas['Invitaciones'];
ok(Object.keys(libro.hojas).includes('Confirmaciones'), 'crea la hoja Confirmaciones');
ok(inv.filas.length === 4, 'Invitaciones tiene encabezado + 3 invitados', `${inv.filas.length} filas`);
ok(filaDe('Invitaciones', 'GW-01')?.[2] === 1, 'GW-01 es de 1 lugar');
ok(filaDe('Invitaciones', 'GW-02')?.[2] === 2, 'GW-02 es de 2 lugares');

console.log('\n2) sincronizarInvitados() es idempotente');
contexto.sincronizarInvitados();
contexto.sincronizarInvitados();
ok(inv.filas.length === 4, 'sigue habiendo 3 invitados (no duplica)', `${inv.filas.length} filas`);

console.log('\n2b) enlaces y mensajes calculados (sin fórmulas)');
const inv2 = libro.hojas['Invitaciones'];
const celda = (f, c) => (inv2.filas[f - 1] || [])[c - 1] || '';
ok(String(celda(2, 6)) === 'https://boda-guevara-wermuth.artechstudio.net/?i=GW-01',
   'F2 tiene la URL de GW-01', String(celda(2, 6)));
ok(String(celda(3, 7)).includes('¡Hola Familia Guevara!'), 'G3 saluda por su nombre');
ok(String(celda(3, 7)).includes('Les reservamos 2 lugares'), 'G3 dice «2 lugares» para cupo 2');
ok(String(celda(2, 7)).includes('Te reservamos 1 lugar'), 'G2 dice «1 lugar» para cupo 1');
ok(!/^=/.test(String(celda(2, 6))), 'no son fórmulas (no pueden dar #ERROR! en hoja en español)');

console.log('\n2c) al escribir una invitación nueva, aparece el enlace');
// simula escribir A6, B6, C6 y el onEdit que dispara Google
inv2.filas[5] = ['GUEVARA-A-2', 'Primos Guevara', 2, '', ''];
contexto.onEdit({ range: { getSheet: () => inv2, getRow: () => 6, getNumRows: () => 1, getColumn: () => 1 } });
ok(String(celda(6, 6)) === 'https://boda-guevara-wermuth.artechstudio.net/?i=GUEVARA-A-2',
   'F6 se llenó solo', String(celda(6, 6)));
ok(String(celda(6, 7)).includes('Les reservamos 2 lugares'), 'G6 con el cupo correcto');

console.log('\n2d) al borrar el código se limpia todo');
inv2.filas[5] = ['', '', '', '', ''];
contexto.onEdit({ range: { getSheet: () => inv2, getRow: () => 6, getNumRows: () => 1, getColumn: () => 1 } });
ok(celda(6, 6) === '' && celda(6, 7) === '', 'F6 y G6 quedaron vacías');

console.log('\n2e) el dominio se cambia desde la hoja Config');
const cfg = libro.hojas['Config'];
ok(!!cfg, 'existe la pestaña Config');
cfg.filas[1] = ['sitio', 'https://otro-dominio.test'];
contexto.rehacerEnlaces();
ok(String(celda(2, 6)) === 'https://otro-dominio.test/?i=GW-01',
   'al cambiar Config!sitio, los enlaces se rehacen', String(celda(2, 6)));
cfg.filas[1] = ['sitio', 'https://boda-guevara-wermuth.artechstudio.net'];
contexto.rehacerEnlaces();

console.log('\n3) doGet');
const g1 = get('GW-01'), g2 = get('GW-02');
ok(g1.ok && g1.cupo === 1 && g1.nombre === 'Ana Lucía Martínez', 'GW-01 → 1 lugar', JSON.stringify(g1));
ok(g2.ok && g2.cupo === 2, 'GW-02 → 2 lugares', JSON.stringify(g2));
ok(get('NO-EXISTE').encontrada === false, 'código desconocido no revienta');

console.log('\n4) doPost correcto');
const p1 = post({ code: 'GW-02', nombre: 'Carlos Guevara', asiste: 'si',
  acompanante: 'María López', restricciones: 'vegetariana', mensaje: '¡Felicidades!',
  ts: Date.now() - 5000 });
ok(p1.ok && p1.personas === 2, 'guarda 2 personas', JSON.stringify(p1));
const fila = libro.hojas['Confirmaciones'].filas.find(f => f[1] === 'GW-02');
ok(fila && fila[6] === 2, 'la fila tiene personas = 2', fila ? fila.join(' | ') : 'sin fila');
ok(fila && fila[8] === '¡Felicidades!', 'guarda el mensaje');

console.log('\n5) validaciones y anti-bot');
ok(post({ code: 'GW-01', nombre: 'A', asiste: 'si' }).ok === false, 'nombre de 1 letra se rechaza');
ok(post({ code: 'GW-01', nombre: '<script>alert(1)</script>', asiste: 'si' }).ok === false,
   'descarta HTML en el nombre');
const bot = post({ code: 'GW-01', nombre: 'Robot Prueba', asiste: 'si', website: 'x' });
ok(bot.ignorado === true, 'honeypot descarta el envío');
const rapido = post({ code: 'GW-01', nombre: 'Muy Rápido', asiste: 'si', ts: Date.now() });
ok(rapido.ignorado === true, 'envío instantáneo descartado');

console.log('\n6) el cupo manda desde la hoja, no del cliente');
const p2 = post({ code: 'GW-01', nombre: 'Solo Una', asiste: 'si',
  acompanante: 'Intruso', cupo: 2, ts: Date.now() - 5000 });
ok(p2.ok && p2.personas === 1, 'GW-01 con cupo:2 en el JSON → guarda 1 persona', JSON.stringify(p2));

console.log('\n7) actualizar una respuesta no duplica');
post({ code: 'GW-02', nombre: 'Carlos Guevara', asiste: 'no', ts: Date.now() - 5000 });
const filasGW02 = libro.hojas['Confirmaciones'].filas.filter(f => f[1] === 'GW-02');
ok(filasGW02.length === 1, 'sigue siendo una sola fila para GW-02', `${filasGW02.length} filas`);
ok(filasGW02[0] && filasGW02[0][3] === 'no' && filasGW02[0][6] === 0,
   'quedó registrado como «no», 0 personas', JSON.stringify(filasGW02[0]));

console.log('\n8) resumen');
const res = libro.hojas['Resumen'].filas[1];
ok(res && typeof res[0] === 'number', 'calcula el total de personas', res ? res.join(' | ') : 'sin resumen');

console.log(`\n${fallos === 0 ? '✅ Todo correcto' : '❌ ' + fallos + ' prueba(s) con error'}\n`);
process.exit(fallos === 0 ? 0 : 1);