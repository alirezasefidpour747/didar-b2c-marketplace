# بررسی توپولوژی release 874447e — تحویل به توسعه و Runtime QA

مبنا: `874447e6ec8fc58af3f09a87a4131b45c550a478`.

**نتیجه: `BLOCKED_ON_TOPOLOGY_ADAPTER`. این سند دستور نصب تأییدشده نیست.**

مالک گزارش کرده است Nginx روی HTTPS عمومی قرار دارد و applicationها روی Docker bridge با host-portهای loopback هستند. سرور مالک بررسی یا تغییر داده نشده است. اعتبار بسته در محیط ایزوله، سازگاری این توپولوژی مقصد را ثابت نمی‌کند؛ محدودیت target topology در گزارش release نیز باز مانده بود.

## یافته‌های سورس و بازتولید

| جزء در release | رفتار واقعی | نتیجه برای مقصد |
|---|---|---|
| `apps/storefront/auth-ingress.mjs` | همهٔ assertionهای ورودی و forwarding headers را حذف می‌کند؛ با `req.socket.remoteAddress` امضای جدید می‌سازد | پشت Nginx معمولی، peer پروکسی امضا می‌شود؛ XFF این رفتار را اصلاح نمی‌کند |
| همان ingress | تمام URIها را به یک Next origin ثابت می‌فرستد | `/dashboard` و `/seller` و API بومی باید routing مستقل به backend داشته باشند |
| supervisor بسته | Next را روی loopback داخل namespace قرار می‌دهد | دسترسی host به Next با یک proxy_pass ساده فرض نمی‌شود؛ بازکردن عمومی Next راه‌حل نیست |
| `compose.yaml` | API و storefront یک network namespace مشترک دارند؛ API/ingress فقط روی loopback میزبان publish می‌شوند | شبکهٔ bridge فعلی باید با namespace قرارداد بسته تطبیق داده شود؛ IPهای واقعی نباید حدس زده شوند |
| API auth admission | حالت بدون assertion فقط socket خودش را می‌بیند؛ assertion معتبر نیازمند peer دقیق، raw body، HMAC و مصرف nonce در PostgreSQL است | allowlist تنها یا trust proxy انتساب مشتری را درست نمی‌کند |
| Next auth route | assertion را پیش از decode بررسی و برای مسیر واقعی API با همان peer/ts/nonce دوباره امضا می‌کند | این قرارداد v1 باید حفظ شود |
| `native-workspace.tsx` | برای canonical-account proof به `/didar/login` POST می‌کند، سپس connect بومی را فراخوانی می‌کند | مسدودکردن عمومی این مسیر بدون جایگزین بررسی‌شده، اتصال حساب بومی را می‌شکند |

Probe مستقل از Nginx/Docker، با Node HTTP روی سورس همین release اجرا شد: IPهای `127.0.0.2` و `127.0.0.3` پشت reverse proxy، هر دو با peer `127.0.0.1` به signer رسیدند؛ assertion ورودی نیز جایگزین شد. همهٔ مسیرها به Next stub ثابت رفتند. خروج واقعی probe صفر است؛ این یعنی **بازتولید مانع موفق بوده، نه استقرار**. child ingress با `code=null, signal=SIGTERM` متوقف شد و خروج صفر برای آن جعل نشده است.

سورس probe و نتایج در `verification/topology-874447e/` هستند. actual Nginx، Docker bridge/NAT، PostgreSQL، native browser، اینترنت و سرور مالک در این probe اجرا نشده‌اند.

## تصمیم برای ادامه

QA قواعد اعتماد را تغییر نداده و نباید تغییر دهد. `X-Forwarded-For`، `X-Real-IP`، global trust proxy، CIDR گسترده، PROXY-protocol بدون implementation و خاموش‌کردن TLS راه‌حل تأییدشده نیستند. transparent proxy نیز نیازمند بررسی مستقل قابلیت‌ها و kernel routing است؛ گزینهٔ اضطراری آماده محسوب نمی‌شود.

مسیر پیشنهادی توسعه برای **حفظ Nginx TLS و bridge موجود**:

1. یک signer در مرز واقعی first-hop Nginx با همان قرارداد `didar-auth-network-v1` پیاده‌سازی و بررسی شود. ورودی انتساب، socket اصلی و تغییرنیافته است؛ semantics ماژول real_ip باید بررسی شود. هدر مرورگر مرجع IP نیست.
2. signer دقیقاً method، raw URI/query، raw body bytes، peer canonical، timestamp و nonce فعلی را امضا کند؛ سقف 1,200,000 byte و رد compressed auth حفظ شود. وابستگی اجرایی signer باید با Nginx واقعی سازگار و در آزمایش ایزوله اجرا شود؛ مثلاً njs صرفاً گزینهٔ implementation است، نه toggle موجود در release.
3. ingress به یک **حالت explicit verified relay** نیاز دارد که هم peer واقعی Nginx را با فهرست دقیق بررسی کند و هم HMAC را؛ proof معتبر را بدون تبدیل peer به IP پروکسی عبور دهد. حالت socket-first-hop موجود باید صریح و محفوظ بماند. نبود/خرابی proof در حالت relay نباید به حالت مستقیم تنزل یابد.
4. routing همان دامنه به Next و Medusa/Mercur جدا شود. مسیرهای auth مستقیم مورد استفادهٔ پنل‌ها نیز باید توسط signer لبه با مسیر و bytes واقعی امضا شوند و API تنها از peerهای دقیق بررسی‌شده proof بپذیرد. رفتار unsigned direct API برای client واقعاً مستقیم، با topology proxied عمومی یکسان تلقی نشود.
5. این تغییر runtime/package جدید است؛ imageها، supervisor، Compose overlay، Nginx signer/config و راهنمای نصب باید به‌صورت یک مجموعهٔ versioned بررسی و تحویل شوند. image release 874 با ویرایش دستی ingress یا bypass کردن manifest به نسخهٔ جدید تبدیل نمی‌شود.

این طراحی بررسی شده است؛ **implementation و پذیرش end-to-end آن هنوز انجام نشده است**. توسعه باید بستهٔ سازگار را تحویل دهد، سپس «03» نصب مقصد را هدایت کند. این سند مجوز merge، انتشار release تازه، تغییر سرور یا cutover نیست.

## نقشهٔ routing الزامی

| مسیر عمومی | مقصد منطقی و الزام |
|---|---|
| B2C، account، `/m/...`، `/_next/...` و سایر مسیرهای Next | verified ingress/relay به Next خصوصی |
| `POST /api/didar/login` و `register`، با query دقیق | signer Nginx → verified relay → Next → امضای مسیر واقعی API → API |
| `/api/didar/image` و `media-file` | proxy موجود Next، با حفظ authorization/context، Range و پاسخ رسانه |
| `/dashboard` و زیرمسیرها/assetها/deep links | API و پنل اصلی Admin Mercur |
| `/seller` و زیرمسیرها/assetها/deep links | API و پنل اصلی Vendor Mercur |
| `/auth/...`، `/admin/...`، `/vendor/...` و `/store/...` | API بومی، با قراردادهای احراز هویت و tenant فعلی |
| `POST /didar/login` و `register` در exposure موردنیاز | signer لبه و API admission با proof v1؛ حفظ dual-proof و منع unsigned proxy fallback |
| سایر `/didar/...` و `/static/...` | backend طبق inventory واقعی، با حفاظت خصوصی و سیاست انتشار موجود |
| health/readiness | طبق سطح دسترسی مصوب؛ backendهای داخلی صرفاً به‌خاطر health عمومی نشوند |

این جدول inventory حداقلی است، نه allowlist کامل قابل نصب. همهٔ callbackها، reset/inviteها، URLهای baked-in پنل‌ها، assetها و pathهای release باید بررسی شوند. `MERCUR_BACKEND_URL` زمان build با env زمان اجرا جایگزین نمی‌شود.

## پذیرش و recovery

چک‌لیست انگلیسی تفصیلی در [NGINX_BRIDGE_ACCEPTANCE_RECOVERY.md](../deployment/NGINX_BRIDGE_ACCEPTANCE_RECOVERY.md) است. حداقل خروجی لازم:

- Nginx واقعی و همان مدل Docker bridge/namespace در محیط disposable؛ دو IP مبدأ مستقل، حفظ IP واقعی و quota مستقل؛ جعل headers اثری نداشته باشد.
- missing/invalid/replayed/expired proof، تغییر method/path/query/raw bytes، peer ناشناس و failure signer/relay باید fail closed باشند. nonce بعد از 401/429 نیز قابل مصرف دوباره نباشد.
- ورود مشتری، Admin و Vendor، انتخاب seller و اتصال dual-proof واقعی، deep links، assetها، رسانهٔ عمومی/خصوصی، context isolation و 32 مرورگر موجود؛ CI کامل و no-demo در نسخهٔ نهایی.
- دریافت و اجرای artifact نهایی بدون workspace bind؛ source/image/config digest و actual exits، با بازبینی مستقل.
- target acceptance در «03»: HTTPS و انتساب از شبکه‌های مستقل اینترنتی، restart/recreate namespace و recovery؛ مرحلهٔ پاس‌نشده با PASS جایگزین نشود.

قبل از cutover، backup معتبر DB/media/config و نسخهٔ routing/image ثبت شود. recovery باید signer، relay، API/Next trust configuration و secret version سازگار را با هم برگرداند؛ `COOKIE_SECRET`، داده و ledger حفظ شوند. schema rollback یا restore خودکار پس از تراکنش‌های جدید مجاز نیست. اگر هیچ مسیر قبلی دارای پذیرش معتبر نیست، auth در maintenance/fail-closed بماند؛ unsigned proxied auth معادل recovery امن نیست.

## وضعیت تحویل

- Source/topology audit و بازتولید سازوکار مانع: انجام شد.
- بررسی مستقل: نیازمندی توسعه و حدود شواهد تأیید شد؛ جزئیات در `INDEPENDENT_REVIEW.md`.
- روش اجرایی سازگار با Nginx/bridge مقصد: **هنوز تحویل/آزمون نشده؛ BLOCKED**.
- Application، image، main و سرور مالک تغییر نکرده‌اند. صدور بستهٔ جدید یا بسته‌شدن این مانع ادعا نمی‌شود.

منابع رسمی بررسی تکمیلی: [Nginx proxy](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)، [real_ip](https://nginx.org/en/docs/http/ngx_http_realip_module.html)، [njs](https://nginx.org/en/docs/njs/reference.html)، [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/). مرجع نهایی پروتکل، سورس release است؛ اسناد عمومی به‌تنهایی سازگاری مقصد را ثابت نمی‌کنند.
