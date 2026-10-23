#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  ver.sh — levanta la invitación en local con un solo comando
#
#    ./ver.sh            → puerto 8787
#    ./ver.sh 9000       → otro puerto
#
#  Datos de prueba: GW-01 = 1 lugar · GW-02 = 2 lugares · GW-03 = 2 lugares
#
#  Imprime las URLs exactas (incluida la del teléfono) y se queda en
#  primer plano: Ctrl+C lo detiene.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"
PUERTO="${1:-8787}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Falta python3. En Fedora/openSUSE: sudo zypper install python3"
  exit 1
fi

# Si algo quedó escuchando en ese puerto, se libera (evita el "Address already in use")
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PUERTO}/tcp" 2>/dev/null || true
  sleep 0.4
fi

echo "Levantando la invitación en el puerto ${PUERTO}…"
exec python3 backend/servidor-prueba.py "$PUERTO"