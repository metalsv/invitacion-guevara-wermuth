/* ══════════════════════════════════════════════════════════════════
   app.js — lógica de la invitación: carga del cupo, formulario,
   envío a la hoja de cálculo y generación del evento de calendario.
   Sin dependencias. Sin innerHTML con datos del usuario.
   ══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const CFG = window.BODA_CONFIG || {};
  const EV = CFG.evento || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ── Estado ─────────────────────────────────────────────────────── */
  const params = new URLSearchParams(location.search);
  const code = (params.get('i') || '').trim();
  const state = {
    code,
    nombreInvitacion: '',
    cupo: normalizarCupo(params.get('l')) || (CFG.cupoPorDefecto ?? 1),
    yaConfirmo: false
  };
  const T0 = Date.now();

  function normalizarCupo(v) {
    const n = Number.parseInt(v ?? '', 10);
    return n === 1 || n === 2 ? n : 0;
  }

  /* Endpoint real: el de config.js; en local, el servidor de pruebas
     (backend/servidor-prueba.py) expone /api/rsvp en el mismo origen,
     así los enlaces ?i= funcionan sin configurar nada. */
  function endpoint() {
    if (CFG.endpoint) return CFG.endpoint;
    // Servidor de pruebas: localhost o una IP de red privada (para abrirlo
    // desde el teléfono en la misma wifi).
    const h = location.hostname.replace(/^\[|\]$/g, '');
    const privada = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
    const local = h === 'localhost' || h === '::1' || h === '' || privada;
    return local && location.port ? location.origin + '/api/rsvp' : '';
  }

  /* ── Elementos ──────────────────────────────────────────────────── */
  const form = $('#rsvp-form');
  const done = $('#done');
  const status = $('#status');
  const enviar = $('#enviar');
  const nombre = $('#nombre');
  const acompanante = $('#acompanante');
  const companionField = $('[data-companion]');
  const codigoInput = $('#codigo');
  const tsInput = $('#ts');
  const inviteFor = $('[data-invite-for]');
  const whenAttending = $$('[data-when-attending]');

  codigoInput.value = code;
  tsInput.value = String(T0);

  /* ── Cupo reservado en la tarjeta y en el panel ─────────────────── */
  function pintarCupo() {
    const n = state.cupo;
    $$('[data-seats]').forEach(el => { el.textContent = String(n); });
    const sub = $('[data-seats-text]');
    if (sub) sub.textContent = n === 2 ? 'Espacio reservado: 2 lugares' : 'Espacio reservado: 1 lugar';
    if (companionField) companionField.hidden = n < 2;
    if (acompanante && n < 2) acompanante.value = '';
  }

  /* ── Mensajes del formulario ────────────────────────────────────── */
  function setStatus(msg, isError = false) {
    status.textContent = msg;
    status.classList.toggle('is-error', isError);
  }
  function setFieldError(input, id, msg) {
    const box = $('#' + id);
    if (!box) return;
    box.textContent = msg || '';
    box.hidden = !msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) {
      box.id = id;
      input.setAttribute('aria-describedby', id);
    } else {
      input.removeAttribute('aria-describedby');
    }
  }

  /* ── Carga de la invitación (cupo y nombre) desde el backend ────── */
  async function cargarInvitacion() {
    if (!state.code) return;
    const url0 = endpoint();
    if (!url0) {
      console.warn('[boda] enlace con ?i=' + state.code +
        ' pero sin endpoint configurado: el cupo se queda en el valor por defecto (1). ' +
        'Pega la URL del Web App en assets/js/config.js o usa ?l=2 para previsualizar.');
      avisarNoVerificada();
      return;
    }
    try {
      const url = url0 + (url0.includes('?') ? '&' : '?') +
        'code=' + encodeURIComponent(state.code) + '&t=' + Date.now();
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.ok && data.encontrada === false) {
        // el enlace existe pero el código no está en la hoja: no fingir que es de 1 lugar
        console.warn('[boda] el código «' + state.code + '» no está en la hoja de invitaciones');
        avisarNoVerificada();
        return;
      }
      if (data && data.ok) {
        if (normalizarCupo(data.cupo)) state.cupo = normalizarCupo(data.cupo);
        state.nombreInvitacion = String(data.nombre || '').slice(0, 80);
        state.yaConfirmo = Boolean(data.confirmado);
        pintarCupo();
        if (state.nombreInvitacion) {
          inviteFor.textContent = 'Invitación para ' + state.nombreInvitacion;
          inviteFor.hidden = false;
          if (!nombre.value) nombre.value = state.nombreInvitacion;
        }
        if (state.yaConfirmo) {
          const nota = $('#note');
          if (nota) {
            nota.textContent = 'Ya tenemos una respuesta registrada para esta invitación. Puedes actualizarla aquí abajo.';
            nota.hidden = false;
          }
        }
      }
    } catch (err) {
      // No se bloquea la confirmación, pero tampoco se calla el fallo:
      // si el invitado tiene 2 lugares y se muestra 1, hay que decírselo.
      console.warn('[boda] no se pudo cargar la invitación:', err.message);
      avisarNoVerificada();
    }
  }

  /* Aviso visible (y discreto) cuando el enlace trae código pero el cupo
     real no se pudo consultar. */
  function avisarNoVerificada() {
    const nota = $('#note');
    if (!nota) return;
    nota.textContent = 'No pudimos verificar los lugares de esta invitación. ' +
      'Si tu espacio es de dos lugares, escríbenos y lo confirmamos.';
    nota.hidden = false;
    nota.classList.add('panel__note--alerta');
  }

  /* ── Interacciones del formulario ───────────────────────────────── */
  function asisteValor() {
    const el = form.querySelector('input[name="asiste"]:checked');
    return el ? el.value : 'si';
  }

  function sincronizarModo() {
    const va = asisteValor() === 'si';
    whenAttending.forEach(el => {
      el.hidden = !va;
      el.querySelectorAll('input, textarea').forEach(i => { i.disabled = !va; });
    });
    $$('.btn--ghost').forEach(b => { b.hidden = !va; });
  }

  form.addEventListener('change', e => {
    if (e.target.name === 'asiste') sincronizarModo();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if ($('#website').value) return; // bot

    const name = nombre.value.trim().replace(/\s+/g, ' ');
    const comp = acompanante.value.trim().replace(/\s+/g, ' ');
    let ok = true;

    if (name.length < 3) { setFieldError(nombre, 'err-nombre', 'Escribe tu nombre (mínimo 3 letras).'); ok = false; }
    else if (!/^[a-záéíóúüñç' .-]{3,80}$/i.test(name)) { setFieldError(nombre, 'err-nombre', 'Usa solo letras, espacios, guiones o apóstrofos.'); ok = false; }
    else setFieldError(nombre, 'err-nombre', '');

    if (!companionField.hidden && comp && !/^[a-záéíóúüñç' .-]{3,80}$/i.test(comp)) {
      setFieldError(acompanante, 'err-acompanante', 'Revisa el nombre del acompañante.'); ok = false;
    } else setFieldError(acompanante, 'err-acompanante', '');

    if (!ok) {
      setStatus('Revisa los campos marcados.', true);
      (nombre.getAttribute('aria-invalid') === 'true' ? nombre : acompanante).focus();
      return;
    }

    const payload = {
      code: state.code,
      nombre: name,
      asiste: asisteValor(),
      acompanante: companionField.hidden ? '' : comp,
      cupo: state.cupo,
      restricciones: $('#restricciones').value.trim().slice(0, 140),
      mensaje: $('#mensaje').value.trim().slice(0, 400),
      ts: T0,
      pagina: location.href
    };

    // Sin backend configurado: no se pierde la confirmación.
    const destino = endpoint();
    if (!destino) {
      mostrarRespaldo(payload);
      return;
    }

    enviar.disabled = true;
    enviar.classList.add('is-loading');
    setStatus('Enviando tu confirmación…');

    try {
      const res = await fetch(destino, {
        method: 'POST',
        // text/plain evita el preflight CORS: Apps Script lo lee igual.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(() => ({ ok: true }));
      if (data && data.ok === false) throw new Error(data.error || 'No se pudo registrar');
      mostrarExito(payload, data && data.actualizado);
    } catch (err) {
      console.error('[boda] envío fallido:', err);
      setStatus('No pudimos guardar tu respuesta. Revisa tu conexión e inténtalo otra vez, o escríbenos por WhatsApp.', true);
      const wa = $('[data-wa-fallback]');
      if (wa) wa.hidden = false;
      mostrarRespaldo(payload, true);
    } finally {
      enviar.disabled = false;
      enviar.classList.remove('is-loading');
    }
  });

  /* ── Respaldo sin base de datos ─────────────────────────────────── */
  function textoRespaldo(p) {
    const cupo = p.cupo === 2 ? '2 lugares' : '1 lugar';
    const partes = [
      'Confirmación de asistencia — Boda Guevara & Wermuth',
      'Nombre: ' + p.nombre,
      'Asistencia: ' + (p.asiste === 'si' ? 'Sí' : 'No'),
      'Cupo: ' + cupo
    ];
    if (p.acompanante) partes.push('Acompañante: ' + p.acompanante);
    if (p.restricciones) partes.push('Restricciones: ' + p.restricciones);
    if (p.mensaje) partes.push('Mensaje: ' + p.mensaje);
    if (p.code) partes.push('Código: ' + p.code);
    return partes.join('\n');
  }

  function mostrarRespaldo(p, soloAviso = false) {
    const texto = textoRespaldo(p);
    let destino = '';
    if (CFG.whatsapp) {
      destino = 'https://wa.me/' + String(CFG.whatsapp).replace(/\D/g, '') +
        '?text=' + encodeURIComponent(texto);
    } else if (CFG.email) {
      destino = 'mailto:' + CFG.email +
        '?subject=' + encodeURIComponent('Confirmación de asistencia') +
        '&body=' + encodeURIComponent(texto);
    }
    if (!destino) {
      setStatus('Falta configurar el destino en config.js: el enlace del Web App de Google (endpoint) o un WhatsApp/correo de respaldo.', true);
      return;
    }
    if (!soloAviso) setStatus('Aún no hay base de datos conectada: tu respuesta se enviará por mensaje directo.');
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = destino;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = CFG.whatsapp ? 'Enviar por WhatsApp' : 'Enviar por correo';
    a.dataset.waFallback = '';
    if (!soloAviso) enviar.insertAdjacentElement('afterend', a);
  }

  /* ── Éxito ──────────────────────────────────────────────────────── */
  function mostrarExito(p, actualizado) {
    form.hidden = true;
    const head = $('.panel__head');
    if (head) head.hidden = true;
    done.hidden = false;

    const va = p.asiste === 'si';
    $('#done-title').textContent = va ? '¡Gracias, ' + p.nombre + '!' : 'Gracias por avisarnos';
    $('#done-text').textContent = va
      ? (p.cupo === 2
          ? 'Tu confirmación quedó registrada: te esperamos con tu acompañante el sábado 14 de noviembre a las 5:00 p.m. en Pampa el Volcán.'
          : 'Tu confirmación quedó registrada. Te esperamos el sábado 14 de noviembre a las 5:00 p.m. en Pampa el Volcán.')
      : 'Lamentamos que no puedas acompañarnos. Gracias por avisarnos, te tendremos presente.';

    if (actualizado) $('#done-text').textContent += ' Actualizamos tu respuesta anterior.';

    $('#ics').href = urlICS();
    $('#gcal').href = urlGCal();
    $('#mapa').href = EV.maps || '#';
    $('#done-actions').hidden = !va;
    setStatus('');
    done.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // el foco pasa al mensaje nuevo para que un lector de pantalla lo anuncie
    done.setAttribute('tabindex', '-1');
    done.focus({ preventScroll: true });

    try {
      localStorage.setItem('boda-rsvp-' + (state.code || 'anon'), JSON.stringify({ nombre: p.nombre, asiste: p.asiste }));
    } catch { /* modo privado: se ignora */ }
  }

  $('#editar')?.addEventListener('click', () => {
    done.hidden = true;
    const head = $('.panel__head');
    if (head) head.hidden = false;
    form.hidden = false;
    form.querySelector('input[name="asiste"]:checked')?.focus();
  });

  /* ── Calendario ─────────────────────────────────────────────────── */
  function icsStamp(iso) {
    const [d, t = '00:00:00'] = iso.split('T');
    return d.replace(/-/g, '') + 'T' + t.slice(0, 8).replace(/:/g, '');
  }
  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function urlICS() {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Guevara y Wermuth//Boda civil//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + icsStamp(EV.inicio) + '-boda@guevara-wermuth',
      'DTSTAMP:' + icsStamp(new Date().toISOString()),
      'DTSTART;TZID=' + (EV.zona || 'America/El_Salvador') + ':' + icsStamp(EV.inicio),
      'DTEND;TZID=' + (EV.zona || 'America/El_Salvador') + ':' + icsStamp(EV.fin),
      'SUMMARY:' + icsEscape(EV.titulo || 'Boda civil'),
      'LOCATION:' + icsEscape(EV.direccion || EV.lugar || ''),
      'DESCRIPTION:' + icsEscape('Cena por nuestra boda civil. ' + (EV.lugar || '')),
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    return URL.createObjectURL(blob);
  }
  function urlGCal() {
    const q = new URLSearchParams({
      action: 'TEMPLATE',
      text: EV.titulo || 'Boda civil',
      dates: icsStamp(EV.inicio) + '/' + icsStamp(EV.fin),
      ctz: EV.zona || 'America/El_Salvador',
      location: EV.direccion || EV.lugar || '',
      details: 'Cena por nuestra boda civil.'
    });
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }

  /* ── Botón de la tarjeta ────────────────────────────────────────────
     En una columna hace scroll suave al formulario; en dos columnas el
     formulario ya está al lado, así que el foco entra al primer campo
     (si no, el botón parecería no hacer nada). */
  const ctaTarjeta = document.querySelector('.cta-card');
  if (ctaTarjeta) {
    ctaTarjeta.addEventListener('click', e => {
      if (!window.matchMedia('(min-width: 1100px)').matches) return;   // scroll nativo
      e.preventDefault();
      const campo = document.querySelector('#rsvp input[name="asiste"]:checked') || nombre;
      document.querySelector('#rsvp').scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => campo.focus({ preventScroll: true }), 320);
    });
  }

  /* ── Arranque ───────────────────────────────────────────────────── */
  pintarCupo();
  sincronizarModo();
  cargarInvitacion();

  // Si la URL trae ?n=Nombre se usa como sugerencia (útil para probar)
  const nParam = params.get('n');
  if (nParam && !nombre.value) nombre.value = nParam.slice(0, 80);
})();