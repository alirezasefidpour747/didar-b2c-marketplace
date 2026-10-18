# تحویل SEC-01 / SEC-02 برای Chief Architect

این بسته فقط اصلاح محدود authentication در Issue #23، روی اصلاحات PR #24 است. شاخهٔ `feature/sec01-sec02-auth-hardening` دقیقاً از `2c634ffdb77d4683271b5b218ca0a606af74004a` ساخته شد؛ `main` مبنا قرار نگرفت. وضعیت تحویل: `READY_FOR_CHIEF_ARCHITECT_REVIEW`، بدون merge یا مجوز rollout.

## منشأ کد و شواهد

- `reviewed_application_sha`: **`fb9daec7a947f234e7931c63f62d70e92e273c76`**؛ تمام تغییرات application، migration، transport و آزمون‌های پایدار در همین commit هستند.
- commit تحویل بعدی فقط documentation، ابزار بررسی و evidence را اضافه می‌کند؛ SHA دقیق آن در PR و پیام نهایی ثبت می‌شود. فایل‌های جدید evidence را نباید به اشتباه متعلق به application SHA بالا دانست.
- source receipt: `ea2239fcacbbbc80b2495388267d82d90f8edc33e2424b68fb692eef5186de05`؛ output receipt: `ea1943ce90637868e9fceffd03477f5e4840834cf63beb747520659602547d37`.
- اجرای مستقل: [`auth-20261018055943718-62ed321f`](../../../verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f/COMPLETE.json)، روی Linux x64، Node 24.19.0، PostgreSQL 17 و Redis 7 موقت و اختصاصی. این اجرا روی سرور مالک انجام نشده است.

## اصلاح انجام‌شده

`apps/storefront/auth-ingress.mjs` آدرس واقعی socket را می‌خواند، هدرهای انتساب ورودی را حذف می‌کند و assertion کوتاه‌عمر HMAC می‌سازد. Next فقط assertion معتبر را می‌پذیرد و همان nonce/timestamp را با bytes واقعی درخواست API مجدداً امضا می‌کند. API علاوه بر امضا و body/method/path، peer مجاز را بررسی و nonce را به‌صورت یک‌بارمصرف در PostgreSQL ثبت می‌کند. درخواست مستقیم بدون assertion صرفاً از `req.socket.remoteAddress` استفاده می‌کند؛ هدر نامعتبر به direct mode تنزل نمی‌یابد. این `Policy A` است، نه تغییر در authentication یا identity authority.

quota مشترک Next حذف و با counter اتمیک برای verified network و network × normalized account جایگزین شد. account-wide pressure فقط تأخیر محدود دارد و حساب را مسدود نمی‌کند. چهار slot کاری PostgreSQL و یک slot برای هر network، کار واقعی async scrypt را محدود می‌کنند. فرمت password و session، native `/auth/*`، RBAC و tenant authority حفظ شده‌اند. index افزایشی `didar_login_attempt_expiry_idx` و پاکسازی محدود فقط برای operational auth state اضافه شده است.

شرح کامل topology و configuration در [AUTH_NETWORK_TRUST_AND_THROTTLING.md](../../AUTH_NETWORK_TRUST_AND_THROTTLING.md) است. Customer auth اکنون به first-hop signer، private Next و key مشترک server-only نیاز دارد؛ اجرای bare `next start` یا standalone قدیمی به‌تنهایی entrypoint پشتیبانی‌شدهٔ ورود مشتری نیست.

## شواهد تازه اجراشده

تمام exit codeهای زیر از مشاهدهٔ واقعی پایان child process آمده‌اند، نه از متن خلاصهٔ log. پوشهٔ build: [`20261018055535204`](../../../verification/auth-hardening/builds/20261018055535204/)، پوشهٔ runtime: [run مستقل](../../../verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f/).

| Stage | نتیجه | actual exit / signal |
| --- | --- | --- |
| Frozen dependency install | `PASS`؛ بدون dependency upgrade | `0 / null` |
| Ingress syntax | `PASS` | `0 / null` |
| API production build | `PASS` | `0 / null` |
| Next production build | `PASS` | `0 / null` |
| Build runner، مشاهده‌شده توسط tool parent | `PASS` | `0 / null` |
| Local-workflow tooling | `23 PASS`, `67 assertions` | Bun `0 / null`؛ wrapper `0` مشاهده‌شده توسط tool parent |
| PostgreSQL schema/demo seed | `PASS` | `0 / null` |
| Native QA seed | `PASS` | `0 / null` |
| Persistent affected regression | `16 PASS`, `299 assertions`؛ 10 authentication و 6 PR #24 | `0 / null` |
| Independent HTTP/PostgreSQL، قبل از restart | `19 PASS` | `0 / null` |
| Independent HTTP/PostgreSQL، پس از restart واقعی API | `4 PASS` | `0 / null` |
| Browser: native Admin، native Vendor، Customer | `3 PASS`؛ شش تصویر 1440/390؛ بدون page error | `0 / null` |
| Independent runner، مشاهده‌شده توسط supervisor | `PASS` | `0 / null` |
| Supervisor، مشاهده‌شده توسط monitor | `PASS` | `0 / null` |
| Coordinator final check، اجرای نخست | `FAIL` در parser گزارش review؛ application اجرا نشد | `1 / null`، wrapper `1` |
| Coordinator final check، پس از اصلاح parser | `PASS` با structured review و بررسی parity/links/receipts | `0 / null`، wrapper `0` |

API پیش از restart و API جدید هنگام cleanup هر دو `0 / null` داشتند؛ private Next نیز `0 / null`. first-hop ingress عمداً در cleanup با `SIGTERM` متوقف شد: `code=null / signal=SIGTERM`، نه test failure یا exit صفر. خروج monitor خودش مشاهده نشده و برای موفقیت runner ادعا نشده است. `runner-result.json` پیش از مشاهدهٔ supervisor نوشته شده و به‌درستی `NOT_YET_OBSERVED_BY_SUPERVISOR` دارد؛ نتیجهٔ نهایی از `wrapper-exit.json` و `supervisor-exit.json` و `COMPLETE.json` خوانده می‌شود.

جداسازی quota برای دو client واقعی روی همان transport، جعل هدر، تغییر cookie، normalization، قربانی هدف‌گرفته‌شده با ورود صحیح از network دیگر، concurrent request، raw-body/peer/nonce، replay پس از restart با proof هنوز تازه، registration مشتری و supplier pending، native login، foreign-seller denial و PR #24 actual-target protections اجرا شدند. در تعدادی از raw case receipts فیلد `status` عدد HTTP است؛ `200/401/403/429` در آن فیلد verdict نیست. phase verdict و exitهای واقعی فوق معیار تکمیل هستند و raw evidence بدون بازنویسی حفظ شده است.

Source و output قبل/بعد برابر؛ `1791` compiled file بدون تغییر یا addition؛ hash تمام `52` test file و هفت reviewer executable ثابت؛ shared workspace dependency در root و copy جداگانه hash شده است. `669` artifact اصلی Admin/Vendor نسبت به PR #24 ثابت هستند. این runtime از dependency symlinkهای workspace استفاده کرده و آزمون یک deployment bundle مستقل نیست.

هر دو container/volume اختصاصی حذف شدند، process group زنده‌ای از اجرا باقی نماند و `10` container قبلی و volumeهای آنها حفظ شدند؛ جزئیات در `cleanup.json` است. هیچ live provider/financial operation انجام نشد.

## تصاویر واقعی

تصاویر از همان اجرای مستقل و sessionهای واقعی هستند؛ فقط QA fixture دارند:

| محیط | Desktop | Mobile |
| --- | --- | --- |
| Native Admin | [1440](../../../verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f/screenshots/native-admin-auth-1440.png) | [390](../../../verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f/screenshots/native-admin-auth-390.png) |
| Native Vendor | [1440](../../../verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f/screenshots/native-vendor-auth-1440.png) | [390](../../../verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f/screenshots/native-vendor-auth-390.png) |
| B2C Customer | [1440](../../../verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f/screenshots/customer-signed-ingress-auth-1440.png) | [390](../../../verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f/screenshots/customer-signed-ingress-auth-390.png) |

## بررسی مستقل و محدودیت‌ها

[CORE_REVIEW.md](CORE_REVIEW.md) بررسی مستقل طراحی و source را ثبت می‌کند. دو ایراد nonce retention و ترتیب raw-body middleware پیش از freeze اصلاح شدند. source checkpoint این reviewer `PASS` بود؛ نوبت نهایی این agent به‌علت محدودیت خودکار پلتفرم تکمیل نشد و به‌عنوان final runtime approval او گزارش نمی‌شود. [INDEPENDENT_ACCEPTANCE.md](INDEPENDENT_ACCEPTANCE.md) مرجع verdict نهایی reviewer جداگانه است که هیچ application code ننوشته، source/config را بررسی و اجرای واقعی را مدیریت کرده است.

- `NOT_VERIFIED`: سرور مالک، TLS عمومی، CDN/reverse-proxy متفاوت، firewall، secret provisioning/rotation، standalone/container packaging هدف، Mac، load/SLO و distributed botnet. key server-only حداقل 32 bytes، `DIDAR_AUTH_PROXY_PEERS` دقیق، `COOKIE_SECRET` پایدار و public/private routing صحیح پیش‌نیاز هستند.
- یک NAT واقعی همچنان quota و work-slot مشترک دارد؛ attacker روی همان network می‌تواند 429 موقت ایجاد کند. این اصلاح account-global lockout ندارد و برای همهٔ انواع DoS ادعای مصونیت نمی‌کند.
- Native provider throttling (`SEC-03`) و password trimming (`SEC-04`) خارج از دامنه‌اند. پیام configuration failure فعلاً identifier فنی `AUTH_NETWORK_NOT_CONFIGURED` دارد؛ localization آن گسترش داده نشده است.
- full program قبلی #18/#24، restore تاریخی پرشده، checkout/ledger/provider و آزمون‌های بدون تغییر دوباره اجرا نشدند. evidence آنها فقط `INHERITED` است؛ تازه بودن این بسته محدود به جدول بالاست. Product/Offer در QA واقعی و غیرخالی بودند؛ UID/order/financial history در fixture تازه خالی بود و بررسی fingerprint آنها جایگزین آزمون دادهٔ تاریخی پرشده نیست.
- مرحلهٔ coordinator final check ابتدا به‌دلیل regex اشتباه برای متن verdict با exit `1` متوقف شد؛ گزارش مستقل از قبل `PASS` بود. parser ابزار coordinator به structured `INDEPENDENT_FINAL_CHECK.json` اصلاح شد، log شکست حفظ شده و application/test/reviewer source تغییر نکرد. بررسی whitespace کل بسته به‌علت CR/trailing whitespace در raw Next build log با exit `2` هشدار داد؛ log اصلی حفظ شد و بررسی code/documentation با کنارگذاشتن فقط `verification/**/*.log` با exit `0` گذشت. هیچ مرحلهٔ runtime این اجرای مستقل fail نشد. metadata numeric-status nuance و توقف کنترل‌شدهٔ ingress صریحاً ثبت شدند؛ platform interruption در reviewer نیز پنهان نشده است.

در `Chief Architect review checkpoint` توقف می‌کنیم. هیچ merge، تغییر `main`، deployment، تغییر سرور مالک، S1، CRM یا Phase 5 انجام نشده و ادامه بدون تصمیم جداگانه مجاز نیست.
