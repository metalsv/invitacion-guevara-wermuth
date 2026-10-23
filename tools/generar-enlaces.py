#!/usr/bin/env python3
"""
generar-enlaces.py — de una lista de invitados saca un enlace único por
invitación (con su cupo de 1 o 2 lugares) y el mensaje listo para WhatsApp.

Entrada: CSV con tres columnas —  codigo,nombre,cupo
    GW-01,Ana Lucía Martínez,1
    GW-02,Familia Guevara,2

Convención sugerida: el número del código = número de lugares (GW-01 → 1,
GW-02 → 2). El script avisa si no coinciden, para que no se confundan al repartir.

Salida:
    enlaces.csv   → tabla completa (código, nombre, cupo, enlace, WhatsApp)
    mensajes.txt  → un mensaje por invitación, listo para copiar y pegar

Uso:
    python3 tools/generar-enlaces.py invitados.csv https://boda-gw.netlify.app
"""
import csv
import re
import sys
from pathlib import Path
from urllib.parse import quote

RAIZ = Path(__file__).resolve().parent.parent


def leer(ruta):
    with open(ruta, newline="", encoding="utf-8-sig") as f:
        muestra = f.read(2048)
        f.seek(0)
        try:
            dialecto = csv.Sniffer().sniff(muestra, delimiters=",;|\t")
        except csv.Error:
            dialecto = csv.excel
        filas = list(csv.DictReader(f, dialect=dialecto))

    limpias = []
    for i, fila in enumerate(filas, start=2):
        claves = {(k or "").strip().lower(): (v or "").strip() for k, v in fila.items()}
        codigo = claves.get("codigo") or claves.get("código") or ""
        nombre = claves.get("nombre") or ""
        cupo = claves.get("cupo") or "1"
        if not codigo or not nombre:
            print(f"  · fila {i} ignorada: falta código o nombre")
            continue
        if cupo not in ("1", "2"):
            print(f"  · fila {i}: cupo «{cupo}» inválido, se usa 1")
            cupo = "1"
        # el número del código debería ser el número de lugares (GW-02 → 2)
        m = re.search(r"(\d+)$", codigo.strip())
        if m:
            n = int(m.group(1))
            if (n in (1, 2) or not 1900 <= n <= 2100) and str(n) != cupo:
                print(f"  · fila {i}: «{codigo}» termina en {n} y el cupo dice {cupo} "
                      f"— con la convención «el número son los lugares», uno de los dos está mal")
        limpias.append({"codigo": codigo, "nombre": nombre, "cupo": cupo})
    return limpias


def plantilla(nombre, cupo, enlace):
    if cupo == "2":
        detalle = ("Tu espacio es de 2 lugares reservados. Ahí mismo puedes confirmar tu asistencia "
                   "y decirnos el nombre de tu acompañante.")
    else:
        detalle = ("Tu espacio es de 1 lugar reservado. Ahí mismo puedes confirmar tu asistencia.")
    return (
        f"Hola {nombre}, con mucha alegría te compartimos la invitación de nuestra boda civil:\n"
        f"{enlace}\n"
        f"{detalle}\n"
        f"¡Te esperamos!\n"
        f"— Guevara & Wermuth · sábado 14 de noviembre · 5:00 p.m. · Pampa el Volcán"
    )


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    entrada, base = sys.argv[1], sys.argv[2].rstrip("/")
    if not base.startswith("http"):
        sys.exit("La URL base debe empezar con https://")

    filas = leer(entrada)
    salida_csv = RAIZ / "enlaces.csv"
    salida_txt = RAIZ / "mensajes.txt"

    with open(salida_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["codigo", "nombre", "cupo", "enlace", "whatsapp", "personas_esperadas"])
        for it in filas:
            enlace = f"{base}/?i={quote(it['codigo'])}"
            msg = plantilla(it["nombre"], it["cupo"], enlace)
            wa = "https://wa.me/?text=" + quote(msg)
            w.writerow([it["codigo"], it["nombre"], it["cupo"], enlace, wa, it["cupo"]])

    with open(salida_txt, "w", encoding="utf-8") as f:
        for it in filas:
            enlace = f"{base}/?i={quote(it['codigo'])}"
            f.write(f"── {it['nombre']} ({it['cupo']} lugar/es) ─ {enlace}\n")
            f.write(plantilla(it["nombre"], it["cupo"], enlace) + "\n\n")

    total = sum(int(i["cupo"]) for i in filas)
    print(f"· {len(filas)} invitaciones · {total} personas esperadas")
    print(f"· {salida_csv.relative_to(RAIZ)}\n· {salida_txt.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()