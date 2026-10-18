# تحویل یکپارچه‌سازی main و ادامهٔ نصب هدایت‌شدهٔ استیجینگ

## نتیجهٔ این checkpoint
بسته‌بندی PR #27 در محدودهٔ prepared Linux/amd64 پذیرفته شد. PRهای #15، #20، #24، #25 و #27 با حفظ تاریخچه در main ادغام شدند. #16/#17 (سیاست و طراحی)، #11 (گزارش تاریخی runtime)، #19/#21 (طراحی آینده، بدون فعال‌سازی) نیز ادغام شدند. #22 پس از اثبات حفظ محتوایش، superseded بسته شد؛ merge آن به تعارض مستندات رسید و نسخهٔ جدیدتر بازنویسی نشد.

نسخهٔ یکپارچهٔ بررسی‌شده پیش از اضافه‌شدن همین رسید: `0c4cae89b133902887b33ca17d1902bf4247624d`. PR حامل این رسید فقط مستندات اضافه می‌کند؛ SHA نهایی main بعد از آن در گزارش گفتگو و ایشیو مادر ثبت می‌شود. برای ساخت release، آخرین SHA مصوب main را تازه resolve و pin کنید.

## بررسی واقعاً انجام‌شده
معمار ارشد diff بسته‌بندی، گزارش مستقل، provenance و receiptهای خام COMPLETE/wrapper/supervisor اجرای `package-20261018080328338-54401542` را خواند. هر سه خروج ثبت‌شده صفر هستند. بازاجرای آزمون، مشاهدهٔ مستقیم Docker آن executor یا مشاهدهٔ تصاویر توسط معمار ارشد در این checkpoint انجام نشد.

مقایسهٔ تمام leaf entryهای Git (blob SHA و mode) میان main فوق و PR #27 در `f83163fb5501aa841bec87e38b57fa359f9c27c9` نشان داد اختلاف فقط در AGENTS.md و شش مستند است. کد، آزمون‌ها، lockfile، Dockerfileها، Compose و scripts همان نسخهٔ پذیرفته‌شده‌اند. بنابراین شواهد runtime قبلی inherited هستند؛ آزمون تازهٔ ادغام ادعا نمی‌شود.

نامساوی‌بودن tree کامل merge و head به علت حفظ راهنمای دائمی مالک و مستندات است، نه تغییر runtime. راهنمای دائمی قبلاً در main اضافه شده بود و حفظ شد.

## حدود پذیرش و اولویت تصمیم‌ها
- MERGED_MAIN: برقرار؛ STAGING_DEPLOYED و INTERNET_ACCESS_VERIFIED: برقرار نیستند.
- پذیرش بسته‌بندی، تأیید کامل معماری یا PRODUCTION_READY نیست.
- طراحی آیندهٔ #19/#21 با ادغام تبدیل به پیاده‌سازی یا مصوبهٔ تمام اقتصاد محصول نمی‌شود.
- تصمیم قطعی مالک: عیار پایهٔ معادل 750؛ تأیید خرید حضوری داخل حساب مشتری مسیر اصلی و OTP کمکی. سؤال‌ها و عبارت‌های قدیمی متعارض در گزارش تاریخی #21 superseded هستند.
- محدودیت‌های تاریخی SEC-03/SEC-04، قرارداد پنج‌لایهٔ تاریخی، provider/legal/distributed/capacity و مسیرهای تأییدنشده همچنان برقرارند.

## artifactهای آزموده‌شده
Packaging source: `9846b5042e90d06d14d00b5fefdf67ebba455ec0`.
Application source inherited: `fb9daec7a947f234e7931c63f62d70e92e273c76`.

- API image: `sha256:98753972be374eede0b5daf13fcc49ceb74993bafb9393a87faba56de62e6d57`.
- Storefront image: `sha256:e9c423deab03f4a71d8b1d4f99ae44cf2ea55974ff7e955bd41733970a9b9936`.
- Frontend manifest: 3799 entry، content SHA256 `2163dc0d9191b65475ebf1172fc624b4613bfaca71f5dad5d305fa87f57fce18`.

این imageها local-only هستند؛ registry digest یا فایل image export قابل‌دریافت منتشر نشده است. آنها را image ساخته‌شده از SHA جدید main معرفی نکنید. تفاوت source، packaging، documentation و release SHA باید حفظ شود.

## فاصلهٔ تحویل باقی‌مانده
وضعیت صحیح فعلی: **MAIN_CONSOLIDATED / TRANSFERABLE_RELEASE_PENDING**.
هنوز READY_FOR_GUIDED_STAGING_INSTALL اعلام نمی‌شود.

executor این بررسی Docker و Bun نصب‌شده و imageهای QA قبلی را در اختیار ندارد؛ فقط Node و Git در این محیط موجودند. ساخت/اجرای image یا استخراج باینری از executor دیگر قابل ادعا نیست. development agent دارای محیط build باید کار مجاز زیر را کامل کند:

1. main نهایی را تازه fetch و SHA آن را pin کند؛ کد یا قابلیت جدید اضافه نکند.
2. از همان SHA بستهٔ release واقعی بسازد. reuse compiled output فقط پس از اثبات source/artifact/platform parity و با ثبت inherited compiler evidence مجاز است؛ در غیر این صورت build لازم اجرا شود.
3. artifact قابل‌انتقال تحویل دهد: imageهای immutable در registry قابل‌دسترسی، یا docker-save archiveهای فشرده با checksum و محل دریافت واقعی. source archive یا image ID محلی جایگزین artifact تحویلی نیست.
4. manifest شامل main SHA، image IDs/digests، platform، entrypointها، runtime versionها و فایل‌های نصب باشد؛ secrets وارد archive/manifest نشوند.
5. packaged artifact نهایی را بررسی و نتیجهٔ تازه را از inherited evidence جدا کند.
6. runbook عملی برای میزبان موجود، backup/recovery، data-preserving migration، secrets، lifecycle و صحت دسترسی عمومی آماده کند.
7. نصب واقعی سرور را به چت «03 — DIDAR Deployment & Runtime QA» بسپارد. development agent در این مأموریت به سرور مالک وصل نشود.

## مسیر قدیمی Debian
دو شاخهٔ منحصربه‌فرد استیجینگ فعلاً حفظ می‌شوند:
- `staging/debian13-phase2-00447d3`: شامل deploy/debian13/{README.md,Dockerfile,compose.yaml,init-env.mjs,stack.sh,update.sh,test_deployment.py} و receiptهای قدیمی.
- `staging/release-41089a7-domain-preview`: شامل deploy/debian13/release-41089a7.sh.

این مسیرها در main جدید وجود ندارند و متعلق به releaseهای قدیمی‌اند. قبل از استفاده، development agent باید آنها را بخواند، نیازهای واقعی نصب را با بستهٔ جدید تطبیق دهد و راهنمای معتبر را از دستور قدیمی جدا کند. آنها را کورکورانه merge یا روی سرور اجرا نکنید. تا این تطبیق و حفظ محتوای لازم، حذف این دو شاخه مجاز اعلام نمی‌شود.

## پذیرش اینترنتی توسط چت 03
هدف: استفادهٔ ویترین، حساب مشتری، /dashboard، /seller و API/media لازم از دامنه با HTTPS، بدون tunnel/VPN/local server یا روشن‌بودن رایانهٔ مالک. پایگاه داده، Redis و Next خصوصی داخلی می‌مانند.

توپولوژی واقعی TLS/reverse proxy باید پیش از اجرا بررسی شود: قرارگرفتن proxy معمولی پیش از signer مبتنی بر socket، IP مشتری را خودکار حفظ نمی‌کند. Compose پذیرفته‌شده پورت‌های میزبان را loopback منتشر می‌کند و به‌تنهایی اثبات دسترسی اینترنتی نیست. چت 03 باید routing عمومی سازگار با trust model، گواهی، secret provisioning، native routes، backup و rollback را براساس میزبان موجود اثبات کند.

هیچ rollout، اتصال سرور مالک، عملیات مالی زنده یا شروع S1/CRM/Phase 5 در این checkpoint انجام نشده است.

## شاخه‌ها
[رسید ماشین‌خوان یکپارچه‌سازی و وضعیت شاخه‌ها](MAIN_CONSOLIDATION_RECEIPT.json) نام و SHA شاخه‌های بررسی‌شده را ثبت می‌کند. فقط پس از تطبیق دوبارهٔ remote head با SHA ثبت‌شده، شاخه‌های ELIGIBLE قابل حذف توسط مالک‌اند. هیچ شاخه‌ای در این اجرا حذف نشد. شاخه‌های KEEP نیازمند بررسی محتوای منحصربه‌فرد هستند.
