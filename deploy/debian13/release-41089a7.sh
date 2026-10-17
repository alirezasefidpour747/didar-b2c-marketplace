#!/usr/bin/env bash
# Issue #14: exact, owner-approved staging rollout; no production or application edits.
set -Eeuo pipefail
umask 077
unset DIDAR_DB_PASSWORD JWT_SECRET COOKIE_SECRET DIDAR_API_IMAGE DIDAR_STOREFRONT_IMAGE
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
root=/srv/didar-staging
release=$root/releases/preflight-41089a7-20261017
dir=$release/.staging
sha=41089a7a0ac8084b74bb3a7f128f9a9ca038528b
api_id=sha256:0771360aef4d0a65b8b1b2dce62d48f7505fee49ccb4073abd0964c253d36afa
web_id=sha256:99f48441a56fe0dd6865b6003849ebffd6a80c9e61d21afe548aedd62056acd4
exec 9>"$root/.update.lock"
flock -n 9 || { echo 'BLOCKED: another update is running'; exit 1; }
test "$(id -u)" = 0
test "$(cat "$release/DEPLOYED_COMMIT")" = "$sha"
test -s "$dir/preview.htpasswd"
test "$(docker image inspect -f '{{.Id}}' didar-staging-api:41089a7-preflight)" = "$api_id"
test "$(docker image inspect -f '{{.Id}}' didar-staging-storefront:41089a7-preflight)" = "$web_id"
for image in "$api_id" "$web_id"; do
  test "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" = "$sha"
done
test "$(docker inspect -f '{{.Image}}' didar-staging-phase2-api-1)" = sha256:1470d5be8942dec48d375a41e388cf833b760b7fb8c27171052087af8d3c2d02
test "$(docker inspect -f '{{.Image}}' didar-staging-phase2-storefront-1)" = sha256:378c63315961a9fbcb5651d56e6f0249237dda6d46ce9c07f662b1040932292c
test ! -e /etc/nginx/conf.d/didar-preview-access.conf
test ! -e /etc/nginx/didar-preview.htpasswd
test ! -e /var/www/didar-preview-access.html
test -f "$root/backups/preflight-41089a7-20261017T122709Z/database.dump"
docker exec didar-staging-phase2-postgres-1 pg_isready -U didar -d didar >/dev/null
test "$(docker exec didar-staging-phase2-redis-1 redis-cli ping)" = PONG
old_release=$(readlink -f "$root/current")
test "$(cat "$old_release/DEPLOYED_COMMIT")" = 993cb21f25a5926d85448e0d7e496e8f04cbb8ef
available=$(df -Pk "$root" | awk 'NR==2 {print $4}')
(( available > 5 * 1024 * 1024 ))
backup=$root/backups/rollout-41089a7-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 700 "$backup"
printf '%s\n' "$old_release" > "$backup/previous-release"
active=$(readlink -f /etc/nginx/sites-enabled/didar-staging)
cp -p "$active" "$backup/nginx-original.conf"
tar -czf "$backup/runtime-config.tar.gz" -C / etc/nginx etc/letsencrypt srv/didar-staging/deploy srv/didar-staging/shared
tar -tzf "$backup/runtime-config.tar.gz" >/dev/null
stage=prepare
stopped=false
migration_started=false
gate_applied=false
compose() {
  docker compose --project-name didar-staging-phase2 --project-directory "$release" \
    --env-file "$root/shared/staging.env" --env-file "$dir/images.env" \
    -f "$dir/compose.yaml" "$@"
}
oldcompose() {
  docker compose --project-name didar-staging-phase2 --project-directory "$old_release" \
    --env-file "$root/shared/staging.env" --env-file "$old_release/.staging/images.env" \
    -f "$old_release/.staging/compose.yaml" "$@"
}
on_error() {
  code=$?
  trap - ERR
  echo "BLOCKED: failed at $stage; backup: $backup"
  if test "$stopped" = true; then
    compose stop api storefront || true
    if test "$migration_started" = false; then
      oldcompose up -d --no-deps --no-build --pull never api storefront || true
    else
      echo 'Applications stopped for review. No automatic database restore or schema downgrade.'
    fi
  fi
  if test "$gate_applied" = true && test "$stage" = gate; then
    cp -p "$backup/nginx-original.conf" "$active"
    nginx -t && systemctl reload nginx || true
  fi
  exit "$code"
}
trap on_error ERR

node <<'JS'
const fs = require('fs');
const crypto = require('crypto');
const dir = '/srv/didar-staging/releases/preflight-41089a7-20261017/.staging';
if (!fs.readFileSync(dir + '/preview.htpasswd', 'utf8').startsWith('didar-preview:$6$')) throw Error('Invalid preview password file');
let compose = fs.readFileSync('/srv/didar-staging/deploy/compose.yaml', 'utf8');
for (const [key, value] of Object.entries({
  STORE_CORS:'https://darlingbebe.shop,http://localhost:13000',
  ADMIN_CORS:'https://darlingbebe.shop,http://localhost:19000',
  VENDOR_CORS:'https://darlingbebe.shop,http://localhost:19000',
  AUTH_CORS:'https://darlingbebe.shop,http://localhost:19000,http://localhost:13000',
  FILE_BACKEND_URL:'https://darlingbebe.shop/static',
  DIDAR_PUBLIC_ORIGIN:'https://darlingbebe.shop'
})) {
  const re = new RegExp('^      '+key+':.*$', 'm');
  if (!re.test(compose)) throw Error('Unexpected compose key: '+key);
  compose = compose.replace(re, '      '+key+': '+value);
}
if (!/^        MERCUR_BACKEND_URL:.*$/m.test(compose)) throw Error('Missing build origin');
compose = compose.replace(/^        MERCUR_BACKEND_URL:.*$/m,'        MERCUR_BACKEND_URL: same-origin');
if (!compose.includes('DIDAR_SEED_DEMO: "false"') || !compose.includes('DIDAR_PAYMENT_MODE: sandbox')) throw Error('Staging guards absent');
fs.writeFileSync(dir+'/compose.yaml',compose,{mode:0o600});
fs.writeFileSync(dir+'/images.env','DIDAR_API_IMAGE=didar-staging-api:41089a7-preflight\nDIDAR_STOREFRONT_IMAGE=didar-staging-storefront:41089a7-preflight\n',{mode:0o600});
const token=crypto.randomBytes(32).toString('hex');
fs.writeFileSync(dir+'/preview-curl.conf', 'header = "Cookie: didar_preview='+token+'"\n',{mode:0o600});
fs.writeFileSync(dir+'/preview-map.conf', `map $cookie_didar_preview $didar_preview_allowed {
 default 0;
 "${token}" 1;
}
map $http_authorization $didar_backend_authorization {
 default $http_authorization;
 ~*^Basic "";
}
limit_req_zone $binary_remote_addr zone=didar_preview_login:1m rate=5r/m;
`,{mode:0o600});
const proxy=`proxy_pass http://127.0.0.1:19000;
 proxy_http_version 1.1;
 proxy_set_header Host $host;
 proxy_set_header X-Real-IP $remote_addr;
 proxy_set_header X-Forwarded-For $remote_addr;
 proxy_set_header X-Forwarded-Host $host;
 proxy_set_header X-Forwarded-Proto $scheme;
 proxy_set_header Authorization $didar_backend_authorization;
 proxy_set_header Connection "";
 proxy_read_timeout 150s;`;
const gate=`
 location = /preview-access {
  auth_basic "DIDAR staging preview";
  auth_basic_user_file /etc/nginx/didar-preview.htpasswd;
  limit_req zone=didar_preview_login burst=5 nodelay;
  limit_req_status 429;
  alias /var/www/didar-preview-access.html;
  default_type text/html;
  charset utf-8;
  add_header Cache-Control "no-store";
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header X-Frame-Options "DENY" always;
  add_header Set-Cookie "didar_preview=${token}; Path=/; Max-Age=28800; Secure; HttpOnly; SameSite=Strict";
 }
 location ~* ^/(dashboard|seller)(/|$) {
  if ($didar_preview_allowed = 0) { return 302 /preview-access; }
  ${proxy}
 }
 location ~* ^/(admin|vendor|auth|store|didar|static|health)(/|$) {
  if ($didar_preview_allowed = 0) { return 403; }
  ${proxy}
 }
`;
let site=fs.readFileSync(fs.realpathSync('/etc/nginx/sites-enabled/didar-staging'),'utf8');
if (site.includes('didar_preview_allowed') || !/location\s+\/\s*\{/.test(site)) throw Error('Unexpected active site');
site=site.replace(/location\s+\/\s*\{/,gate+'\n location / {');
const storefront=/proxy_pass\s+http:\/\/127\.0\.0\.1:13000;/;
if (!storefront.test(site)) throw Error('Unexpected storefront upstream');
site=site.replace(storefront,'proxy_pass http://127.0.0.1:13000;\n proxy_set_header Authorization $didar_backend_authorization;');
fs.writeFileSync(dir+'/nginx.proposed.conf',site,{mode:0o600});
fs.writeFileSync(dir+'/preview-access.html','<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>پیش‌نمایش دیدار</title><h1>دسترسی آزمایشی دیدار فعال شد</h1><p><a href="/dashboard/">پنل مدیر</a></p><p><a href="/seller/">پنل فروشنده</a></p><p><a href="/">فروشگاه</a></p></html>',{mode:0o600});
JS
compose config --quiet
echo 'CONFIG_PREPARED; installing approved preview access gate'
stage=gate
install -o root -g www-data -m 640 "$dir/preview.htpasswd" /etc/nginx/didar-preview.htpasswd
install -o root -g root -m 600 "$dir/preview-map.conf" /etc/nginx/conf.d/didar-preview-access.conf
install -o root -g root -m 644 "$dir/preview-access.html" /var/www/didar-preview-access.html
gate_applied=true
install -o root -g root -m 644 "$dir/nginx.proposed.conf" "$active"
nginx -t
systemctl reload nginx
publiccurl() { curl --silent --show-error --max-time 20 --resolve darlingbebe.shop:443:127.0.0.1 "$@"; }
test "$(publiccurl -o /dev/null -w '%{http_code}' https://darlingbebe.shop/dashboard/)" = 302
test "$(publiccurl -o /dev/null -w '%{http_code}' https://darlingbebe.shop/vendor/sellers)" = 403
test "$(publiccurl -H 'Cookie: didar_preview=invalid' -o /dev/null -w '%{http_code}' https://darlingbebe.shop/admin/users)" = 403
test "$(publiccurl -D "$dir/gate-unauthenticated.headers" -o /dev/null -w '%{http_code}' https://darlingbebe.shop/preview-access)" = 401
if grep -qi '^set-cookie:' "$dir/gate-unauthenticated.headers"; then false; fi
test "$(publiccurl --config "$dir/preview-curl.conf" -o /dev/null -w '%{http_code}' https://darlingbebe.shop/dashboard/)" = 200
echo 'PREVIEW_GATE_ENFORCED; native application authentication preserved'

stage=backup
stopped=true
oldcompose stop api storefront
docker exec didar-staging-phase2-postgres-1 pg_dump -U didar -d didar -Fc > "$backup/database.dump"
docker exec -i didar-staging-phase2-postgres-1 pg_restore --list < "$backup/database.dump" >/dev/null
compose run --rm --no-deps -T --entrypoint tar api -czf - -C /app/packages/api/.medusa/server/static . > "$backup/uploads.tar.gz"
tar -tzf "$backup/uploads.tar.gz" >/dev/null
sql="SELECT 'didar_product',count(*) FROM didar_product UNION ALL SELECT 'didar_offer',count(*) FROM didar_offer UNION ALL SELECT 'didar_order',count(*) FROM didar_order UNION ALL SELECT 'didar_order_line',count(*) FROM didar_order_line UNION ALL SELECT 'didar_fin_journal',count(*) FROM didar_fin_journal ORDER BY 1;"
docker exec didar-staging-phase2-postgres-1 psql -X -A -t -U didar -d didar -c "$sql" > "$backup/business-counts-before.txt"
echo 'FRESH_BACKUP_VALIDATED; applying non-demo migrations'
stage=migration
migration_started=true
compose run --rm --no-deps -T migrate > "$dir/live-migration.log" 2>&1
stage=startup
compose up -d --no-build --pull never --no-deps --wait --wait-timeout 300 api storefront
test "$(docker inspect -f '{{.Image}}' didar-staging-phase2-api-1)" = "$api_id"
test "$(docker inspect -f '{{.Image}}' didar-staging-phase2-storefront-1)" = "$web_id"
stage=verification
docker exec didar-staging-phase2-postgres-1 psql -X -A -t -U didar -d didar -c "$sql" > "$backup/business-counts-after.txt"
cmp "$backup/business-counts-before.txt" "$backup/business-counts-after.txt"
test "$(publiccurl --config "$dir/preview-curl.conf" -o /dev/null -w '%{http_code}' https://darlingbebe.shop/seller/)" = 200
test "$(publiccurl -o /dev/null -w '%{http_code}' https://darlingbebe.shop/)" = 200
node --input-type=module <<'JS'
import fs from 'node:fs';
const dir='/srv/didar-staging/releases/preflight-41089a7-20261017/.staging';
const cookie=fs.readFileSync(dir+'/preview-curl.conf','utf8').match(/Cookie: ([^"]+)/)[1];
const origin='https://darlingbebe.shop';
for (const path of ['/dashboard/','/seller/']) {
 const response=await fetch(origin+path,{headers:{Cookie:cookie}});
 if (!response.ok) throw Error('Panel response '+response.status);
 const html=await response.text();
 const assets=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g),...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css(?:\?[^"']*)?)["']/g)];
 if (!assets.length) throw Error('Missing native assets');
 for (const match of assets) {
  const url=new URL(match[1],response.url);
  if(url.origin!==origin) throw Error('Unexpected external asset');
  const asset=await fetch(url,{headers:{Cookie:cookie}});
  if(!asset.ok || !/(javascript|css)/i.test(asset.headers.get('content-type')||'')) throw Error('Asset failed '+url.pathname);
  console.log('VERIFIED_ASSET',url.pathname,asset.status);
 }
}
const catalog=await fetch('http://127.0.0.1:13000/api/didar/catalog');
if(!catalog.ok) throw Error('Catalog failed');
const data=await catalog.json();
if(!Array.isArray(data.products)||!data.rate) throw Error('Invalid catalog');
console.log('CATALOG_OK; public product count:',data.products.length);
JS
ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
stopped=false
stage=complete
trap - ERR
printf 'DEPLOYED_SHA=%s\nBACKUP=%s\n' "$sha" "$backup"
docker inspect -f '{{.Name}} image={{.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}}' didar-staging-phase2-api-1 didar-staging-phase2-storefront-1 didar-staging-phase2-postgres-1 didar-staging-phase2-redis-1
echo 'ROLLOUT_SMOKE_PASSED; authenticated browser verification still required'
echo 'Open https://darlingbebe.shop/preview-access ; username: didar-preview'
