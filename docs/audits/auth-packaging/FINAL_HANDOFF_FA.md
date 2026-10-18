# تحویل بسته‌بندی authentication برای Chief Architect

اجرای اصلی بسته و provenance داخل image: `PASS`. این تحویل برای `Chief Architect review` است و مجوز rollout نیست.

[بازبینی مستقل غیرپیاده‌ساز](INDEPENDENT_REVIEW.md) و [verdict ساختاری](../../../verification/auth-packaging/reviewer/FINAL_REVIEW.json) مرجع پذیرش محدود هستند؛ reviewer کد application یا packaging را ننوشته است. raw receipts و failureهای هر attempt در همان evidence tree حفظ شده‌اند.

شاخهٔ `feature/auth-deployment-packaging` دقیقاً از `d9b55b3856d6e52ba86db517430572c2d46761e0` ساخته شد. اصلاحات PR #24 و PR #25 حفظ شده‌اند؛ source برنامه در `apps/` و `packages/`، lockfile و root package نسبت به baseline تغییر ندارد. تنها تغییر آزمون پایدار auth، انتخاب transport سازگار با HTTPS است؛ assertionها تغییر نکرده‌اند.

`reviewed_packaging_source_sha`: **`9846b5042e90d06d14d00b5fefdf67ebba455ec0`**. commitهای بعدی تحویل فقط evidence و documentation خواهند بود؛ exact final delivery SHA در PR و پیام نهایی ثبت می‌شود. ابزارها و receiptهای جدید را نباید به اشتباه متعلق به packaging source SHA دانست.

## artifact نهایی مورد بررسی

| جزء | exact OCI image ID |
| --- | --- |
| API | `sha256:98753972be374eede0b5daf13fcc49ceb74993bafb9393a87faba56de62e6d57` |
| Storefront | `sha256:e9c423deab03f4a71d8b1d4f99ae44cf2ea55974ff7e955bd41733970a9b9936` |

هر دو revision label برابر source `9846b5042e90d06d14d00b5fefdf67ebba455ec0` دارند. manifest بسته شامل `3799` ورودی فایل/لینک و content SHA256 برابر `2163dc0d9191b65475ebf1172fc624b4613bfaca71f5dad5d305fa87f57fce18` است. [ARTIFACT_PROVENANCE.json](../../../verification/auth-packaging/ARTIFACT_PROVENANCE.json) hash context، manifest، base imageها و actual build-script exit را نگه می‌دارد؛ [SOURCE_PROVENANCE.json](../../../verification/auth-packaging/SOURCE_PROVENANCE.json) فایل‌های بسته‌بندی و برابری app/compiled source را ثبت می‌کند.

مسیر Git-excluded روی candidate نهایی نیز اجرا شد: source SHA ناموجود عمداً `1`؛ build و verify با SHA صحیح هر دو `0`؛ wrapper `0`. لینک‌های نسبی داخل snapshot و خروجی بسته کنترل شدند و محتوای نتیجه دقیقاً همان `2163dc…` بود. این بررسی builder، اجرای application یا full source Docker build محسوب نمی‌شود.

## اصلاحات و قرارداد بسته

entrypointهای موجود بررسی شدند: `Dockerfile`، `Dockerfile.prebuilt`، `Dockerfile.storefront`، `compose.yaml`، `scripts/build-prepared-images.sh` و standalone. همهٔ مسیرهای storefront اکنون از builder مشترک و `runtime/storefront.mjs` استفاده می‌کنند. بستهٔ تازه، private Next، ingress پذیرفته‌شدهٔ PR #25، dependency فیزیکی `@didar/auth-network`، health check و manifest فایل‌ها را با هم حمل می‌کند. builder خروجی Next را درجا تغییر نمی‌دهد.

در قرارداد محدود Compose، storefront از network namespace همان API استفاده می‌کند؛ API هر دو host port را فقط روی loopback منتشر می‌کند. Next روی `127.0.0.1:3001` خصوصی است؛ ingress روی `0.0.0.0:3000` داخل namespace فقط با TLS اجرا می‌شود؛ API اصلی `9000` است. Next→API روی loopback و `DIDAR_AUTH_PROXY_PEERS=127.0.0.1` است. این قرارداد یک میزبان/یک API است و topology سرور مالک فرض یا تأیید نشده است.

[مستند کامل configuration و entrypointها](../../AUTH_DEPLOYMENT_PACKAGING.md): key مشترک server-only حداقل 32 bytes، `COOKIE_SECRET` پایدار، provenance SHA دقیق، directory گواهی read-only، certificate DNS name صحیح، CORS واقعی و private/public routing لازم‌اند. health check دو transport کاتالوگ را بررسی می‌کند و جایگزین functional auth نیست. supervisor ترتیب startup، fail-closed، توقف sibling هنگام crash و shutdown محدود را اجرا می‌کند؛ API shell نیز Node را `exec` می‌کند.

## شکست واقعی و اصلاح

اجرای اول `package-20261018073024528-22e6459c` روی source `6cd8cf464e43fcc73392d0e120b1934194a15c81` در migration شکست خورد: فیلتر عمومی `--exclude=verification` پوشهٔ `providers/verification` در Medusa Auth را حذف می‌کرد. پیام اصلی `Cannot find module '../providers/verification/token'` و actual exitهای schema/container/runner/supervisor همگی `1` حفظ شده‌اند. auth/PR24/browser/lifecycle آن اجرا `NOT_EXECUTED` هستند.

فیلتر به root-only `--exclude=./verification` اصلاح شد؛ هیچ کد framework یا auth عوض نشد. imageهای تازه برای اجرای کامل متأثر ساخته شدند. منابع موقت اجرای ناموفق پاک شدند و ۱۰ container قبلی و volume/state آنها حفظ شدند. imageهای ناموفق با exact ID و `--no-prune` کنار گذاشته شدند؛ یک درخواست پاکسازی cache با exact owned cache ID، `0B` reclaimed گزارش کرد. هیچ broad prune یا حذف دادهٔ مالک انجام نشد.

اجرای دوم `package-20261018073925940-16c3ef9d` با imageهای اصلاح‌شده در migration با timeout شکست خورد؛ schema/runner/supervisor actual `1` و مراحل بعدی `NOT_EXECUTED` هستند. diagnostic واقعی نشان داد fixture reviewer برخلاف Compose پذیرفته‌شده فاقد `?sslmode=disable` بود؛ SDK برای hostname داخلی Docker، TLS انتخاب می‌کرد. با flag موجود در Compose، همان image و اتصال SDK `SELECT 1` موفق شدند. timeout افزایش نیافت و application/image عوض نشد. یکی از اجراهای ابزار diagnostic نیز به‌علت import مستقیم dependency غیرمستقیم با exit `1` متوقف شد؛ import ابزار به `@medusajs/framework/utils` اصلاح و اجرای بعدی با actual wrapper `0` موفق شد. تمام failureها، snapshot ابزارهای هر attempt و cleanupها نگه داشته شده‌اند.

بررسی ساختاری Git-excluded روی candidate قبلی `909fed4` با copy فیزیکی ورودی‌ها اجرا شد؛ این بررسی application server اجرا نکرد و به‌تنهایی runtime را تأیید نمی‌کرد: بدون source SHA عمداً child `1`؛ با SHA صحیح build و verify هر دو `0`؛ wrapper `0`. manifest نوع `BUILD_CALLER_SOURCE_SHA` و محتوای `8118` فایل با hash `46525920af5f03e99a52074ca2ad53314f4f101fbdd62cd2971d4679e1b96689` دقیقاً با artifact واقعی برابر بود. در این بررسی builder هیچ application server اجرا نشد.

اجرای سوم `package-20261018074841200-82d25449` migration و native QA seed را با actual `0` گذراند، اما private Next با `Cannot find module 'styled-jsx/package.json'` و child `1` متوقف شد؛ supervisor container، runner و supervisor ناظر نیز `1` شدند. تبدیل همهٔ symlinkهای Bun به directory فیزیکی، جای واقعی Next را از dependencyهای همسایه جدا کرده بود. حفظ لینک‌های نسبی که تماماً داخل artifact resolve می‌شوند، همراه با manifest فایل/لینک و رد هر لینک خارجی/مطلق/خراب، در `9846b50` پیاده شد. `@didar/auth-network` همچنان physical package مستقل داخل image است. OS/CPU نیز با runtime تطبیق داده می‌شود.

parity source بسته‌بندی در اجرای سوم نیز `FAIL` ثبت شد: رفع packager پس از مشاهدهٔ crash و پیش از پایان cleanup آغاز شد. ۵۲ فایل واقعی tests و imageهای اجراشده تغییر نکردند؛ diagnostic مسیرهای تغییرکرده را مشخص می‌کند و پیام عمومی `Frozen root test source changed` نباید تغییر test assertion تعبیر شود. snapshot ابزارهای هر attempt حفظ شده و این شکست پنهان نشده است. stderr اصلی container پیش از cleanup ذخیره نشده بود؛ observation آن صریحاً transcription است. بازتولید جداگانه روی همان image قدیمی و `network=none`، raw stderr تازه و actual container `1` را ثبت کرد؛ wrapper تشخیصی به‌دلیل انتظار درست همین شکست `0` بود. این بازتولید به‌جای log اصلی جا زده نشده است.

## شواهد تازهٔ artifact واقعی

اجرای مستقل `package-20261018080328338-54401542` روی source و imageهای جدول بالا به پایان رسید. [COMPLETE.json](../../../verification/auth-packaging/reviewer/runs/package-20261018080328338-54401542/COMPLETE.json) close واقعی browser، runner و supervisor را جداگانه ثبت می‌کند؛ exit خود monitor مشاهده نشده و ادعای آن نشده است.

| مرحلهٔ تازه | نتیجه / actual exit |
| --- | --- |
| ساخت prepared imageهای نهایی | build-script child `0`؛ wrapper `0` |
| migration/schema/demo و native QA seed روی PostgreSQL مجزا | هر دو child/container `0` |
| تست‌های پایدار متأثر | `16 pass / 0 fail / 299 assertions`؛ child `0` |
| HTTP/PostgreSQL مستقل | `19` قبل و `4` پس از restart؛ هر دو child `0` |
| مرورگر واقعی Admin/Vendor/Customer | `3` journey؛ `6` screenshot؛ `page_errors=[]`؛ child `0` |
| browser / runner / supervisor ناظر | هر سه `0` با receipt واقعی |
| private listener | فقط `127.0.0.1:3001`؛ اتصال به eth0 رد شد؛ unsigned auth پاسخ `403` |
| fail-closed configuration | هر چهار container عمداً `1`؛ key/TLS/upstream/port نامعتبر |
| مرگ private Next و recovery همان container | supervisor عمداً `1`، sibling متوقف؛ recovery موفق |
| shutdown عادی و restart واقعی API/frontend | service containerها `0`؛ persistence و replay دوباره بررسی شدند |
| parity / cleanup | `PASS`؛ حذف ۱۰ container موقت، دو volume و network/TLS همان اجرا؛ حفظ ۱۰ container قبلی و state/volume آنها |
| full API image source/output provenance | `395` source path و digest خروجی کامل برابر؛ container `0` و wrapper `0` |

در [لاگ تست پایدار](../../../verification/auth-packaging/reviewer/runs/package-20261018080328338-54401542/persistent-affected-tests.log)، ۱۰ تست auth و ۶ تست PR #24 اجرا شده‌اند. transport تست فقط HTTPS-aware شده است. [HTTP verdict](../../../verification/auth-packaging/reviewer/runs/package-20261018080328338-54401542/http-verdict.json) و receiptهای قبل/بعد شامل جداسازی واقعی sourceها پشت Next مشترک، spoof/rotation/replay/body/path/peer، رقابت همزمان و قفل‌های واقعی PostgreSQL، ورود مجاز victim از source دیگر، native authority و product guards هستند. fingerprint داده‌های Product/Offer/inventory/order/finance در fixture ثابت ماند؛ خالی‌بودن بخشی از fixture، آزمون تاریخچهٔ مالی پرشده محسوب نمی‌شود.

بررسی imageها روی `/app` انجام شد: هیچ app/dependency bind mount یا لینک خارج از artifact وجود نداشت؛ فقط گواهی موقت QA read-only mount شد. `@didar/auth-network` داخل image فیزیکی است و ۱۴۰ لینک نسبی dependency همگی در artifact resolve می‌شوند. digest فایل‌ها و link-map ابتدایی/انتهایی برابرند. readiness pollهای اولیه با exit `1` و سپس `0` نگه داشته شده‌اند؛ آنها شکست functional test یا موفقیت زودهنگام تلقی نشده‌اند.

در تزریق fault، private Next پس از `SIGTERM` واقعاً با `0` بسته شد؛ چون خروجش برای supervisor غیرمنتظره بود، supervisor ingress را متوقف کرد و container با `1` خارج شد. در shutdown کل سرویس، supervisor و Next با `0` پایان یافتند و ingress سیگنال `SIGTERM` داشت؛ برای این child، exit ساختگی `0` گزارش نشده است.

[provenance مستقل تکمیلی](../../../verification/auth-packaging/reviewer/provenance/runs/provenance-20261018081109674-2709dec2/RESULT.json) از همان API image، با `read-only`، `network=none` و بدون mount اجرا شد. hash source برابر `ea2239fcacbbbc80b2495388267d82d90f8edc33e2424b68fb692eef5186de05` و output برابر `ea1943ce90637868e9fceffd03477f5e4840834cf63beb747520659602547d37` است. actual Node داخل image برابر `24.22.0`، در برابر builder `24.19.0`، جداگانه ثبت شده؛ برابری نسخه ادعا نشده است. receipt خروج wrapper و cleanup همان run محفوظ است.

Screenshotهای واقعی در عرض‌های `1440` و `390`: [native Admin](../../../verification/auth-packaging/reviewer/runs/package-20261018080328338-54401542/screenshots/native-admin-auth-1440.png)، [native Vendor](../../../verification/auth-packaging/reviewer/runs/package-20261018080328338-54401542/screenshots/native-vendor-auth-1440.png)، [Customer از signed ingress](../../../verification/auth-packaging/reviewer/runs/package-20261018080328338-54401542/screenshots/customer-signed-ingress-auth-1440.png) و [پوشهٔ هر شش تصویر](../../../verification/auth-packaging/reviewer/runs/package-20261018080328338-54401542/screenshots/). coordinator نیز سه تصویر Admin desktop، Vendor mobile و Customer desktop را مشاهده کرد.

## شواهد inherited و محدودیت‌ها

منشأ source، packaging scripts، build context و imageها در `verification/auth-packaging/` ثبت شده است. outputهای compiled مربوط به API/Next/native panels عوض نشده‌اند و build receipt پذیرفته‌شدهٔ PR #25 تازه مقایسه شده؛ این **بازاجرای compiler نیست**. full source Docker build دوباره اجرا نشده است؛ مسیر prepared-image واقعاً build و روی imageهای حاصل آزمایش می‌شود. build context و OCI image IDs هویت artifact آزموده‌شده‌اند؛ mutable base tag و Debian repository تضمین bit-for-bit rebuild آینده نمی‌دهند. imageها به registry منتشر نشده‌اند؛ تحویل GitHub شامل source، دستور ساخت و provenance/evidence است.

`inherited_tested_application_sha` برابر `fb9daec7a947f234e7931c63f62d70e92e273c76` است؛ با packaging source `9846b50…` و final evidence commit یکی نیست. warning اصلی `Codegen failed` هنگام startup بومی مشاهده و در raw log حفظ شد؛ codegen/compile تازه موفق ادعا نشده است. assets بومی unchanged هستند و مسیرهای authenticated واقعی روی آنها اکنون موفق بوده‌اند.

اجراهای گستردهٔ بدون تغییر #18/#24/#25، restore تاریخی پرشده، finance/checkout/provider و Mac فقط `INHERITED` یا `NOT_EXECUTED` هستند. acceptance جدید محدود به بسته‌بندی، SEC-01/SEC-02 و محافظ‌های مرتبط PR #24 است. TLS موقت QA، target TLS/CA/termination سرور مالک را تأیید نمی‌کند. مرورگر QA از certificate exception محدود همان context استفاده می‌کند؛ HTTP probes و health با CA موقت و validation فعال اجرا می‌شوند.

NAT واقعی خارج از namespace ممکن است sourceها را مشترک کند؛ آزمون جداسازی source با socket واقعی loopback داخل namespace اجرا می‌شود و جایگزین اثبات network path عمومی نیست. topology عمومی، CDN، DNS، firewall، secret provisioning/rotation، ARM64/Mac، load/SLO و API pruning مستقل خارج از پذیرش این بسته‌اند. SEC-03/SEC-04 و semantics اصلی PR #25 تغییر نکرده‌اند.

در `Chief Architect review checkpoint` توقف خواهیم کرد؛ هیچ merge، تغییر `main`، rollout، تغییر سرور مالک، عملیات زندهٔ مالی/provider، S1، CRM یا Phase 5 مجاز یا انجام‌شده نیست.
