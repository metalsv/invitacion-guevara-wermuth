#!/usr/bin/env python3
"""
Servidor de pruebas local — imita al Web App de Google Apps Script.

Sirve el sitio (index.html, assets/) e implementa el mismo contrato:
  GET  /api/rsvp?code=GW-02  → {"ok":true,"nombre":"...","cupo":2,"confirmado":false}
  POST /api/rsvp             → {"ok":true,"actualizado":false,"cupo":2,"personas":2}

Guarda todo en confirmaciones.json para revisarlo a ojo.

Uso:
    python3 backend/servidor-prueba.py            # http://127.0.0.1:8787
    python3 backend/servidor-prueba.py 9000       # otro puerto

Para probar el flujo real: en assets/js/config.js pon
    endpoint: 'http://127.0.0.1:8787/api/rsvp'
y abre  http://127.0.0.1:8787/?i=GW-02
"""
import json
import os
import re
import socket
import sys
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "backend", "confirmaciones.json")

# Convención: el número del código = número de lugares reservados.
# GW-01 → 1 lugar · GW-02 → 2 lugares · GW-12 → 12 (para grupos grandes)
INVITACIONES = {
    "GW-01": {"nombre": "Ana Lucía Martínez", "cupo": 1},
    "GW-02": {"nombre": "Familia Guevara", "cupo": 2},
    "GW-03": {"nombre": "Los Hernández", "cupo": 2},
}


def cargar():
    if os.path.exists(DATOS):
        with open(DATOS, encoding="utf-8") as f:
            return json.load(f)
    return {}


def guardar(reg):
    with open(DATOS, "w", encoding="utf-8") as f:
        json.dump(reg, f, ensure_ascii=False, indent=2)


def limpiar(v, n):
    v = re.sub(r"<[^>]*>", "", str(v or ""))
    v = re.sub(r"\s+", " ", v).strip()
    return v[:n]


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=RAIZ, **kw)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, obj, code=200):
        cuerpo = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/rsvp"):
            desde = self.path.find("code=")
            codigo = ""
            if desde >= 0:
                codigo = self.path[desde + 5:].split("&")[0]
            inv = INVITACIONES.get(codigo.upper())
            if not inv:
                return self._json({"ok": True, "encontrada": False, "cupo": 1, "nombre": ""})
            reg = cargar().get(codigo.upper(), {})
            return self._json({
                "ok": True, "encontrada": True, "nombre": inv["nombre"],
                "cupo": inv["cupo"], "confirmado": bool(reg.get("asiste") == "si"),
            })
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api/rsvp"):
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        crudo = self.rfile.read(n).decode("utf-8", "replace")
        try:
            p = json.loads(crudo or "{}")
        except json.JSONDecodeError:
            return self._json({"ok": False, "error": "JSON inválido"}, 400)

        if p.get("website"):
            return self._json({"ok": True, "ignorado": True})

        nombre = limpiar(p.get("nombre"), 80)
        if len(nombre) < 3:
            return self._json({"ok": False, "error": "Nombre inválido"}, 422)

        codigo = limpiar(p.get("code"), 40).upper()
        inv = INVITACIONES.get(codigo, {"nombre": "", "cupo": 1})
        cupo = inv["cupo"]
        asiste = p.get("asiste") == "si"
        acomp = limpiar(p.get("acompanante"), 80) if cupo == 2 else ""

        reg = cargar()
        previo = codigo in reg and codigo != ""
        reg[codigo or nombre] = {
            "marca_tiempo": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "codigo": codigo,
            "nombre": nombre,
            "asiste": "si" if asiste else "no",
            "cupo": cupo,
            "acompanante": acomp,
            "personas": (2 if acomp else 1) if asiste else 0,
            "restricciones": limpiar(p.get("restricciones"), 140),
            "mensaje": limpiar(p.get("mensaje"), 400),
            "actualizaciones": reg.get(codigo, {}).get("actualizaciones", 0) + (1 if previo else 0),
        }
        guardar(reg)
        print(f"  ↳ guardado {codigo or '(sin código)'} · {nombre} · "
              f"{reg[codigo or nombre]['personas']} persona(s)")
        return self._json({"ok": True, "actualizado": previo, "cupo": cupo,
                           "personas": reg[codigo or nombre]["personas"]})

    def log_message(self, fmt, *args):
        # args puede traer enteros (códigos HTTP): hay que pasarlos a texto antes de buscar
        if "/api/rsvp" not in " ".join(str(a) for a in args):
            super().log_message(fmt, *args)


def ips_locales():
    """IPv4 de este equipo para poder abrir el sitio desde el teléfono."""
    salida = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip.startswith(("127.", "169.254.")):
                continue
            if ip not in salida:
                salida.append(ip)
    except OSError:
        pass
    if not salida:
        # truco: abrir un socket UDP no envía nada, sólo resuelve la ruta de salida
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            salida.append(s.getsockname()[0])
            s.close()
        except OSError:
            pass
    return salida


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    # 0.0.0.0 = accesible como 127.0.0.1, como localhost y desde el teléfono
    servidor = ThreadingHTTPServer(("0.0.0.0", puerto), Manejador)

    print()
    print("  Invitación en marcha. Abre en el navegador:")
    print(f"    http://127.0.0.1:{puerto}/?i=GW-01     ← 1 lugar  (Ana Lucía)")
    print(f"    http://127.0.0.1:{puerto}/?i=GW-02     ← 2 lugares (Familia Guevara)")
    print(f"    http://localhost:{puerto}/             ← sin código (1 lugar)")
    for ip in ips_locales():
        print(f"    http://{ip}:{puerto}/?i=GW-02     ← desde el teléfono (misma wifi)")
    print()
    print(f"  Respuestas: {DATOS}")
    print("  Para detenerlo: Ctrl+C")
    print()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n  Servidor detenido.")