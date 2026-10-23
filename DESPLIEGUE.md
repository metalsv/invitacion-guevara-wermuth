# Despliegue

## Dominio propio: boda-guevara-wermuth.artechstudio.net

Estado: **funcionando** ✅ (verificado el 23 de octubre de 2026).

| | |
|---|---|
| Sitio | https://boda-guevara-wermuth.artechstudio.net/ |
| DNS | CNAME `boda-guevara-wermuth` → `metalsv.github.io` (Cloudflare, **DNS only**) |
| Certificado | Let's Encrypt emitido por GitHub, estado `approved` |
| HTTPS | forzado (`https_enforced: true`); `http://` redirige a `https://` |
| Dominio viejo | `metalsv.github.io/invitacion-guevara-wermuth` → 301 al nuevo |

Mientras el DNS propaga, algunos equipos con la respuesta antigua en caché
muestran `DNS_PROBE_FINISHED_NXDOMAIN` durante unos minutos; se resuelve solo
(Cloudflare usa TTL de 5 minutos).

### 1. En Cloudflare (lo hace el dueño del dominio)

*DNS ▸ Records ▸ Add record*:

| Campo | Valor |
|---|---|
| Type | `CNAME` |
| Name | `boda-guevara-wermuth` |
| Target | `metalsv.github.io` |
| Proxy status | **DNS only** (nube gris) |
| TTL | Auto |

> ⚠️ **La nube debe quedar gris.** Con el proxy de Cloudflare activo (naranja),
> GitHub no puede emitir el certificado y el sitio da error de conexión.
> Si más adelante quieren el proxy, se activa *después* de que el certificado
> HTTPS de GitHub esté emitido y forzado.

### 2. En GitHub Pages (una sola vez)

```bash
gh api --method PUT /repos/metalsv/invitacion-guevara-wermuth/pages \
  -f cname='boda-guevara-wermuth.artechstudio.net'
```

GitHub verifica el DNS y emite el certificado (de minutos a una hora).
Después se activa *Enforce HTTPS* y se comprueba:

```bash
curl -sI https://boda-guevara-wermuth.artechstudio.net/ | head -1
```

El sitio viejo (`metalsv.github.io/invitacion-guevara-wermuth`) **redirige solo**
al dominio nuevo, así que los enlaces ya repartidos siguen funcionando.

### 3. En la hoja de Google

El dominio de los enlaces se toma de la pestaña **Config** (fila `sitio`).
Al cambiarlo, ejecutar `rehacerEnlaces` y las 500 URLs se rehacen con el
dominio nuevo. No hay que tocar código ni volver a publicar el Apps Script.

---

## Estado actual: publicado en GitHub Pages

| | |
|---|---|
| **Sitio** | https://metalsv.github.io/invitacion-guevara-wermuth/ |
| **Repositorio** | https://github.com/metalsv/invitacion-guevara-wermuth (público) |
| **Rama publicada** | `main`, carpeta raíz (`/`) |
| **HTTPS** | automático, certificado válido |
| **Actualizar** | `git add -A && git commit -m "..." && git push` → repubica en ~40 s |

Para ver el diseño de una invitación de 2 lugares sin backend: `?l=2`.
Con `?i=GW-02` funciona de verdad sólo cuando `assets/js/config.js` tenga el
`endpoint` del Apps Script; mientras tanto la página avisa que no pudo verificar
los lugares y usa el cupo mínimo (1).

**Pendiente para que las confirmaciones se guarden:** crear la hoja de Google y
publicar el Apps Script (ver `backend/README.md`), pegar la URL `/exec` en
`assets/js/config.js` y hacer `git push`. Son 2 minutos.

---

## Otras opciones (por si algún día cambia)

Son archivos estáticos (HTML, CSS, JS, fuentes, imágenes). No necesitan Node ni base
de datos en el servidor.

---

## Opción 1 · Netlify Drop (2 minutos, gratis)

1. Entrar a <https://app.netlify.com/drop>.
2. Arrastrar **la carpeta del proyecto** (sin `work/`, sin `backend/` si no se quiere).
3. Netlify devuelve una URL tipo `https://elegant-tesla-123.netlify.app`.
4. *Site settings ▸ Change site name* para dejarla como `boda-guevara-wermuth`.

Para actualizar: volver a arrastrar la carpeta en la misma cuenta.

---

## Opción 2 · GitHub Pages (gratis, con historial)

```bash
cd "/home/patrick/Documentos/formulario boda aida"
git init -b main
git add index.html assets tools README.md INVITACIONES.md DESPLIEGUE.md
git commit -m "Invitación digital Guevara & Wermuth"
gh repo create boda-gw --public --source=. --push
gh api -X POST repos/:owner/boda-gw/pages -f source[branch]=main -f source[path]=/
```

Queda en `https://<usuario>.github.io/boda-gw/`. El primer despliegue tarda ~1 minuto.

> `backend/confirmaciones.json` y `work/` no deben subirse: son datos de prueba y
> material de trabajo.

---

## Opción 3 · VPS con Podman + Caddy (mismo esquema del sitio CBES)

Útil si ya tienen el proxy Caddy con `sites/*.caddy` y quieren el dominio propio con
certificado automático.

```bash
# en el VPS, como usuario deploy
mkdir -p /opt/sitios/boda-gw
rsync -av --exclude work --exclude backend/confirmaciones.json \
  ./ usuario@vps:/opt/sitios/boda-gw/site/
```

`/opt/sitios/boda-gw/compose.yaml`:

```yaml
services:
  web:
    image: docker.io/nginxinc/nginx-unprivileged:alpine
    container_name: boda-gw
    restart: unless-stopped
    expose:
      - "8080"
    volumes:
      - ./site:/usr/share/nginx/html:ro,Z
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro,Z
    networks: [proxy]
    mem_limit: 128m
    cpus: 0.5
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/healthz"]
      interval: 30s
      timeout: 3s
      retries: 3

networks:
  proxy:
    external: true
```

`/opt/sitios/boda-gw/nginx.conf` (cache agresiva para assets, sin caché para el HTML):

```nginx
server {
    listen 8080;
    root /usr/share/nginx/html;
    index index.html;

    location = /healthz { access_log off; return 200 "ok\n"; }

    location ~* ^/assets/.*\.(css|js|woff2|webp|svg)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        include /etc/nginx/conf.d/security-headers.conf;
    }

    location / {
        expires -1;
        add_header Cache-Control "no-cache";
        include /etc/nginx/conf.d/security-headers.conf;
        try_files $uri $uri/ =404;
    }
}
```

`security-headers.conf` (dentro del contenedor, en `/etc/nginx/conf.d/`):

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), camera=(), microphone=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

> Si se agrega `Content-Security-Policy`, incluir el dominio del script de Google:
> `connect-src 'self' https://script.google.com https://script.googleusercontent.com;`
> y `script-src 'self'`.

Y en el Caddyfile del proxy (`/opt/proxy/sites/boda-gw.caddy`):

```caddy
boda-guevara-wermuth.com {
    reverse_proxy boda-gw:8080
}
```

```bash
cd /opt/sitios/boda-gw && podman-compose up -d
# validar el proxy ANTES de recargarlo (ver skill multi-site / TRASPASO.md)
```

---

## Después de publicar: comprobaciones (2 minutos)

```bash
BASE=https://tu-dominio.com
curl -s -o /dev/null -w "home %{http_code}\n"      $BASE/
curl -s -o /dev/null -w "404  %{http_code}\n"      $BASE/no-existe
curl -s -o /dev/null -w "css  %{http_code}\n"      $BASE/assets/css/styles.css
curl -sI $BASE/ | grep -iE "x-content-type|x-frame|referrer"
curl -s "$BASE/?i=GW-02" | grep -o 'data-seats[^<]*'   # GW-02 = 2 lugares
```

Y en el teléfono: abrir `$BASE/?i=GW-02`, confirmar, y revisar que la fila aparezca en
la hoja de Google. Esa es la prueba real: el mensaje de agradecimiento en pantalla no
garantiza que se guardó.

## Rollback

Al ser estático, volver atrás es reponer la carpeta anterior:

```bash
# Netlify: Deploys ▸ elegir el deploy anterior ▸ Publish deploy
# GitHub: git revert <commit> && git push
# VPS: restaurar la copia fechada del directorio y reiniciar el contenedor
```

## Checklist antes de mandar el primer enlace

- [ ] `endpoint` en `assets/js/config.js` apunta al `/exec` correcto
- [ ] La hoja tiene la lista real de invitaciones con su cupo
- [ ] Probado `?i=` de una invitación de 1 lugar y de una de 2
- [ ] Probado el camino "No podré asistir"
- [ ] El enlace «cómo llegar» abre el punto correcto (hoy es una búsqueda por nombre:
      si tienen el pin exacto, cámbienlo en `config.js` → `evento.maps`)
- [ ] Fecha límite escrita en `index.html` coincide con la real
- [ ] Enviado un enlace de prueba a un teléfono distinto al del organizador