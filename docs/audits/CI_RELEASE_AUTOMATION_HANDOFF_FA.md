# تحویل CI و اتوماسیون انتشار DIDAR

مبنای بررسی: `4f41784db6ca67f7566503c508cc609f1d50c7ce`. این تغییر فقط workflow، tooling انتشار، آزمون قراردادهای artifact و مستندات اضافه می‌کند. application business logic، معماری، workflow قبلی، داده، شاخه‌ها و سرور مالک تغییر نمی‌کنند. PR برای بازبینی است؛ مجوز merge یا اجرای انتشار در این مأموریت صادر نشده است.

## پیاده‌سازی

- `didar-ci.yml`: اعتبارسنجی PR و push به main با Node 24.19.0 و Bun 1.4.3، frozen install، lint و typecheck، buildهای بومی و Next، backend/native HTTP و مرورگر از harness موجود، و نصب بدون demo.
- `didar-release.yml`: اجرای دستی با SHA دقیق و عبارت تأیید، opt-in مدیریتی و environment جدا؛ پذیرش فقط SHA متعلق به main با CI موفق همان SHA. build، بررسی مستقل artifact روی runner دوم و GHCR publication در jobهای جدا هستند.
- مجوزها: contents-read برای CI/build/verify؛ actions-read فقط برای بررسی نتیجه CI؛ packages-write فقط برای job انتشار. هیچ staging secret، SSH، deployment، pull_request_target یا workflow_run دارای اختیار انتشار اضافه نشده است.
- archive قابل‌دانلودِ بررسی‌شده پیش از GHCR منتشر می‌شود؛ شکست registry آن را حذف نمی‌کند. digest registry و image ID یکسان فرض نمی‌شوند و دسترسی ناشناس جدا گزارش می‌شود.
- راهنمای نصب و به‌روزرسانی میزبان موجود با بررسی backup/recovery، migration، secrets، TLS/trust/routing و مسئولیت چت «03» همراه artifact قرار می‌گیرد. این راهنما ادعای شناسایی یا تغییر واقعی میزبان ندارد.

## بررسی واقعاً اجراشده پیش از انتشار PR

| بررسی | نتیجه |
| --- | --- |
| Node 24.19.0؛ `node --test tests/ci-release.test.mjs` | ۶ آزمون موفق؛ صفر شکست/skip؛ actual exit 0 |
| `node --check` برای هر سه فایل scripts/ci | هر سه actual exit 0 |
| actionlint 1.7.12 روی هر دو workflow | actual exit 0 |
| parse هر دو YAML با PyYAML 6.0.3 | موفق؛ CI یک job و release چهار job |
| `git diff --cached --check` | actual exit 0 |

تست‌ها SHA/ref نامعتبر، digest/tag نامعتبر، ناسازگاری source/image label/architecture، حذف یکی از imageها، path traversal، build شکست‌خورده، checksum واقعی و دست‌کاری archive پیش از Docker load را بررسی می‌کنند. actionlint از release رسمی دریافت و SHA256 فایل با digest اعلام‌شدهٔ upstream تطبیق شد: `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`. استخراج نخست به علت ownership موجود در tar خروج ۲ داشت؛ استخراج بدون انتقال ownership خروج ۰ و اجرای linter خروج ۰ داشت. این خطای ابزار، خطای workflow یا آزمون برنامه محسوب نشده است.

## شواهد اجرا نشده و پیش‌نیازها

در executor محلی این بررسی Docker و Bun موجود نیستند؛ بنابراین application build، full suite، image build/boot، GHCR push/pull و runtime smoke محلی اجرا نشده‌اند. آن‌ها PASS اعلام نمی‌شوند. اجرای واقعی Actions پس از انتشار PR باید از خود run گزارش شود؛ این سند snapshot پیش از آن اجراست.

هیچ image یا release از این تغییر هنوز منتشر نشده؛ URL registry یا archive ساختگی ارائه نمی‌شود. نام و URL artifactهای واقعی پس از اجرای دستی مجاز، در summary خود workflow درج می‌شود. GitHub دانلود ممکن است ورود حساب بخواهد و retention آن ۳۰ روز است؛ owner باید نسخهٔ بررسی‌شده را قبل از انقضا نگه دارد.

ادمین مخزن باید environment `didar-release` را با required reviewer و main-only restriction تنظیم و سپس `DIDAR_RELEASE_ENABLED=true` را فعال کند. صرف نام environment اثبات protection نیست؛ تنظیم واقعی آن در این checkpoint NOT_VERIFIED است. GHCR visibility و دسترسی نوشتن package نیز باید بررسی شود. هیچ تنظیم مدیریتی خودکار تغییر نکرده است.

lint/type failures احتمالی موجود باید صادقانه باعث FAIL شوند؛ دستور root check-types که task واقعی ندارد جایگزین کنترل واقعی نشده است. برای این مأموریت خطاهای business/application را با تغییر منطق یا تضعیف معیارها پنهان نکنید.

پس از پذیرش Chief و merge، CI روی main اجرا شود؛ سپس نسخهٔ دقیق پذیرفته‌شده با تأیید جدا release گردد. انتشار با نصب استیجینگ یکی نیست. نصب و اثبات استفاده از اینترنت توسط چت «03 — DIDAR Deployment & Runtime QA» انجام می‌شود. S1، CRM، Phase 5، عملیات مالی زنده و Production Readiness خارج از نتیجهٔ این تحویل‌اند.

جزئیات audit، workflowها، مجوزها، فعال‌سازی و محدودیت‌ها: [CI_AND_RELEASE_AUTOMATION.md](../CI_AND_RELEASE_AUTOMATION.md). راهنمای همراه بسته: [CI_RELEASE_INSTALL.md](../CI_RELEASE_INSTALL.md).
