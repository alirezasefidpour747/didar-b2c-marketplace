# نصب موازی تازهٔ DIDAR — کیت candidate مستقل از release

این مسیر برای application release پذیرفته‌شدهٔ `0c4b047baa9dbe37cd1876159c15d22b40cf7cac` است. images و اصل ZIP تغییر نمی‌کنند. lifecycle تازه، اصلاحیهٔ installation kit است و **قبل از اجرای آن روی هدف، پذیرش دقیق Chief Architect و تأیید gateهای متأثر لازم است**. مجوز مالک برای آماده‌سازی نصب موازی، اجازهٔ اصلاح legacy، cutover دامنه یا جعل receipt نیست. این مأموریت به سرور staging متصل نمی‌شود.

## وضعیت و منشأ

- `APPLICATION_RELEASE=ACCEPTED`؛ run `39229912918`، attempt `2` و source بالا ثابت است.
- `FRESH_INSTALL_KIT=CANDIDATE`؛ SHA مستقل کیت، evidence، نتایج و محدودیت‌های اجرای جدید در handoff همراه بسته ثبت می‌شود. source کیت را با source application اشتباه نگیرید.
- `TARGET_CONFIG=BLOCKED`، `PUBLIC_HTTPS=NOT_VERIFIED` و `DOMAIN_CUTOVER=NOT_AUTHORIZED` تا دریافت شواهد واقعی هدف پابرجاست.
- گزارش مالک می‌گوید ZIP و همهٔ checksumهای داخلی روی هدف بررسی شده‌اند؛ این **شاهد گزارش‌شدهٔ مالک** است، نه ادعای دانلود مجدد ZIP در executor.

اطلاعات هدف گزارش‌شده: Debian 13.7 amd64، Docker26.1.5، Compose2.26.1، Nginx1.26.3-3+deb13u9 بدون HTTP JS module، Node میزبان20.19.2 و Node کانتینرها24.19.0. نبود `DIDAR_AUTH_NETWORK_KEY` در هر دو app legacy و نبود OCI revision labels، مسیر update/rollback legacy را تأیید نمی‌کند. کلید را به legacy تزریق نکنید و guard wrapper قبلی را حذف نکنید.

## artifactهای ثابت

API:

```text
ghcr.io/alirezasefidpour747/didar-b2c-marketplace/api@sha256:cd332cb6a062c1b5bfa6e9473debee9a50adbbfdc286f5731428b328cedd6b58
config: sha256:1ffb2c40294dd899bfe6c4c76224cf7d0e3d5fe7e75e732e12f5d0a15c8911cf
```

Storefront:

```text
ghcr.io/alirezasefidpour747/didar-b2c-marketplace/storefront@sha256:c90679eca91225ec8a550f282f43dab48a0010cdcc12d38090c880cddf6e71c7
config: sha256:b928edafdf670fa6ace1fcff550571d73cc5828b3bfdb2d0ed4a9ed914c86d10
```

هر دو `linux/amd64` هستند. ZIP اصلی `855651700` bytes با SHA-256 زیر است:

```text
53491cee474fee8573be7e630530f8f8e3d253920c0911e5e77a978e0f694a58
```

`images.tar.gz`=`d623867da3e3392c99919bd49c3ee2855d3423577aa54d4efc4ad9088665288e` و اصل `install-kit/kit-manifest.json`=`bf9d9da07d92f9913a8080c9a07aee1fb0f6564a553d2ed5286ce3946edcf915`. اصل release را نگه دارید؛ assembler پذیرفته‌شده archive واقعی را لازم دارد. تصاویر candidate قبلی یا image ID محلی جای دانلود محسوب نمی‌شوند.

برای dependencies نصب تازه می‌توان از immutable refs زیر، پس از pull و تطبیق config واقعی، استفاده کرد؛ این‌ها انتخاب جدید برای منابع تازه‌اند و نسخهٔ نصب legacy فرض نمی‌شوند:

```text
docker.io/library/postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
config: sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537
docker.io/library/redis@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499
config: sha256:f84b0c4678011602b9b98c227a4dcd5468bf8b088b02fdd4165cb7758bad8058
```

## مرز حفاظت و منابع مستقل

نام project، bridge network و سه volumeِ PostgreSQL/Redis/uploads باید تازه و با همهٔ legacy و سرویس‌های دیگر متفاوت باشند. collision موجب توقف است؛ هیچ adopt، reuse، volume reset، demo seed یا حذف منبع انجام نمی‌شود. baseline کل daemon قبل از ساخت گرفته می‌شود؛ تغییر کانتینرها، configها و endpointهای قبلی یا ظهور منابع خارج از journal مسیر را می‌بندد. هم‌زمان روی این Docker daemon عملیات نامرتبط اجرا نکنید.

fresh DB/cache فقط با hostهای ثابت داخلی `postgres:5432` و `redis:6379/0` مصرف می‌شوند. wrapper اتصال به DB/cache قدیمی را نمی‌پذیرد. چهار secret جدید و متمایز فقط متعلق به fresh هستند: JWT، COOKIE، DB password و network key. هیچ secret legacy خوانده، تغییر یا rotate نمی‌شود. native identity/tenant authorities و signed-ingress/private-Next application همان release پذیرفته‌شده باقی می‌مانند.

هدف runtime نهایی:

```text
Host Nginx (original client socket, v1 HMAC)
  -> verified TLS relay (host loopback published port -> shared namespace :3000)
  -> private Next 127.0.0.1:3001 / native API 127.0.0.1:9000
  -> independent PostgreSQL / Redis / uploads resources
```

API مالک namespace است و storefront در `network_mode: service:api` اجرا می‌شود. فقط relay TLS روی یک port آزادِ **loopback میزبان** publish می‌شود؛ API9000، private Next3001، DB و Redis public نمی‌شوند. actual peer از gateway/container list یا header حدس زده نمی‌شود. domain فعلی، TLS/vhostهای فعال و نصب legacy دست‌نخورده می‌مانند؛ برای preview عمومی آینده یک origin مستقلِ پذیرفته‌شده لازم است، نه تغییر مخفیانهٔ دامنهٔ فعلی. هیچ tunnel/VPN/سرویس روی کامپیوتر مالک لازم نیست.

## Node24 خصوصی؛ Node20 سیستم حفظ می‌شود

ابتدا checksumهای candidate kit را بررسی کنید. مسیر runtime باید جدید، absolute و زیر parent واقعیِ متعلق به اپراتور با mode دقیق `0700` باشد. provisioner صرفاً Node24.19.0 official linux-x64 را با SHA pin دانلود و در مسیر جدید استخراج می‌کند؛ PATH، symlink یا package سیستم را تغییر نمی‌دهد و روی وجود مقصد متوقف می‌شود.

```sh
mkdir -m 0700 /absolute/new-operator-private
bash source/scripts/deployment/nginx/provision-node.sh /absolute/new-operator-private/node24
/absolute/new-operator-private/node24/runtime/bin/node --version
```

archive رسمی `node-v24.19.0-linux-x64.tar.xz` دارای SHA-256=`14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647` است. pin از Node official HTTPS گرفته شده؛ تأیید GPG تازه ادعا نشده است. wrapper fresh را با Node20 اجرا نکنید.

## ساخت amendment؛ اصل release تغییر نمی‌کند

در root استخراج‌شدهٔ release، `sha256sum -c SHA256SUMS` و اصل کیت را بررسی کنید. با script اصلی همان release، receipt واقعی R5 و review واقعی application و identities واقعی dependencyها، operator bundle اصلی را بسازید. سپس از source کامل candidate این amendment را در **پوشهٔ جدید** بسازید:

```sh
/absolute/new-operator-private/node24/runtime/bin/node source/scripts/ci/fresh-operator-bundle.mjs /absolute/original-operator \
  EXACT_ORIGINAL_OPERATOR_MANIFEST_SHA256 EXACT_INSTALLATION_SOURCE_SHA \
  /absolute/new-fresh-operator
```

assembler، manifest، application receipts و signer/config اصلی را حفظ و wrapper/helpers تازه را جدا hash می‌کند. `INSTALLATION_AMENDMENT.json` وضعیت `CANDIDATE_REQUIRES_CHIEF_ARCHITECT_ACCEPTANCE` دارد و **هیچ APPROVED receipt تولید نمی‌کند**. اصل archive، manifest و install-kit پذیرفته‌شده overwrite نمی‌شوند. فایل assembler مسطح داخل خروجی فقط نسخهٔ hash-bound برای provenance است؛ اجرای assembler از layout کامل `source/scripts/ci/` انجام می‌شود.

پذیرش Chief Architect باید به شش فایل اجرایی/سیاست `stack.mjs/fresh.mjs/fresh-restore.mjs/compose.topology.json/provision-node.sh/fresh-operator-bundle.mjs` و هر چهار config ID واقعی و source application اشاره کند. receipt واقعی باید `scope=PARALLEL_FRESH_INSTALL_KIT`، `preparation_only_mutations=true` و `domain_cutover_authorized=false` داشته باشد. خروج unit tests یا receipt قبلی application، پذیرش این lifecycle تازه نیست. template همراه بسته عمداً `PENDING` است و قابل استفاده برای عبور از gate نیست.

## secretها و config اولیه

یک directory جدید `0700` برای fresh private inputs انتخاب کنید؛ با directory/فایل legacy هم‌نام نباشد. فایل env و JSONهای operation/admin/approval/restore باید operator-owned، regular، canonical، بدون symlink و `0600` باشند. env literal `KEY=value` است؛ آن را source نکنید و secretها را در فرمان، chat یا screenshot وارد نکنید.

```sh
mkdir -m 0700 /absolute/new-fresh-private
/absolute/new-operator-private/node24/runtime/bin/node /absolute/new-fresh-operator/stack.mjs provision-network-key \
  /absolute/new-fresh-private/network.key
```

این کار key را با CSPRNG و `wx` فقط یک‌بار می‌نویسد و مقدار/hash آن را چاپ نمی‌کند. برای JWT، COOKIE و DB password از secret manager یا CSPRNG مستقل استفاده و فقط در private fresh config قرار دهید. کلید networkِ تازه یکسان به **Nginx signer تازه، API تازه و relay تازه** داده می‌شود؛ به legacy داده نمی‌شود. `DATABASE_URL` باید credentials همین DB تازه و `postgres:5432/<fresh-db>` و Redis URL باید `redis://redis:6379/0` باشد. `DIDAR_PUBLIC_ORIGIN_VERIFIED=false` باقی می‌ماند.

در مرحلهٔ preparation فقط `DIDAR_AUTH_INGRESS_PEERS=PENDING` مجاز است؛ این مقدار peer یا allowlist نیست و هیچ frontend/relay با آن شروع نمی‌شود. پس از observation واقعی، فقط از مسیر `fresh-bind-peer` به peer دقیق تبدیل می‌شود. JWT/COOKIE/DB/network key در میانهٔ این انتقال ثابت می‌مانند.

برای Admin اولیه، private JSON جدا با فقط `DIDAR_BOOTSTRAP_EMAIL`، `DIDAR_BOOTSTRAP_PASSWORD` و `NATIVE_BOOTSTRAP_PASSWORD` آماده کنید؛ دو password باید متفاوت و حداقل 16 کاراکتر باشند. فقط script پذیرفته‌شدهٔ `provision-first-admin.ts` اجرا می‌شود؛ نه demo account، نه auto bridge/email matching. ورود native و dual proof هنوز لازم است؛ Vendor از workflow پذیرفته‌شدهٔ onboarding ساخته می‌شود.

## lifecycle بسته و ترتیب اجرا

این مراحل **برای اجرای آیندهٔ «03» پس از پذیرش کیت و پیش‌نیازهای مربوط** هستند. هیچ‌کدام در این مأموریت روی staging اجرا نشده‌اند. هر فرمان با code/signal/spawn_error ثبت شود و failure مرحلهٔ وابسته را متوقف کند.

```sh
NODE24=/absolute/new-operator-private/node24/runtime/bin/node
KIT=/absolute/new-fresh-operator
ENVFILE=/absolute/new-fresh-private/topology.env
OPFILE=/absolute/new-fresh-private/fresh-operation.json
MANIFEST_SHA=EXACT_NEW_OPERATOR_MANIFEST_SHA256
"$NODE24" "$KIT/stack.mjs" "$ENVFILE" "$KIT/operator-manifest.json" \
  "$MANIFEST_SHA" "$OPFILE" fresh-preflight
```

برای هر مرحلهٔ بعد فقط verb آخر را عوض کنید؛ Compose/exec/override دلخواه جای wrapper مجاز نیست:

1. `fresh-preflight`: platform/runtime/resources، immutable image labels، نبود collision، baseline و state انحصاری؛ application فعالی ایجاد نمی‌کند.
2. `fresh-dependencies`: پس از CA preparation approval، network و سه volume تازه و فقط PostgreSQL/Redis تازه را ایجاد می‌کند؛ legacy untouched.
3. `fresh-migrate`: migration پذیرفته‌شده و foundation bootstrap با `DIDAR_SEED_DEMO=false`، `DIDAR_ENVIRONMENT=staging` و payment sandbox؛ commerce/QA seed اجرا نمی‌شود.
4. `fresh-admin`: Admin اولیهٔ واقعی را با private credentials از script پذیرفته‌شده ایجاد می‌کند؛ bridge خودکار نیست.
5. `fresh-restore-check`: backup واقعی همین initialized state و restore به سه volume جدید و جدا؛ hashes/config و PG/Redis/uploads باید واقعاً بررسی شوند. receipt از اجرای موفق ساخته می‌شود، نه از template.
6. `fresh-prepare-api`: فقط API تازه با listener خصوصی و namespace نهایی؛ frontend و relay هنوز بالا نمی‌آیند.
7. `fresh-observe-peer`: diagnostic TLS محدود در **همان namespace واقعی API**؛ هیچ login را به backend نمی‌فرستد. درخواست signedِ Nginx با body یک‌بارهٔ چاپ‌شدهٔ مرحلهٔ قبل و proof v1 باید verify شود. خروج شامل socket peer واقعی است، نه اعتماد به forwarded header. مشاهده به‌تنهایی approval نیست.
8. `fresh-bind-peer`: پس از بررسی actual discovery/module/TLS و maintenance، peer و hashes واقعی را به همان API ID/config/operation bind می‌کند. هنوز public cutover ممنوع است.
9. `fresh-start`: فقط پس از bind، restore evidence و edge واقعی `VERIFIED`، storefront را در namespace API شروع و TLS health/private unsigned denial را بررسی می‌کند؛ وضعیت فقط internal است.
10. `fresh-quiesce`: فقط fresh container IDs واقعی و journaled را با ترتیب storefront سپس API متوقف می‌کند؛ dependencies و legacy باقی می‌مانند.

wrapper به default local Unix Docker socket، حداقل دو CPU/4 GiB RAM و 2 GiB فضای آزاد daemon نیاز دارد؛ برای images، منابع موازی، backup و restore فضای بیشتری لازم است. فقط `fresh-quiesce` که صرفاً stopِ منابع owned است از threshold ظرفیت معاف است؛ hash/ownership/context/approval و حفاظت منابع قبلی همچنان بررسی می‌شوند و این استثنا اجازهٔ create/start نمی‌دهد. volume/image/containerهای دیگر را برای عبور از guard حذف نکنید. `--no-deps` و immutable loaded references حفظ می‌شوند. lock و journal خصوصی نگهداری می‌شوند؛ بعد از failure آن‌ها را برای ادامهٔ خودکار پاک نکنید.

## Nginx/njs، TLS و observation بدون cutover

از `DEBIAN_NJS_COMPATIBILITY.md` همان release و pins آن استفاده کنید: HTTP JS/njs `0.8.9-1`، ABI=`nginx-abi-1.26.3-1`، Nginx `1.26.3-3+deb13u9`. module روی هدف هنوز نصب/بارگذاری نشده است. قبل از هر provisioning، `nginx -V`، بسته/architecture، `nginx -T` sanitized، actual module/dependency paths، service unit و vhostهای دیگر را ثبت کنید. module از Alpine یا Nginx دیگر کپی نشود؛ upgrade خودکار/غیربررسی‌شده مجاز نیست.

مسیر حفظ legacy این است که ابتدا استخراج packageهای authenticated و بررسی load در prefix/config **جدا** انجام شود؛ از `fetch-debian.py` و verifier پذیرفته‌شده می‌توان بدون نصب package یا service scripts استفاده کرد. هر طرح نصب system package باید اول simulate و side effects آن برای service reload/start بررسی و جدا تصویب شود. هیچ فایل فعال Nginx یا default site در preparation جایگزین نشود. signer/TLS diagnostic می‌تواند در process/prefix جدا روی listener اختصاصی میزبان اجرا شود؛ این سرویس روی سرور staging است و به کامپیوتر مالک وابسته نیست. فعال‌سازی vhost عمومی و تغییر domain بخشی از این مجوز نیست.

شبکهٔ HMAC از original socket و exact raw bytes استفاده می‌کند؛ real-IP/CDN/PROXY rewrite، X-Forwarded-For caller authority و unsigned fallback مجاز نیست. routeهای B2C، `/dashboard`، `/seller`، native API، media و `/didar/login/register` همان قرارداد پذیرفته‌شده‌اند.

relay TLS directory جدید باید `0700` و `key.pem` باید `0600` باشد؛ cert/CA معتبر، DNS SAN واقعی، key match و issuing CA سازگار wrapper لازم است. TLS را disable نکنید و IP/SAN یا path را حدس نزنید. network key از private service-manager plan در محیط masterِ **Nginx تازه** provision می‌شود؛ HUP به‌تنهایی env جدید را وارد master نمی‌کند. برای legacy Nginx فعلاً restart/reload تجویز یا اجرا نشود؛ اگر prefix جدا کافی نبود، تصمیم service تغییر‌یافته نیازمند تصویب جداست.

actual mapping/namespace/peer، module path/ABI، TLS name/chain/paths و public preview origin باید از «03» برسد. `TARGET_CONFIG=BLOCKED` تا ثبت این شواهد باقی می‌ماند. transcript probe فقط challenge غیرsecret و code/peer sanitized داشته باشد؛ proof/key/password ضبط نشود.

برای observation، هنگام انتظار `fresh-observe-peer`، در terminal دوم **روی همان سرور** درخواست را از Nginx diagnostic مجزا عبور دهید؛ مستقیم به observer یا API نفرستید. body دقیقِ مرحلهٔ `fresh-prepare-api` را بدون تغییر bytes در فایل غیرsecret بگذارید. مقادیر uppercase زیر باید از config واقعیِ بررسی‌شده جایگزین شوند؛ CA/hostname verification را خاموش نکنید:

```sh
curl --fail --silent --show-error --cacert /absolute/probe-ca.pem \
  --resolve ACTUAL_PROBE_NAME:ACTUAL_PROBE_PORT:127.0.0.1 \
  --request POST --header 'Content-Type: application/json' \
  --data-binary @/absolute/diagnostic-body.json \
  https://ACTUAL_PROBE_NAME:ACTUAL_PROBE_PORT/api/didar/login
```

این فرمان public Internet test نیست؛ observation socket بین Nginx و namespace نهایی API است. پس از timeout یا تغییر API ID، observation قبلی قابل استفاده نیست. در `edge`، maintenance=true، public_routes_enabled=false، observed_peers، tls_name، discovery_file/discovery_sha256 و matched_files شامل module/nginx_config/signer_auth/signer_sign واقعی لازم است. signer hashes باید دقیقاً با bundle مطابق باشند.

## backup، isolated restore و recovery

helper، PostgreSQL dump واقعی، Redis RDB و media bytes را به منابع isolated جدید restore می‌کند و configuration custody را جدا ثبت می‌کند؛ markerها و جدول‌های test فقط در fixture disposable هستند. receipt و raw exits باید در storage خصوصی واقعی نگهداری شوند؛ `evidence_url` نشانی واقعی محل نگهداری است، نه ادعای upload خودکار. source IDs و initialization-state SHA به fresh dependencies همان اجرا bind هستند. هر سه restore volume باید distinct و جدا از source و legacy باشند. شکست حتی یک PG/Redis/media/config check، `PASS` تولید نمی‌کند.

ورودی `operation.restoration` برای `fresh-restore-check` فقط `{path,evidence_url}` است. پس از موفقیت واقعی، همان receipt را تغییر ندهید: backupهای خصوصی را رمزگذاری و به storage واقعی منتقل، download/readback و checksum آن‌ها را بررسی کنید. سپس در operation برای `fresh-prepare-api` و `fresh-start` از `{path,sha256,publication:{path,sha256}}` استفاده کنید؛ هر SHA مربوط به bytes واقعی همان فایل است. readback receipt خارجی با `scope=FRESH_BACKUP_DURABLE_READBACK`، `status=PASS`، actual `exit_code=0`، source IDs، initialization-state SHA، restore-receipt SHA، چهار backup SHA و destination URL دقیق لازم است. helper publication را ادعا یا خودکار تأیید نمی‌کند؛ تا نبود این شاهد، API/frontend start blocked می‌ماند. format دقیق fieldها در `verifyFreshRestore` همان source candidate مرجع است؛ template را به PASS تبدیل نکنید.

**backup کامل recovery فراتر از env است:** اصل images/ZIP و manifest، amendment/approval، signer/module/config، relay/public cert/key/CA، network key version و credential custody نیز باید encrypted/off-host نگهداری و بازیابی واقعی آن‌ها جدا بررسی شود. helper DB/media به‌تنهایی rollback کامل میزبان یا Nginx را اثبات نمی‌کند.

قبل از ترافیک عمومی، backup جدیدی با هر چهار fresh app/dependency ID واقعی و restore مستقل بگیرید. سپس می‌توان با operation واقعی و همان matched bundle به verbs موجود `preflight/quiesce/migrate/recreate/health/recover` تحویل داد؛ original-wrapper backup شروطش حذف نمی‌شود. API پیش از storefront recreate می‌شود و پس از تغییر API ID، namespace و peer/binding مجدداً بررسی می‌شوند.

در partial failure، فقط IDهای واقعیِ ثبت‌شده و owner/image/project-verified قابل توقف‌اند. منابع unjournaled یا state مبهم باعث `BLOCKED` می‌شوند؛ auto-adoption، `rm/down -v` یا دستکاری state مجاز نیست. اگر `fresh-quiesce` به‌دلیل resource mismatch نتوانست توقف امن انجام دهد، خروج و منابع را حفظ و برای بررسی اپراتور/Chief Architect توقف کنید. restart/ادامهٔ bootstrap از state نامعلوم در این candidate مجوز ندارد.

برای recovery به همان accepted images و config/signer/module/TLS/key-version منطبق و schema سازگار متکی باشید. unknown legacy نصب فعلی rollback تأییدشده نیست. بازگشت خودکار دامنه، schema downgrade، secret rotation یا حذف نصب تازه انجام نمی‌شود. recovery کامل پس از failure بین مراحل تازه، تا ثبت evidence واقعی و پذیرش مسیر مربوط، `BLOCKED` است.

## حدود پذیرش و مسئول بعدی

تأیید software release قبلی با پذیرش installer تازه یکی نیست. Chief Architect باید source/hash کیت، independent review و affected runtime verification را بپذیرد؛ protocol/trust authority تغییری نکرده، اما lifecycle/initial-secret provisioning تازه نیازمند این پذیرش عملیاتی است. اگر test واقعی جدید fail یا unexecuted باشد، قبل از مجوز اجرای هدف باید همان gate در محیط با ظرفیت کافی تکمیل شود.

برای آزمون pre-acceptance در CI، مسیر مجزای protocol fixture فقط با سه جزء هم‌زمان `kind=PARALLEL_FRESH_INSTALL_PROTOCOL_FIXTURE`، `target_config=DISPOSABLE_QA` و bundle `didar-nginx-wrapper-protocol-fixture` پذیرفته می‌شود. receipt آن `FIXTURE_ONLY`/`QA_ONLY` است و تمام منابع تازه label مخصوص disposable دارند؛ source/image/hash، HMAC/TLS، no-demo، baseline، ownership و حداقل ظرفیت همچنان enforce می‌شوند. این مسیر مجوز target نیست و state آن به نصب واقعی promote نمی‌شود. fixture receipt را به APPROVED تبدیل نکنید یا از آن روی staging استفاده نکنید. موفقیت unit tests این مسیر، جای اجرای کامل actual-image lifecycle نیست.

«03 — DIDAR Deployment & Runtime QA» پس از انتقال دستی این سند، target discovery و ظرفیت را تکمیل، اصل legacy را حفظ و اجرای مجاز را به مالک راهنمایی می‌کند. Public HTTPS از اتصال مستقل Internet، native/customer journeys، API/media/RBAC/tenant isolation و restart/recovery هدف هنوز جداگانه لازم‌اند. این سند ادعای ارسال خودکار به گفت‌وگوی دیگری، نصب، Internet acceptance یا production readiness ندارد.
