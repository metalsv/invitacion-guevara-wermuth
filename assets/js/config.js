/**
 * config.js — ÚNICO archivo que se toca para conectar la app con el backend
 * y para ajustar los datos del evento que usan el calendario y el mapa.
 *
 * ⚠️ Si cambia la fecha, la hora o el lugar, hay que actualizar TAMBIÉN el
 *    texto visible en index.html (es el que se ve en la invitación).
 */
window.BODA_CONFIG = {
  /* ── Backend ────────────────────────────────────────────────────────────
   * URL del Web App de Google Apps Script (termina en /exec).
   * Vacío = modo sin base de datos: el formulario arma un mensaje de
   * WhatsApp/correo para que la confirmación no se pierda.
   * Ver backend/README.md para publicarlo en 5 minutos.
   */
  endpoint: 'https://script.google.com/macros/s/AKfycbxy4JlWmBp0uQOsfxW0q6WrFQBYH2eareJnuEdQTjWgKKelNI89CGVNBPAIa6UT6m_0Ww/exec',

  /* Respaldo cuando no hay endpoint configurado */
  whatsapp: '', // ej. '50370000000' (código de país + número, sin +)
  email: '',    // ej. 'boda@dominio.com'

  /* ── Datos del evento (calendario + mapa) ───────────────────────────── */
  evento: {
    titulo: 'Boda civil de Guevara & Wermuth',
    // Hora local de El Salvador (UTC-6). No cambiar la zona sin cambiarla abajo.
    inicio: '2026-11-14T17:00:00-06:00',
    fin: '2026-11-14T21:00:00-06:00',
    lugar: 'Pampa el Volcán',
    zona: 'America/El_Salvador',
    // Búsqueda para "Cómo llegar". Si tienen el pin exacto, péguenlo aquí.
    maps: 'https://www.google.com/maps/search/?api=1&query=Pampa+el+Volc%C3%A1n',
    direccion: 'Pampa el Volcán, El Salvador'
  },

  /* Cupo por defecto si la URL no trae invitación (?i=CODIGO) */
  cupoPorDefecto: 1
};