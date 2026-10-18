# بررسی معماری پنج قابلیت و جایگاه آن‌ها در رودمپ DIDAR

تاریخ: 2026-10-18 — وضعیت: بررسی منبع و طرح پیشنهادی؛ بدون مجوز پیاده‌سازی/استقرار.
سند ورودی: نام فایل v0.1(1)، اما نسخه محتوایی **0.2** مورخ 17 اکتبر.
SHA-256 ورودی: 2a278a20bb3184278afb8cc51ba7a3985b66af2703acbdf9d710030f0e067133.
سند ورودی با سؤال‌های باز خوانده شده؛ این گزارش، پاسخ‌های بسته D01–D09 را دوباره به سؤال باز تبدیل نمی‌کند.

## 1. مبنا و حدود اثبات

main هنگام بررسی: 4e953c7cf62c327b92f4a461d776fc11c772a9fb.
PR #20 هنگام بررسی: باز/merge‌نشده در c82f1968616f8c38072d215d54403012a8c9fadc؛ base آن efbdfcdf از PR #15 است.
بررسی Chief Architect برای #18 مشروط به رسید تکمیلی پایان کنترل‌شده runner است. در این گزارش هیچ ادعای دریافت آن رسید، merge یا پذیرش نهایی نمی‌شود.
نسخه manifest در #20: Mercur 2.3.7، Medusa 2.21.2.

منابع کد بررسی‌شده در SHA بالا:
- finance-wallet.ts: حساب customer:/supplier: و AVAILABLE/RESERVED/PENDING/PLEDGED از posting؛ نوشتن فقط local+sandbox؛ withdrawals صریحاً DISABLED.
- finance-ledger.ts و finance-ledger-schema.sql: دفتر واحد IRR/GOLD_UG/MEMO_GOLD_UG با اسناد append-only، balance و منع overdraft.
- finance.ts: entitlement اصل و اجرت، contract snapshot، recognizePayment و درخواست تأمین طلا.
- finance-procurement.ts: خرید/تخصیص/title/handover/settle و reclassification؛ خرید ثبت‌شده QA، نه اجرای provider واقعی.
- rate-source.ts: نرخ فعلی واحد IRR/g750، یک نرخ دستی؛ قیمت مستقل خرید/فروش طلا از آن اثبات نشده.
- phase1-schema.sql و item-stock.ts: UID دائمی، supplier/Offer منبع ثابت، رزرو واحد؛ یک قطعه reserved/sold همزمان فقط یک تخصیص.
- agency.ts / curation.ts / projection.ts و schemaها: نقش فروش، فاکتور، نمایش مجاز B در A، بازیابی projection؛ فروش مجدد واقعی هنوز نیست.
- storefront/sharing/content و PR #19 در 5a8688a: زمینه فروشگاه، صفحه‌ساز، لینک و طراحی CRM/کمپین/پاداش.

این بررسی اجرای دوباره تست نیست. وجود تست‌های #20 را به تست F1–F5 تعمیم نمی‌دهیم. کد نصب‌شده وابستگی‌ها در executor متخصص باید قبل از هر mission با bundled docs و types بررسی شود؛ اینجا دسترسی به node_modules همان runtime نداشته‌ایم.

منابع primary برای قابلیت عمومی native:
https://docs.medusajs.com/resources/commerce-modules/inventory
https://docs.medusajs.com/resources/commerce-modules/stock-location
https://docs.medusajs.com/resources/commerce-modules/promotion
Medusa موجودی/مکان/رزرو و قواعد Promotion دارد؛ این به معنی پوشش طلای ولتی، انتقال مالکیت UID یا اثبات خرید حضوری در DIDAR نیست. Customer، Seller/Member، Pricing، Fulfillment، Notification و workflow/SDK نیز طبق ارزیابی قبلی نامزد reuse‌اند؛ signature/API دقیق و سازگاری باید در نسخه نصب‌شده اثبات شوند.

## 2. حکم معماری و تغییر نسبت به برنامه قبلی

این پنج قابلیت صرفاً پنج صفحه یا ادامه ساده CRM نیستند؛ F3/F4 یک چرخه واقعی خرید تجاری و فروش مجدد به همان پلتفرم اضافه می‌کنند. باید پیش از فعال‌سازی مسیر، ADR اقتصادی/مالکیت و تطبیق native کامل شود.

تفکیک لازم:
- P5…P9 = فازهای قبلی CRM و رشد؛ F1…F5 = شناسه قابلیت‌های این brief. شماره‌ها معادل هم نیستند.
- F4 نیاز جدید را در سطح کسب‌وکار صریح می‌کند؛ محدودیت فنی کنونی «curation≠resale» را خودکار حذف نمی‌کند.
- معماری هدف پیشنهادی: یک core و سه workspace موجود، با زمینه خرید Individual/Business؛ نه موتور تجاری/ولت/پنل دوم.
- این انتخاب در برابر تصمیم تاریخی دو بازار مستقل باید در ADR ثبت شود. یک تجربه خرید تجاری در core مشترک، الزام ساخت سایت B2B مستقل جدید نیست و دو بازار را خودکار ادغام داده‌ای نمی‌کند.
- تحویل به مغازه و موجودی حضوری، حداقل مدل مکان/custody می‌خواهد؛ این توسعه را به ساخت WMS کامل/چند انبار تعمیم نمی‌دهیم.
- در PR #19 پاداش مالی واقعی OFF و بعضی benefits قابل تعویق بود. D09 اکنون هر سه نوع مشوق را در دامنه توسعه می‌خواهد. طرح باید هر سه را end-to-end در sandbox موجود پوشش دهد؛ فعال‌سازی بانکی/مالی واقعی همچنان جداست. ساخت فقط coupon و تعویق دائمی wallet credit مجاز نیست.

## 3. ماتریس پوشش واقعی و reuse

| قابلیت | native نامزد | DIDAR فعلی و شاهد | وضعیت | اقدام پیشنهادی/شکاف |
|---|---|---|---|---|
| F1 خرید تدریجی/توان خرید/بازفروش | Customer، Product/Offer، Pricing، Payment، Inventory/Fulfillment | finance-wallet: مانده چندابزاری؛ rate-source: نرخ دستی750؛ merchant-quote و checkout؛ withdrawals=DISABLED | زیرساخت جزئی؛ خرید/بازخرید واقعی و کسر ولت در checkout کامل اثبات نشده | Keep ledger/catalog؛ Extend quote دوطرفه، معامله طلای دارای پشتوانه، reserve/debit در سفارش، تحویل/برداشت، پیشنهاد توان خرید |
| F2 تسویه ریالی/طلایی | commission/payout/payment نامزد؛ payout پولی معادل gold discharge نیست | finance entitlement، fin_request، procurement و PAYABLE_TO_WALLET | جزئی و sandbox؛ اجرای خودکار پشتوانه/بانک/تحویل واقعی اثبات نشده | Extend سیاست فروشنده/عملیات تأمین و reconciliation؛ reclassify همان بدهی به wallet، نه دو بدهی |
| F3 Individual/Business | Seller/Member، CustomerGroup، PriceList/Channel و workflow برای بررسی | هویت و staff موجود؛ پروفایل فعلی بیشتر seller-based؛ نقش/دارایی تجاری از مشتری متمایز | زمینه خرید و کنترل سه پروفایل کامل اثبات نشده | Configure/Extend buyer context و ترکیب seller type×buyer context؛ یک موتور قیمت؛ Business فقط producer و prefunded gold |
| F4 خرید→فروش مجدد/ویترین | Seller/Offer/catalog links، inventory locations، fulfillment/returns | agency/curation و CMS آماده reuse؛ item guard supplier_id/offer_id را ثابت می‌کند | ویترین و curation جزئی؛ resale واقعی مسدود و جداست | ADR انتقال عنوان/تخصیص فروش جاری با همان UID؛ سپس atomic funded purchase/title/allocation/listing؛ دو مسیر custody |
| F5 LBS/ووچر/سه مشوق | Seller address/StockLocation، Promotion/Campaign، Notification نامزد | CMS/share/identity/ledger موجود؛ P5/P6/P8 فقط design؛ geospatial/POS/provider در runtime بررسی نشده | reuse جزئی؛ LBS و offline proof/redemption کامل اثبات نشده | Extend location opt-in/freshness و redemption مستقل از checkout؛ reuse consent/campaign/reward؛ سه benefit روی دفتر واحد |

برای هیچ مورد، Replace یا غیاب مطلق native اعلام نمی‌شود. مأموریت هر قابلیت ابتدا native/current/gap، types و رفتار واقعی را تحویل می‌دهد؛ تنها مدل‌های واقعاً مفقود توسعه می‌یابند.

## 4. ترتیب اجرا — بر اساس وابستگی، نه ترتیب Fها

| نوبت/بسته | محتوا | پیش‌شرط و خروجی عبور |
|---|---|---|
| اکنون | تکمیل رسید محدود #18؛ تحلیل Fها و ADRها بدون دست‌زدن به برنامه | #20 بدون گسترش scope به F1–F5؛ no rollout |
| S0: قرارداد پایه مشترک | واحد دارایی/نرخ، صاحب حساب، context شخص/کسب‌وکار، quote/payment/refund، عنوان/حضانتی/فروشنده | تصمیم‌های مسدودکننده و ADR تایید؛ طرح مهاجرت بدون بازنویسی تاریخچه |
| S1: F2 + زیرساخت مالی F1/F3 | خرید/پشتوانه/تسویه/ولت، پذیرش آب‌شده، نرخ‌های دوطرفه، رزرو و برداشت قابل کنترل | یک بدهی/یک پشتوانه/یک مانده؛ buy/credit failure و replay درست |
| S2: F3 + بخش انتقال مالکیت F4 | خرید تجاری prefunded، سه پروفایل، انتقال همان UID، انتشار خودکار، دو روش تحویل | یک vertical slice کامل؛ خرید موفق تجاری بدون تحقق F4 تحویل نهایی نیست |
| S3: F1 تجربه مشتری | خرید تدریجی، quote کامل، کالاهای قابل خرید، مصرف ولت، بازفروش/تحویل | پس از S1؛ می‌تواند با S2 روی فایل/داده مستقل موازی شود |
| P5 سپس P6 | CRM/رضایت و کمپین، با هویت seller/owner جدید | طراحی P5 بعد از S0 و پذیرش#18 می‌تواند با S1 پیش رود؛ داده فروش از seller واقعی نه صرف origin |
| P7 | جذب بازاریاب و پاداش عملکرد | بعد از مبانی attribution؛ مستقل از پایان LBS قابل اجراست |
| P8 + F5 | reward مشترک، ووچر حضوری/تأیید/سه مشوق و اتصال wallet | طراحی location می‌تواند از S2؛ پذیرش کامل F5 پس از موجودی/custody و P5/P6/reward adapter |
| P9 | Growth Center و تحلیل کل جریان آنلاین/حضوری | نتایج همه مسیرها، هزینه واقعی مشوق‌ها و reconciliation |
| جداگانه | فعال‌سازی سرویس بیرونی، UAT تجمیعی و rollout | مالک مجوز جدا می‌دهد؛ نه پیش‌شرط تست هر فاز و نه ضمن این بررسی |

روز/مدت قطعی فعلاً قابل اتکا نیست: APIهای provider، سیاست مالی و انتقال مالکیت هنوز تصمیم/اثبات می‌خواهند. زمان‌بندی تقویمی بعد از S0 و مقایسه reuse، در واحد vertical slice تخمین زده شود؛ نه وعده اتمام کل در چند روز.

## 5. معماری دارایی، نرخ و ولت

### 5.1 واحد
پیشنهاد: GOLD_UG فعلی (میکروگرم طلای خالص) منبع محاسبات بماند. وزن و عیار واقعی و رسید assay جدا حفظ شوند؛ گرم معادل عیار پایه projection نمایش/قرارداد باشد.
معادل گرم پایه = fine_ug / (1000 × base_fineness).
از این طریق انتخاب 705/750 نیازمند ضرب/تغییر ارقام کل ledger نیست. ثابت نرخ فعلی IRR/g750 را بدون نرخ‌نامه/نسخه تبدیل تغییر ندهید.
Q01 هنوز باز است؛ قبل از quote نمایشی/تبدیل و ثبت قرارداد جدید باید تایید شود. 995 به 95 تبدیل نشده است. دقت و rounding در واحد ریز فعلی، با نسخه و مانده گردکردن شفاف؛ بدون float.

### 5.2 صاحب حساب
actor مشترک ممکن است شخص و چند کسب‌وکار را اداره کند؛ wallet account به party حقوقی/اقتصادی وابسته است نه login. context سمت سرور از membership فعال و مجوز خرید resolve شود. role=user/supplier فعلی به تنهایی کافی نیست.
حساب شخص و کسب‌وکارها جدا؛ انتقال میان آن‌ها عملیات صریح و سنددار، نه تغییر dropdown.
auto-enable خرید تجاری برای خرده‌فروش تاییدشده پس از prerequisites، idempotent و بدون اعطای مجوز seller-admin کامل؛ نقطه تایید و شمول دیگر Businessها Q12/Q14.

### 5.3 نرخ و پشتوانه
quote جهت‌دار و versioned: فروش طلای دیدار به کاربر، بازخرید طلای کاربر، quote کالا، quote تعهد/تسویه. یک نرخ دستی فعلی را نرخ یکسان bid/ask فرض نکنید.
ثبت quote: principal/collector، party، fine quantity/assay، IRR، rate source/side/version، profile/tax/shipping، expiry، rounding و funding allocation.
پول درگاه، خرید طلای backing و تخصیص آن سه fact هستند. سناریو:
درخواست→quote→وجه/آب‌شده در انتظار→خرید/پذیرش تاییدشده→تخصیص/title→credit قطعی.
شکست پس از وصول: pending و عملیات بازیابی/refund؛ نه credit available بی‌پشتوانه.
منبع می‌تواند موجودی مستند دیدار یا خرید تاییدشده provider باشد؛ مدل انتخاب منبع باید مصوب/قابل اثبات باشد. درخواست خرید به تنهایی execution نیست.
بدهی طلایی producer حتی در شکست backing طلایی باقی می‌ماند؛ گزارش exposure و status تأمین جداست.

### 5.4 ولت و مصرف
reuse WALLET_AVAILABLE/RESERVED/PENDING/PLEDGED و ledger؛ withdrawable projection سیاست release/hold است. credit تشویقی با restriction/payer/source از موجودی آزاد قابل برداشت جدا باشد، نه wallet دوم.
PAYABLE_TO_WALLET همان liability را reclassify می‌کند؛ متن UI نباید credit را هم تسویه کامل بدهی و هم بدهی پرداخت‌نشده معرفی کند.
رزرو wallet و همان UID/order در یک مرز داخلی هماهنگ؛ ترتیب lock واحد قبل از کدنویسی با payment/refund/procurement بررسی شود. idempotency و unique intent سمت DB.
تسویه با wallet یک روش پرداخت سفارش موجود است؛ native cart/order/payment موازی نسازید. اگر native payment provider extension معنای آن را پوشش دهد همان seam؛ در غیر این صورت adapter به current path با سند reuse.

### 5.5 معیار «بازشدن کالا»
واجدبودن = available مجاز + مجموع تمام اجزای quote قابل تامین + Offer موجود و مجاز. pending/pledged/reserved یا reward نامجاز قابل خرج نیست.
هزینه ارسال با نشانی/روش تحویل quote شود. بدون نشانی، نتیجه مشروط «تا قبل از هزینه نهایی ارسال» است، نه قابل‌خرید قطعی. نرخ و انقضای quote در UI واضح؛ unlock رزرو موجودی نیست.
دو راه سیاستی برای تصمیم: (الف) اصل/اجرت از طلا و باقی از مانده ریالی داخل همان wallet؛ (ب) هزینه‌های ریالی نیز با بازخرید بخشی از طلای wallet در quote دوطرفه تامین شوند. هیچ‌کدام مصوب فرض نشده؛ نقد بیرون wallet جای شرط D02 ننشیند.
Business اصل+اجرت را GOLD مصرف می‌کند و از مسیر credit/direct rial کالا استفاده نمی‌کند. تامین قبلی wallet سند جدا دارد.

### 5.6 خروج/مرجوعی
بازفروش طلا یک معامله جدید با نرخ خرید روز مصوب است؛ refund سفارش، برگشت معامله قبلی با snapshot اولیه است. این دو یکی نیستند.
برداشت/حواله بانکی یا تحویل فیزیکی reserve→authorize→execute→confirm/reconcile دارد؛ timeout نتیجه unknown، نه failure قطعی و پرداخت مجدد.
مرجوعی پس از settlement/reward/فروش بعدی بدهی بازیافت یا hold صریح می‌خواهد؛ تاریخچه و وزن سفارش قبلی ثابت. سیاست دقیق دارایی refund هنوز باز است.
تحویل آب‌شده نیازمند وزن/عیار/رسید/پذیرش معتبر است؛ jewellery intake را کور برای bullion fungible استفاده نکنید. مالکیت مشکوک/assay pending قابل خرج نیست.

## 6. F3/F4 — خرید تجاری و انتقال واقعی با یک UID

### 6.1 سه زمینه قیمت
Retailer→Individual، Manufacturer→Individual، Manufacturer→Business: یک pricing engine و assignment نسخه‌دار با dimensions خریدار/فروشنده/کانال؛ reuse merchant-profiles، از تعداد سه مسیر به سه موتور نرسید.
قیمت تجاری، minimum/tier و شناسه قرارداد در endpoint عمومی/SSR/OG نشت نکند؛ customer group/sales channel به تنهایی مجوز Business نیست.
Business→Retailer در API/quote/reorder/checkout رد شود؛ مورد DIDAR-owned طبق Q16 صریح تصمیم بگیرد، نه خودکار producer جعلی.

### 6.2 عنوان و عرضه فعال — ADR لازم
قید فعلی supplier_id و offer_id روی didar_inventory_item دائمی است و unique reservation وضعیت reserved/sold را می‌سنجد. صرف تغییر source یا ایجاد item جدید با UID تازه برای resale ممنوع.
پیشنهاد برای اثبات: source intake و UID ثابت بماند؛ سابقه append-only title/custody و یک allocation فعال فروش/entitlement به owner/Offer فعلی اضافه/متصل شود. native Seller-product allowlist/Offer workflow و StockLocation در صورت سازگاری reuse شود؛ شمارنده/رزرو native مرجع دوم نشود.
source supplier به معنی owner همیشه نیست. Offer جدید خرده‌فروش با master/رسانه مشترک مجاز است، ولی **قطعه/UID/مانده فیزیکی جدید نیست**.
نیازمند اصلاح کنترل‌شده guard/reservation semantics: prior sold reservation تاریخی B2B حفظ می‌شود، فروش مجدد فقط با ownership chain/active allocation، یک حق فروش جاری و بدون دسترسی فروش producer قبلی.
دو ردیف sold تاریخی در دو معامله متوالی ممکن است لازم باشند؛ قید «هم‌زمان قابل فروش نبودن» باید روی current allocation/claim اثبات شود، نه با پاک‌کردن reservation فروش اول.
هر جزء از reuse، migration، title event و supplier liability پیش از تغییر با Core specialist بررسی و ADR تایید شود.

### 6.3 توالی هدف
buyer business active + producer approved + approved Product/profile/title terms → quote کامل → wallet/UID reserve → پرداخت داخلی قطعی → انتقال طبق قرارداد + current allocation → بستن حق فروش قبلی → Offer فروش جدید/قیمت مصوب + انتشار خودکار.
همه facts اصلی که در همان DB هستند transactional/unique؛ انتشار/پروژکشن بیرون commit با durable intent و retry بدون تایید دستی دوباره.
«فوری» هدف پاسخگویی است؛ در قطع process نباید وعده exactly-once external یا انتشار قبل از مالکیت داد. UI pending/recovery و مسیر retry خودکار قابل مشاهده؛ فعال‌سازی فقط پس از prerequisites.
اگر seller کسب‌وکار موجود است همان ID؛ در نبود نقش seller، یک linking/onboarding idempotent بعد از commercial approval، نه مجوز کامل native owner.

### 6.4 دو روش تحویل
HELD_AT_DIDAR: retailer مالک، دیدار custodian و fulfilling agent.
DELIVER_TO_SHOP: انتقال custody/درراه/تحویل با شواهد؛ owner ممکن است طبق سند قبل از تحویل تغییر کند.
انتشار پس از D06 در هر دو مسیر؛ «درراه» را از «در مغازه موجود» جدا کنید.
پیشنهاد checkout در راه: listing منتشر با وعده/lead time واقعی؛ پذیرش پرداخت سفارش بعدی فقط با سیاست تحویل مصوب. نبود سیاست نباید پنهانی به ادعای ready stock تبدیل شود؛ ممکن است نمایش فعال و خرید موقتاً نامجاز باشد که تفاوت آن باید با مالک روشن شود.
خرید عمده مرجوعی پس از resale به مشتری نمی‌تواند حق شخص ثالث را پس بگیرد؛ واحد فروخته‌شده دوباره تولیدکننده available نشود؛ dispute/recoverable جریان جدا.
رسید مغازه با وزن کمتر/بیشتر، partial shipment و گم‌شدن: discrepancy/hold و سند اصلاح؛ UID قدیمی با وزن ساختگی overwrite نشود.

### 6.5 برند و اسناد
reuse /m/{handle} و contextهای معتبر؛ دامنه اختصاصی لازم نیست؛ درگاه DIDAR.
فاکتور فعلی #20 actual seller/issuer/on_behalf را دارد؛ نام/لوگوی تاریخی seller، PDF/print و شماره از همان projection توسعه یابد، نه فاکتور رقیب یا تغییر خودکار نام در سند قدیمی.
پیام فروشگاه از snapshot/Notification template؛ Sender واقعی مستقل از متن و مشروط به provider. ارسال بیرونی در این تحلیل انجام نمی‌شود.
سفارش چندseller فاکتورهای خود را دارد؛ برند A به کل سبد چندseller الصاق نشود.

## 7. F5 — LBS، خرید حضوری تاییدشده و سه benefit

### 7.1 کشف و موجودی
Customer login + رضایت location؛ fallback شهر دستی پیشنهاد است؛ مختصات مشتری فقط به میزان query و سیاست retention مصوب، نه track مداوم.
Seller public-location opt-in جدا از PUBLIC/UNLISTED/INVITE؛ خصوصی بودن ویترین را با رضایت LBS دور نزنید. اعلان محل فیزیکی حتی با opt-in مجوز انتشار Offer خصوصی نیست؛ جزئیات موجودی همچنان scope می‌خواهد.
Seller/StockLocation address را reuse؛ نیاز spatial query/index را بعد از بررسی runtime تعیین کنید. PostGIS/provider نقشه نصب‌شده یا لازم فرض نشود؛ vendor هزینه‌دار پیشاپیش انتخاب نشود.
موجودی مدل، online saleability، onsite visibility سه projection جدا:
AT_DIDAR / IN_TRANSIT / AT_SHOP_VERIFIED / UNKNOWN با verified_at، source و valid_until.
این enum پیشنهادی است، نه قرارداد آماده کد. stale/unknown به «تماس برای تایید»؛ قطعه درراه یا نزد دیدار onsite true نباشد. نیازی به POS برای MVP از پیش فرض نشده.

### 7.2 ووچر و اثبات
reuse campaign/referral entitlement زیرساخت P6/P8، اما OFFLINE_VISIT_PURCHASE program جدا؛ خرید حضوری نه سفارش آنلاین ساختگی است، نه ورودی F2 برای کل فاکتور مغازه.
token opaque و hashed، customer+store+campaign/قیدمحصول/expiry/rule version؛ QR حاوی bearer/PII نباشد.
توالی پیشنهادی: ISSUED→VALIDATED/SCAN→PURCHASE_PENDING→CONFIRMED_REDEEMED؛ EXPIRED/CANCELLED/REVERSED حالات جدا.
اسکن فقط validation است. پیشنهاد Q22: مبلغ/مرجع فاکتور + اقرار فروشنده + تایید مشتری با challenge یک‌بارمصرف (OTP یا تایید در account). این ترکیب پیشنهاد است؛ proof policy باید تایید شود.
برای تخفیف آنی: authorize/reserve بودجه و مبلغ تخفیف پیش از نهایی‌کردن مبلغ پرداخت مشتری؛ claim جبران فروشگاه و award فقط پس از confirmed purchase. timeout/retry و لغو authorization بدون تایید مشتری رفتار روشن دارد؛ مشتری نباید وعده تخفیف پس از پرداخت کامل بشنود.
OTP به تنهایی اثبات واریز بانکی نیست؛ سند حداقلی و اختلاف/بازبینی لازم. اگر provider SMS نبود، سیاست تایید داخل حساب برای QA جدا، نه OTP ارسال‌شده جعلی.

### 7.3 هر سه مشوق الزامی
1. INSTANT_DISCOUNT: تخفیف مغازه و سهم DIDAR جدا؛ بابت DIDAR سهم، liability جبران فقط یک بار و طبق تایید خرید؛ فروش ناخالص حضوری وارد settlement F2 نشود.
2. WALLET_CREDIT: از بودجه sponsor و رویداد redemption معتبر به همان ledger/account؛ IRR یا GOLD و محدودیت برداشت/تبدیل هنوز باید مصوب شود. GOLD reward نیازمند backing مستند/مکانیزم تضمین مصوب، نه ضرب خودکار نرخ؛ restriction دارایی با مانده آزاد مخلوط نشود.
3. FUTURE_ONLINE_BENEFIT: coupon/credit با محدودیت seller/platform، expiry/amount؛ native Promotion adapter به همان quote/reservation/payment؛ نه سفارش/ولت دوم.

هر سه در sandbox باید رویداد/سند/UI/reversal واقعی و end-to-end داشته باشند. اعداد QA مشخص و غیرتجاری‌اند. فعال‌سازی هر سه با مقادیر مصوب مستقل؛ انتخاب نوع در Admin. همزمانی/stacking روی یک خرید هنوز تصمیم نشده و default خودسرانه به مالک نسبت داده نمی‌شود.
بودجه reserve/consume/release با unique(customer/store/program/source) و lock؛ دو اسکن/دو retry از سقف نگذرد.
مبنای reward: gross bill یا making یا DIDAR share باید در rule باشد؛ بودجه از پول seller خودسرانه کم نشود.
refund قبل از مصرف: reverse؛ بعد از مصرف: recoverable/offset/manual exception مصوب، نه مانده طلای منفی ساختگی.
آمار VIEW/ISSUED/SCANNED/CONFIRMED/REDEEMED/CREDITED/REPEAT_ONLINE جدا؛ مقایسه سه incentive با گروه/فروشگاه/هزینه و زمان، بدون ادعای علیت از صرف redemption. موتور آزمایش مستقل لازم فرض نشده.

## 8. workspace، API و دسترسی

مسیرهای جدید زیر پیشنهادند و باید collision/type checks نصب‌شده بگذرند:
- Native Admin: gold treasury/quotes/assay/funding/withdrawal queue، business profiles، ownership transfer/recovery و offline campaigns/redemption dispute؛ در /dashboard/didar/*.
- Native Vendor: همان account کسب‌وکار، خرید تجاری/تحویل، own wallet/claims/withdrawals، own retail Offers/store و اسکن ووچر؛ در /seller/didar/*.
- B2C: wallet/gold buy-sell، توان خرید/اهداف در صورت تایید، سفارش و تحویل؛ shops-nearby/voucher و own benefits در storefront.
- APIهای /admin/didar/* و /vendor/didar/* با native selected actor؛ customer از API موجود خود. gold-quote/trade/funding/withdrawal، business-quote/checkout، title/active-offer، nearby/voucher validation/confirm/reversal قراردادهای مفهومی‌اند.
- Amount، actor party، seller، title/Offer/UID، rate/profile/mandate/program version، intent key و expiry server-derived؛ دستکاری query/Host/referer مالکیت یا context نسازد.
- rate تغییر/assay/fund approval/withdrawal/payout/reward/role grants مجوزهای جدا با actor-target audit؛ curator customer contacts یا wholesale costs نبیند.
- ورود/انتخاب context، lock/revocation، consent و تخفیف باید در HTTP واقعی و queue تکرار شوند.
- fa/ar/en/fr و RTL/LTR/16 responsive states طبق الزامات پروژه؛ locale=fa قید فعلی CMS شکاف شناخته‌شده است؛ رسیدگی additive و بدون ادعای چندزبانه بودن فعلی.

## 9. مهاجرت و بازیابی

بدون تغییر ارقام یا معنای اسناد تاریخی، source supplier و UID حفظ شوند. انتقال‌های جدید با version/intent و chain از سند خرید؛ old rows را با owner/mandate یا consent حدسی backfill نکنید.
برای هر schema CHECK/unique/constraint و replay order بررسی شود؛ سه schema قدیمی در #20 سابقه downgrade predicate داشتند، regression نصب/replay جدید الزامی است.
قیدهای قدیمی inventory را یک‌باره drop نکنید؛ نسخه‌گذاری مسیر و proof migrated old + new ownership states. قدیمی‌ها همچنان قابل خواندن/برگشت طبق snapshot باشند.
outbox #20 مخصوص Product است؛ برای trade/financial/reward آن را عمومی فرض نکنید. الگوی durable را reuse کنید ولی هر اثر source transaction/consumer/idempotency/reconcile خودش را اثبات کند.
external bank/gold purchase workflow: SUBMITTED/UNKNOWN/CONFIRMED/FAILED/RECONCILE؛ query-by-intent/provider reference، no blind retry-on-timeout.
ledger و wallet reserve و current stock allocation داده اصلی؛ پیشنهاد خرید/analytics و map caches بازسازی‌پذیرند. توزیع‌شده و live provider هنوز تایید نشده.

## 10. ثبت وضعیت Q01–Q25

| سؤال | وضعیت پس از بررسی | اقدام |
|---|---|---|
| Q01 | روش معادل قطعی، عدد705/750 باز | تایید عدد؛ fine_ug تاریخی بدون تغییر |
| Q02 | کل هزینه قطعی؛ gold/IRR composition باز | دو گزینه در5.5؛ quote و نحوه تبدیل مصوب |
| Q03 | نام/goal افزوده باز و غیرمسدودکننده core | label موقت؛ هدف/اعلان اجباری نشود |
| Q04 | حداقل/fee/withdrawal SLA باز | config inactive و QA مشخص؛ هیچ عدد production حدسی |
| Q05 | فروش طلا از DIDAR در نیاز آمده؛ backing mode باز | fact source/title برای موجودی/خرید بیرونی تایید |
| Q06 | asset/refund policy باز | refund≠new gold buyback؛ از snapshot |
| Q07 | فقط فروش آنلاین بسته | offline bill در F2 وارد نشود |
| Q08 | default/per-sale انتخاب باز | طرح versioned assignment + override قابل‌تایید |
| Q09 | producer principal+making GOLD بسته | فقط قرارداد جدید GOLD_ONLY؛ تاریخچه mixed دست‌نخورده |
| Q10 | timing/risk باز | کد فعلی snapshot در checkout، recognition در payment؛ این واقعیت به معنی تصویب سیاست جدید نیست |
| Q11 | release/withdrawable باز | wallet credit لزوماً withdrawal/settlement نیست |
| Q12 | approved retailer auto-business اصل نیاز؛ شمول/مرحله باز | existing commercial approval پیشنهاد، نه انتخاب قطعی مالک |
| Q13 | prefunded GOLD و no credit/direct rial بسته | topup transaction جدا؛ مانده pending خرج نشود |
| Q14 | switching personal/business باز | حساب‌ها جدا؛ مجوز و context صریح |
| Q15 | minimum/tier/open policy باز | profile مشترک قابل توسعه، نه قیمت حدسی |
| Q16 | DIDAR-owned در Business باز | تولیدکننده جعلی/تغییر silent type ممنوع |
| Q17 | auto-publish پس از قطعیت/title/allocation بسته | durable atomic intent؛ وعده fulfillment درراه پیشنهاد لازم |
| Q18 | هر دو custody/shipping بسته | انتخاب buyer؛ عدم تحمیل پیش‌فرض |
| Q19 | قیمت resale و edit scope باز | retail profile جدا از producer purchase quote |
| Q20 | link/branding/gateway بسته؛ invoice/message extension | reuse #20 actual seller docs؛ domains آینده |
| Q21 | سه incentive بسته؛ asset/base/cap/stacking باز | پیاده‌سازی هر سه sandbox؛ production values نیازمند مصوبه |
| Q22 | offline proof باز | invoice amount/reference + customer confirmation پیشنهاد |
| Q23 | onsite source/freshness باز | bounded verification/expiry پیشنهاد؛ native location بررسی شود |
| Q24 | voucher scope/future platform coverage باز | rule صریح seller/product/platform |
| Q25 | return/dispute/privacy opt-in باز | reversal/recovery و رضایت LBS مستقل طراحی |

همه 25 سؤال دوباره از مالک پرسیده نشوند. اکنون دو رفع ابهام اولویت‌دار Q01/Q22 است؛ سایر موارد با گزینه و اثر در S0 جمع‌بندی شوند، قبل از مسیر وابسته تصمیم بگیرند. تحلیل مستقل اینجا منتظر جواب متوقف نشده است.

## 11. معیار پذیرش تمام بسته‌ها

1. GOLD_UG بین کالای750/995/assay واقعی درست تبدیل، مجموع IRR و gold جدا balanced، rounding شفاف؛ رقم705/750 از پاسخ تاییدشده.
2. fund callback تکراری، خرید provider unknown و assay pending هیچ credit آزاد تکراری/بی‌پشتوانه نسازند.
3. بدهی producer اصل+اجرت GOLD حتی در backing failure محفوظ؛ payable→wallet دوبار liability نشود.
4. wallet only partial total کالا را unlock نکند؛ حمل/مالیات/fee و asset restriction شامل شود؛ quote تغییر واضح.
5. Business با wallet ناکافی یا producer غیرمجاز، endpoint/reorder/checkout مستقیم نتواند خرید کند؛ شخص/کسب‌وکارها جدا.
6. خرید تجاری موفق همان UID را فقط به یک active selling allocation منتقل کند؛ دو context همان قطعه را دوبار نفروشند.
7. auto-publish هر دو delivery mode بدون کلیک دوباره؛ in-transit≠onsite؛ وعده زمان و امکان پرداخت درست.
8. cancellation/partial fulfillment/weight discrepancy/resale return/downstream sold title chain درست؛ snapshot و زنجیره قدیمی حفظ.
9. branded store از link تا payment-return/invoice/refund context را نگه دارد؛ wholesale/PII/rival leak نداشته باشد.
10. LBS فقط consented/logged-in؛ private store/address و Offer access جدا؛ stale location/onsite صادقانه.
11. هر سه incentive end-to-end سند، budget، once-credit/claim، reversal و eligible future redemption داشته باشند؛ صرف provisional text یا QR تحویل نیست.
12. offline minimal purchase confirmation، دو scan همزمان، OTP replay، fraud review و refund-after-reward آزموده شود.
13. full native Admin/Vendor/Customer HTTP+browser، current regression/builds، kill/restart، fresh/non-demo/populated migration/replay/restore و receiptها.
14. provider زنده/قانونی/استقرار/سخت‌افزار نتیجه جدا دارد؛ Linux QA=production ادعا نشود.

## 12. نتیجه و تحویل

طرح پیشنهادی: تکمیل#18 → S0 → S1 → F3/F4 و F1 در مسیرهای وابسته موازی → P5/P6/P7/P8 با F5 → P9.
P5 بعد از تثبیت هویت اقتصادی می‌تواند موازی زیرساخت مالی باشد؛ همه چیز را بی‌دلیل منتظر LBS نگذارید.
این PR فقط بررسی و ADR پیشنهادی است؛ از Codex خواسته نمی‌شود Fها را به اجرای فعال#18 تزریق کند. پذیرش نهایی و mission اجرایی هر بسته پس از تصمیم لازم صادر شود.
