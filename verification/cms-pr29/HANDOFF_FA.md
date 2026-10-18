# اصلاح CMS در PR #29 — نامزد بررسی

مبنای remote پیش از تغییر دقیقاً `b9c1daea959cfc4c942206e6cc6aa6bd5302e566` بود. شاخهٔ موجود حفظ شد؛ اصلاحات مستقل lint و QA دست‌نخورده‌اند.

بازتولید متمرکز روی کد مبنا با مرورگر واقعی و SSR مشترک: سه شکست، دو موفقیت؛ خروج واقعی 1. خطای تصویر پیش از اتصال React handler بازتولید شد. فایل `baseline-focused.json` نتایج را حفظ می‌کند. تست آزمایشی نخست به علت charset ناقص خود fixture نیز خطای hydration تولید کرد؛ fixture اصلاح و اجرای مبنای ثبت‌شده مجدداً انجام شد. این خطای ابزار به خطای تاریخی #418 نسبت داده نمی‌شود.

اصلاح محدود `ImageAsset` وضعیت complete/currentSrc/naturalWidth را پس از hydration و هنگام خطا بررسی می‌کند؛ srcSet و sizes عمومی نیز در هویت درخواست لحاظ شده‌اند. SSR، طراحی بصری، مجوز تصویر خصوصی، جداسازی context، abort و آزادسازی object URL حفظ شده‌اند. assertions اصلی، timeoutها و تعداد 32 مسیر موجود تغییر نکرده‌اند.

اجرای تازهٔ متمرکز با React production و Chromium 156: پنج موفقیت، خروج واقعی 0؛ جزئیات و هش source در `candidate-focused.json`. بازبینی مستقل در `REVIEW.md` ثبت شده است.

خطای تاریخی محلی React #418 جداگانه است و علت آن هنوز اثبات نشده است. تست اصلی همچنان هر pageerror را شکست می‌داند؛ گزارش تشخیصی surface/path/stack افزوده شد. GitHub artifact شامل نتیجهٔ مراحل، تست متمرکز و خطاهای CMS خواهد بود. شواهد قبلی `verification/ci-lint-pr29` و Run 39119261621 حفظ شده‌اند.

CI کامل نامزد: PENDING. lint، types، چهار build، regressions، HTTP، هر 32 مرورگر و no-demo باید با خروج واقعی موفق شوند. نبود Docker در executor محلی با نتیجهٔ موفق معرفی نمی‌شود؛ اجرای کامل در GitHub انجام می‌شود. گزارش قطعی SHA/run/result در PR ثبت خواهد شد.

هیچ merge، انتشار release، deployment، حذف branch، دسترسی به سرور مالک یا شروع فاز جدید انجام نشده است.
