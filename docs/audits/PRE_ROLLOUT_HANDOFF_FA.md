# تحویل فارسی بسته بررسی پیش از rollout

مبنای واقعی شروع و `main`: **`4e953c7cf62c327b92f4a461d776fc11c772a9fb`**.
نقطه مقایسه تاریخی: `41089a7a0ac8084b74bb3a7f128f9a9ca038528b`.
کد و آزمون‌های بررسی‌شده: **`3a6e98f68dd38af1ad0c915f88d40ba8201e4dba`**.
کامیت نهایی بسته شواهد و نشانی PR در پیام تحویل GitHub/گفتگو ثبت می‌شود؛
کامیت شواهد، مرجع محصول یا منطق اجرایی را تغییر نمی‌دهد.

**ROLLOUT_NOT_EXECUTED — پذیرش معمار ارشد هنوز انجام نشده است.**
اصلاحات محدود مهندسی و بررسی مستقل انجام شده‌اند؛ کل بسته معماری به علت
تصمیم‌های حل‌نشده، **BLOCKED_PENDING_DECISION** است و «کاملاً بسته‌شده» اعلام نمی‌شود.
هیچ اتصال یا تغییری روی سرور مالک، staging، DNS، proxy یا firewall انجام نشده؛
محتوایی روی staging منتشر نشده و Phases 5–9 آغاز نشده‌اند.

## وضعیت جریان‌های مستقل

ابزار زیرعامل واقعاً در دسترس بود و چهار زیرعامل مستقل با مالکیت فایل مشخص و
پایگاه‌های دورریختنی جدا به‌صورت موازی کار کردند. هماهنگ‌کننده اصلاحات برنامه را
نوشت؛ بازبینان دیگر کد را بررسی و آزمون‌های مربوط را اجرا کردند.

| جریان | وضعیت | شواهد |
| --- | --- | --- |
| A، مجوزهای بومی و قدیمی | VERIFIED در محدوده مصوب | ۲۹ آزمون HTTP/PostgreSQL، ۵۶۳ assertion، بدون شکست؛ [گزارش مستقل](PRE_ROLLOUT_AUTHORIZATION.md) |
| C، CMS و رابط‌های بومی | VERIFIED با محتوای ساختگی آزمایش | چرخه کامل در Admin/Vendor اصلی و B2C، اندازه‌های ۱۴۴۰ و ۳۹۰، پاسخ‌های واقعی 403/404 و `noindex`؛ [گزارش مستقل](PRE_ROLLOUT_CMS_UI.md) |
| D، قابلیت و مرجع داده | PARTIAL؛ بررسی AS-IS کامل است | ماتریس مبتنی بر نسخه نصب‌شده و منابع کد آماده است؛ تغییر مرجع داده تصویب نشده |
| E، اقتصاد فروش میان تأمین‌کنندگان | BLOCKED_PENDING_DECISION | گزینه‌ها و طرح اثبات آماده‌اند؛ فروش retailer A از موجودی supplier B پیاده‌سازی نشده |
| Runtime | VERIFIED در محیط جدا؛ سرور مالک بررسی نشده | نصب، build، راه‌اندازی، نصب بدون demo، ارتقا/restart/restore و رسانه؛ [گزارش مستقل](PRE_ROLLOUT_RUNTIME.md) |

## ماتریس خلاصه قابلیت و مرجع داده

Mercur، SDK، Admin/Vendor و مستندات بسته‌بندی‌شده **2.3.7** و Medusa **2.21.2**
مستقیماً بررسی شدند. [ماتریس کامل با آداپتورها، نویسندگان، شکاف‌ها و گزینه‌های
Keep / Configure / Extend / Refactor](PRE_ROLLOUT_AUTHORITY_MATRIX.md) مرجع جزئیات است.

| حوزه | قابلیت بومی موجود | مرجع فعلی و تصمیم این بسته |
| --- | --- | --- |
| هویت و مشتری | User، Member، Customer و auth بومی | مشتری فعلی در DIDAR؛ اتصال اثبات‌شده به هویت پنل، بدون ادغام خودکار یا ساخت هویت رقیب |
| Seller / Merchant / Supplier | Seller و SellerMember و چرخه وضعیت | Supplier تجاری DIDAR و اتصال صریح بومی حفظ شد؛ مجوز شخص از صلاحیت فروش جداست |
| Product | Master/variant و workflow بومی | DIDAR Product مرجع فعلی؛ projection بومی محدود و محافظت‌شده، بدون تغییر نویسنده |
| taxonomy و facets | Category/Collection/Attribute | طبقه‌بندی، واژگان و تأییدهای فعلی DIDAR حفظ شدند؛ انتقال مرجع انجام نشد |
| Offer | Offer بومی برای variant | شرایط ساخت و Offer فعلی DIDAR مرجع باقی ماند؛ نویسنده دوم ایجاد نشد |
| موجودی / UID / RFID | موجودی تعدادی و reservation بومی | قطعه، وزن، UID دائمی و RFID اختیاری در DIDAR؛ بدون رزرو موازی |
| سبد / رزرو | Cart و جریان‌های بومی | quote و رزرو قطعه فعلی DIDAR حفظ شد |
| سفارش | OrderGroup، تفکیک سفارش و fulfillment | سفارش و snapshot تاریخی DIDAR تغییر نکرد؛ تبدیل به سفارش بومی نیازمند ADR است |
| قیمت‌گذاری | PriceList/Tax بومی | Gold-First، نسخه تعرفه و snapshotهای DIDAR حفظ شد |
| پرداخت | provider و payment بومی | پرداخت فعلی sandbox و mock؛ هیچ تراکنش زنده‌ای انجام نشد |
| تسویه | commission و payout بومی | تعهد و تسویه طلا/ریال DIDAR حفظ شد؛ payout پولی جایگزین تعهد طلا نشد |
| دفتر مالی | رکوردهای پرداخت/کمیسیون | دفتر دوطرفه و چندابزاری DIDAR مرجع ماند؛ دفتر جدید ساخته نشد |
| CMS و رسانه | SDK پنل و File/Media بومی | مدیریت در Admin/Vendor اصلی، نسخه‌ها و رسانه محافظت‌شده DIDAR و نمایش B2C حفظ شد |

## اصلاحات و آزمون‌ها

- فهرست مستقل variantهای Vendor دیگر محصول خصوصی یا unmapped را با count افشا نمی‌کند.
- Member غیرفعال با bearer قبلی دسترسی تجاری بومی ندارد؛ فعال‌سازی دوباره دسترسی مجاز را برمی‌گرداند.
- Store API عمومی، projection خصوصی DIDAR و orphan علامت‌خورده را پنهان می‌کند؛ محصولات عمومی مجاز و native-only بدون تغییر رفتار می‌مانند.
- جبران شکست ذخیره محصول، محصول تأییدنشده را published نمی‌کند؛ خطای تزریق‌شده PostgreSQL، ثبات رکورد اصلی و بازگشت draft را در HTTP واقعی اثبات کرد.
- خطای تصویر و تغییر منبع/اطلاعات احراز هویت، fallback فارسی دارد و تصویر خصوصی قبلی را نگه نمی‌دارد. پاسخ واقعی شبکه در آزمون نهایی انتظار کشیده می‌شود؛ اشتباه‌های اولیه fixture در گزارش C صریحاً ثبت شده‌اند.
- HTML هر دو پنل اصلی برای پیش‌نمایش خصوصی `noindex,nofollow` دارد؛ احراز هویت همچنان الزامی است.

فرمان‌های اصلی اجراشده در Linux دورریختنی:

```sh
MERCUR_BACKEND_URL=same-origin bun run build:all
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test -- --reuse-build
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test -- --no-demo-install-only --reuse-build
node verification/pre-rollout/probes/runtime-readiness.mjs
```

هر چهار build موفق‌اند. regression کامل: **۱۹۰ آزمون backend، ۲۶۱۳ assertion،
یک تست HTTP بومی و ۲۹ تست مرورگر، همگی موفق**. این اجرا با اجرای مستقل A و
آزمون جامع مستقل C یکی فرض نشده است. نصب dependency با lock ثابت، نصب بدون
demo و ۲۳ تست محلی ابزارهای deployment نیز موفق‌اند؛ تست‌های ابزار deployment
از فرمان‌های ساختگی استفاده می‌کنند و استقرار واقعی نیستند.
[لاگ‌ها، receipt و محدودیت هر آزمون](../../verification/pre-rollout/RESULTS.md).

## تصاویر و حفظ تاریخچه

تمام تصاویر از برنامه واقعی و محیط QA دورریختنی با محتوای آزمایشی مشخص‌اند:
[Admin بومی](../../verification/pre-rollout/screenshots/native-admin-cms-published-1440.png)،
[Vendor بومی](../../verification/pre-rollout/screenshots/native-vendor-cms-private-1440.png)،
[B2C دسکتاپ](../../verification/pre-rollout/screenshots/cms-published-1440.png)،
[B2C موبایل](../../verification/pre-rollout/screenshots/cms-published-390.png).
[فهرست کامل تصاویر](../../verification/pre-rollout/screenshots).

fingerprint کامل **۷۹ جدول DIDAR** پس از دو replay migration، restart PostgreSQL
و backup/restore واقعی به PostgreSQL جدا ثابت ماند؛ شامل ۲۰ UID، سفارش و
بازپرداخت، ۱۶ journal/۵۴ posting، تصویر، ویدیوی واقعی FFmpeg و نسخه‌های CMS است.
دو کپی تاریخی فقط‌خواندنی نیز به‌ترتیب ۷/۸/۲ و ۱۵/۸/۳ محصول/Offer/سفارش را
حفظ کردند. این دو snapshot قدیمی **جدول UID ندارند**؛ اثبات UID مربوط به QA
پرشده جدید است. دیتابیس، volume و تنظیمات اصلی reset یا جایگزین نشده‌اند.

## تصمیم‌های باز و توقف

۱. **دوام projection محصول:** اصلاح predicate، crash-atomicity ایجاد نمی‌کند.
گزینه‌ها آداپتور workflow هماهنگ یا projection یک‌طرفه با outbox، retry و
reconciliation پایدارند. پیشنهاد: حفظ نویسنده فعلی و تصویب یک اثبات محدود با
قطع فرایند در نقاط commit، پیش از هر تغییر بنیادی.

۲. **فروش A از موجودی B:** گزینه‌ها حفظ مدل فعلی همان تأمین‌کننده، نقش نمایندگی/
انتساب A، یا فروش مجدد با انتقال مالکیت و تعهد مستقل‌اند. پیشنهاد مشروط، بررسی
مدل نمایندگی است؛ فروشنده قانونی، عنوان کالا، custody، استحقاق طلا، refund و
تسویه باید توسط مالک/معمار ارشد مشخص شوند. این پیشنهاد، تصمیم تجاری تصویب‌شده نیست.

۳. **همگرایی بومی:** پیشنهاد تحقیق، همگرایی تدریجی پس از اثبات سازگاری است؛
انتقال یک‌باره Product/Offer/Order/Customer/ledger توصیه نشده و اجرا نشده است.
مسیر پرداخت generic فروشنده همچنان عمداً بسته است؛ alias معتبر `seller_payment`
برای مالی DIDAR اثبات نشده و گزارش‌های مالی DIDAR در extension بومی کار می‌کنند.

چک‌لیست مهندسی: نصب و build، RBAC/tenant isolation، سه برنامه، CMS، sandbox
checkout، bootstrap، replay و restore بررسی شده‌اند. استقرار، proxy سرور مالک،
محتوای تجاری مجاز، Mac/سخت‌افزار و provider زنده بررسی یا تأیید نشده‌اند.
runtime فعلی با event bus و lock محلی، اثبات اجرای چند replica نیست.

**Issueهای #13 و #14 باز می‌مانند. PR بدون merge برای بازبینی معمار ارشد ارائه
می‌شود. هیچ ادامه CRM، Phases 5–9 یا rollout از این گزارش مجوز نمی‌گیرد.**
