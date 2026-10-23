#!/usr/bin/env python3
"""
preparar-imagenes.py — saca los adornos florales de la invitación original
para poder reutilizarlos en la web sin el texto ni el marco "quemados".

Cómo funciona
  1. Detecta la silueta del adorno (hojas verdes + flores crema) por fila.
  2. Todo lo que queda FUERA de esa silueta se vuelve transparente: eso
     borra el texto, el marco y el fondo del JPEG.
  3. Las líneas del marco que pasan por debajo de las hojas se borran sólo
     en los píxeles crema, así que las hojas no se cortan.
  4. Exporta WebP con transparencia (assets/img/floral-*.webp).

Uso:
    python3 tools/preparar-imagenes.py "ruta/a/invitacion.jpg"

Requiere Pillow y numpy:  pip install pillow numpy
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "assets" / "img"

# Cajas (x0, y0, x1, y1) en coordenadas de la imagen de 1024 × 1536
CAJA_TL = (0, 0, 520, 400)
CAJA_BR = (540, 900, 1024, 1536)

# Zonas donde sólo hay texto: se vacían por completo
MUERTAS_TL = [(250, 145, 520, 430)]
MUERTAS_BR = [(540, 1080, 790, 1190), (540, 1265, 790, 1355)]

# Bandas exactas del marco (se limpian sólo los píxeles crema)
BANDAS = [(44, 44, 520, 58), (44, 44, 58, 400), (962, 900, 980, 1536), (540, 1472, 1024, 1486)]


def limites(imagen):
    """Devuelve, por fila, el borde derecho (esquina superior izq.) e
    izquierdo (esquina inferior der.) del adorno."""
    a = np.asarray(imagen).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    verde = (g - b > 9) & (lum > 46) & (lum < 195) & (g >= r * 0.78)
    alto, ancho = lum.shape
    der = np.zeros(alto)
    izq = np.full(alto, ancho, dtype=np.float32)
    for y in range(alto):
        xs = np.where(verde[y, :540])[0]
        der[y] = xs.max() if len(xs) else 0
        xs = np.where(verde[y, 540:])[0]
        izq[y] = (xs.min() + 540) if len(xs) else ancho

    def suavizar(v, modo):
        o = v.copy()
        for i in range(len(v)):
            w = v[max(0, i - 8):i + 9]
            o[i] = w.max() if modo == "max" else w.min()
        return o

    return suavizar(der, "max") + 40, suavizar(izq, "min") - 40


def recortar(imagen, caja, lado, muertas, der, izq):
    x0, y0, x1, y1 = caja
    trozo = imagen.crop(caja)
    a = np.asarray(trozo).astype(np.float32)
    alto, ancho = a.shape[:2]
    ys, xs = np.mgrid[0:alto, 0:ancho]
    X, Y = xs + x0, ys + y0

    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    alfa = np.clip((lum - 44.0) / 20.0, 0, 1)
    g = a[..., 1] - a[..., 2]
    alfa = np.maximum(alfa, np.clip((g - 6.0) / 14.0, 0, 1) * np.clip((lum - 36.0) / 14.0, 0, 1))
    alfa[alfa < 0.07] = 0

    crema = (lum > 105) & ((a[..., 0] - a[..., 2]) < 95) & ((a[..., 0] - a[..., 1]) < 75)

    fuera = (X > np.take(der, Y)) if lado == "tl" else (X < np.take(izq, Y))
    for (dx0, dy0, dx1, dy1) in muertas:
        fuera |= (X >= dx0) & (X < dx1) & (Y >= dy0) & (Y < dy1)

    marco = np.zeros((alto, ancho), bool)
    for (bx0, by0, bx1, by1) in BANDAS:
        marco |= (X >= bx0) & (X < bx1) & (Y >= by0) & (Y < by1)

    alfa[fuera | (marco & crema)] = 0
    alfa = np.asarray(
        Image.fromarray((alfa * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.7))
    ).astype(np.float32)

    return Image.fromarray(np.dstack([a, alfa]).clip(0, 255).astype(np.uint8), "RGBA")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    origen = Image.open(sys.argv[1]).convert("RGB")
    if origen.size != (1024, 1536):
        origen = origen.resize((1024, 1536), Image.LANCZOS)
        print(f"· imagen reescalada a 1024×1536")

    der, izq = limites(origen)
    SALIDA.mkdir(parents=True, exist_ok=True)

    tl = recortar(origen, CAJA_TL, "tl", MUERTAS_TL, der, izq)
    br = recortar(origen, CAJA_BR, "br", MUERTAS_BR, der, izq)

    for nombre, img in (("floral-tl.webp", tl), ("floral-br.webp", br)):
        destino = SALIDA / nombre
        img.save(destino, "WEBP", quality=90, method=6)
        print(f"· {destino.relative_to(RAIZ)}  ({destino.stat().st_size // 1024} KB, {img.width}×{img.height})")

    print("Listo. Revisa visualmente las esquinas antes de publicar.")


if __name__ == "__main__":
    main()
