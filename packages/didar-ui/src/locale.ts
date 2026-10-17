// All formatters and navigation copy are centralized for a later English locale.
export const locale = "fa-IR";
export const number = (n: number | string) =>
  new Intl.NumberFormat(locale).format(
    typeof n === "string" && /^-?\d+$/.test(n) ? BigInt(n) : Number(n),
  );
export const money = (n: number | string) => number(n) + " ریال";
export const weight = (n: number) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n / 1000) + " گرم";
export const date = (s: string) => new Date(s).toLocaleString(locale);
export const copy = {
  home: "دیدار گلد",
  catalog: "ویترین طلا",
  cart: "سبد خرید",
  account: "حساب من",
  orders: "سفارش‌ها",
  login: "ورود / عضویت",
  manage: "مدیریت طلا",
};
export const states: Record<string, string> = {
  reserved: "رزرو شده",
  sold: "فروخته شده",
  returned: "مرجوعی",
  requested: "درخواست مرجوعی",
  received: "دریافت فیزیکی",
  restocked: "بازگشت به فروش",
  pending: "در انتظار پرداخت",
  initialized: "آماده پرداخت",
  paid: "پرداخت شده",
  success: "موفق",
  failed: "پرداخت ناموفق",
  failure: "ناموفق",
  cancelled: "لغو شده",
  cancel: "لغو شده",
  expired: "منقضی شده",
  approved: "تأیید شده",
  rejected: "رد شده",
  allocated: "تخصیص به تأمین‌کننده",
  preparing: "در حال آماده‌سازی",
  dispatched: "ارسال شده",
  delivered: "تحویل شده",
};
export const errors: Record<string, string> = {
  CONFLICT_LAST_NATIVE_ADMIN:
    "حداقل یک مدیر بومی با دسترسی مدیریت کاربران باید فعال بماند.",
  INVALID_MEDIA_SIZE:
    "تصویر باید JPEG، PNG یا WebP سالم با حجم حداکثر ۸ مگابایت باشد؛ فایل را دوباره انتخاب کنید.",
  INVALID_MEDIA_TYPE:
    "نوع فایل با تصویر سازگار نیست. عکس JPEG، PNG یا WebP انتخاب کنید.",
  INVALID_MEDIA_DIMENSIONS:
    "تصویر ثابت با حداکثر ۳۲ مگاپیکسل و ضلع حداکثر ۱۲۰۰۰ پیکسل انتخاب کنید.",
  INVALID_MEDIA_DECODE:
    "تصویر خوانده نشد. نسخه سالم JPEG، PNG یا WebP را دوباره ذخیره و بارگذاری کنید.",
  INVALID_MEDIA_NORMALIZED_SIZE:
    "نسخه بهینه تصویر هنوز بیش از ۸ مگابایت است؛ وضوح عکس را کاهش دهید.",
  INVALID_MEDIA_VARIANT_SIZE:
    "خروجی تصویر بیش از حد بزرگ است؛ وضوح عکس را کاهش دهید یا ابعاد خروجی را با مدیر بازبینی کنید.",
  INVALID_MEDIA_RESOURCE:
    "ابتدا محصول یا درخواست متعلق به همین فروشنده را انتخاب کنید.",
  INVALID_MEDIA_VISIBILITY:
    "تصویر مشترک به اجازه بارگذار و تأیید دیدار نیاز دارد.",
  INVALID_IMAGE_LIMIT:
    "برای هر محصول حداکثر ۱۰ تصویر فعال مجاز است؛ ابتدا تصاویر ردشده یا قدیمی را بررسی کنید.",
  CONFLICT_MEDIA_PRODUCT_REQUIRED:
    "ابتدا درخواست محصول را در دیدار تأیید کنید؛ سپس تصویر قابل تأیید است.",
  CONFLICT_MEDIA_INTENT:
    "این تلاش قبلاً با محتوای دیگری ثبت شده است؛ برای بارگذاری جدید، فایل را دوباره انتخاب کنید.",
  CONFLICT_REQUEST_INTENT:
    "این درخواست قبلاً با مشخصات دیگری ثبت شده است؛ درخواست جدید ایجاد کنید.",
  CONFLICT_MEDIA_POLICY:
    "سیاست تصویر تغییر کرده است؛ صفحه را تازه کنید و دوباره ذخیره کنید.",
  RATE_LIMIT: "درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.",

  CONFLICT_PROFILE_QUOTE_CHANGED:
    "پروفایل، روش پرداخت یا قیمت عرضه تغییر کرده است؛ قیمت سبد را تازه و دوباره تأیید کنید.",
  CONFLICT_PROFILE_OVERLAP:
    "بازه تخصیص پروفایل هم‌پوشانی دارد؛ از تعویض پروفایل یا بازه بدون هم‌پوشانی استفاده کنید.",
  CONFLICT_SHARED_CHARGE:
    "قاعده خدمت مشترک بین تأمین‌کنندگان ناسازگار است؛ مدیر باید مبلغ، مبنا و مالیات آن را هماهنگ کند.",
  CONFLICT_MERCHANT_PROFILE_REQUIRED:
    "این نوع تأمین‌کننده نیازمند تخصیص فعال به نسخه مصوب پروفایل است.",
  CONFLICT_IMMUTABLE_PRICING_VERSION:
    "نسخه بررسی‌شده تغییرپذیر نیست؛ نسخه تازه ثبت کنید.",
  CONFLICT_MERCHANT_TYPE_ASSIGNMENT:
    "نوع جدید با تخصیص فعلی یا آینده سازگار نیست؛ ابتدا تخصیص ناسازگار را پایان دهید.",
  CONFLICT_PRICING_ASSIGNMENT_HISTORY:
    "تاریخچه تخصیص قابل بازنویسی نیست؛ پایان فعلی یا لغو آینده را ثبت کنید.",
  CONFLICT_TAX_POLICY_INACTIVE:
    "سیاست مالیات غیرفعال است؛ مدیر باید نسخه معتبر را تخصیص دهد.",
  INVALID_PROFILE_COMPONENTS:
    "سه جزء مستقل توزیع، خرده‌فروشی و عملیات اعتباری با دامنه هر قطعه لازم است.",
  INVALID_APPROVED_TAX_POLICY:
    "نسخه مالیات باید پیش از تأیید پروفایل، فعال و مصوب باشد.",
  INVALID_MERCHANT_PROFILE:
    "پروفایل باید مصوب، فعال و برای نوع این تأمین‌کننده مجاز باشد.",
  INVALID_ORDER_CHARGE:
    "خدمت یک‌بار در سفارش نیازمند مبلغ ثابت ریال و کد مشترک است.",

  CONFLICT_FACET_CARDINALITY:
    "این محصول یک جایگاه تجاری تأییدشده دارد؛ ابتدا مقدار قبلی را بازنشسته کنید.",
  CONFLICT_CLASSIFICATION_APPROVED:
    "پیشنهاد نمی‌تواند طبقه‌بندی تأییدشده دیدار را جایگزین کند.",
  CONFLICT_CLASSIFICATION_OWNERSHIP:
    "این پیشنهاد متعلق به تأمین‌کننده دیگری است و قابل ویرایش نیست.",
  CONFLICT_TRANSLATION_REVIEWED:
    "این ترجمه قبلاً بررسی شده است؛ برای تغییر، پیش‌نویس تازه ثبت کنید.",
  INVALID_CLASSIFICATION_EVIDENCE:
    "برای تأیید این برچسب، شاهد و منبع بررسی‌شده با حداقل ۱۰ نویسه لازم است.",
  INVALID_CLASSIFICATION_REASON:
    "دلیل پیشنهاد یا بررسی را با حداقل ۵ نویسه وارد کنید.",
  INVALID_BEST_SELLER_EVIDENCE:
    "برچسب پرفروش نیازمند شاهد و حداقل ۵ واحد فروش پرداخت‌شده است؛ برای انتخاب تحریریه از منتخب دیدار استفاده کنید.",
  INVALID_COLLECTION_EVIDENCE:
    "انتشار مجموعه نسخه محدود نیازمند شاهد و منبع بررسی‌شده است.",
  INVALID_COLLECTION_TYPE:
    "نوع فعال و تأییدشده F11 را برای انتشار مجموعه انتخاب کنید.",
  INVALID_TRANSLATION_SCRIPT:
    "خط و زبان برچسب با زبان انتخاب‌شده سازگار نیست؛ ترجمه را بازبینی کنید.",
  INVALID_FACET_VALUE:
    "مقدار باید فعال، دارای برچسب فارسی تأییدشده و متعلق به گروه مجاز باشد.",
  INVALID_FACET_IDENTITY:
    "کد، گروه و قواعد هویتی واژه دائمی هستند؛ از بازنشستگی استفاده کنید.",
  INVALID_COLLECTION_IDENTITY: "شناسه و کد دائمی مجموعه قابل تغییر نیست.",

  INVALID_CATEGORY_RANK:
    "رتبه باید خانواده ← دسته ← زیردسته نهایی باشد؛ گره قدیمی نیازمند بازبینی مدیر است.",
  INVALID_CATEGORY_CODE: "شناسه و کد ساختاری دائمی قابل تغییر نیست.",
  INVALID_PUBLICATION_TAXONOMY:
    "انتشار نیازمند خانواده، دسته و زیردسته نهایی فعال است.",
  INVALID_LABEL_VISIBILITY:
    "QR مشتری فقط برای قطعه پذیرفته‌شده با محصول فعال و منتشرشده مجاز است.",
  INVALID_PUBLIC_ORIGIN: "نشانی عمومی HTTPS برای چاپ QR مشتری تأیید نشده است.",
  INVALID_LABEL_ITEMS:
    "قطعات معتبر و یکتا را انتخاب کنید؛ حداکثر ۱۰۰ قطعه در هر نوبت.",

  CONFLICT_NO_UNEXPORTED_EVENTS:
    "رویداد مالی تازه‌ای در این دوره وجود ندارد؛ دوره، تأمین‌کننده و خروجی قبلی را بررسی کنید.",
  CONFLICT_MAPPING_REQUIRED:
    "پیش از بستن دوره، نگاشت آزمایشی حساب تأمین‌کننده را ثبت کنید.",
  CONFLICT_WALLET_OVERDRAFT:
    "مانده آزاد کافی نیست؛ وجوه رزرو یا وثیقه قابل خرج نیستند.",
  CONFLICT_OVER_ALLOCATION: "مقدار تخصیص بیش از ظرفیت خرید یا تعهد است.",
  CONFLICT_OVER_SETTLEMENT: "مقدار تسویه بیش از مانده مجاز است.",
  CONFLICT_TITLE_AND_CUSTODY_REQUIRED:
    "پیش از تسویه طلا، انتقال مالکیت و وضعیت فیزیکی را مستقل تأیید کنید.",
  CONFLICT_APPROVAL_REQUIRED:
    "تأیید درخواست و خرید یا سند مالکیت خرید هنوز کامل نیست.",
  CONFLICT_RETURN_REQUIRED:
    "برای استرداد آزمایشی، ابتدا مرجوعی فیزیکی را دریافت کنید.",
  CONFLICT_IDEMPOTENCY: "این شناسه قبلاً با اطلاعات متفاوت ثبت شده است.",

  INVALID_UID:
    "UID باید ۳ تا ۸۰ نویسه شامل حروف لاتین، عدد، خط تیره یا زیرخط باشد.",
  INVALID_EPC: "EPC باید کد هگز با طول زوج، بین ۸ و ۱۲۸ نویسه باشد.",
  CONFLICT_RECONCILIATION:
    "تعداد یا مجموع وزن قطعات با فاکتور تطبیق ندارد؛ اختلاف ردیف‌ها را بررسی کنید.",
  CONFLICT_VERIFIED_BATCH:
    "پذیرش تأییدشده قابل ویرایش نیست؛ سوابق قطعات باید حفظ شوند.",
  CONFLICT_DERIVED_STOCK:
    "تعداد موجودی از قطعات واقعی محاسبه می‌شود؛ اصلاح را از بخش قطعات انجام دهید.",
  CONFLICT_ITEM_STATE: "این عملیات با وضعیت فعلی قطعه سازگار نیست.",
  CONFLICT_AMBIGUOUS_SCAN:
    "این ورودی با UID و EPC دو قطعه متفاوت تطبیق دارد؛ در بخش جستجوی قطعه بررسی کنید.",
  INVALID_UNLINKED_PRODUCT:
    "پیش از تأیید، همه ردیف‌ها باید به محصول مشترک متصل شوند.",
  INVALID_PRODUCT_PURITY: "عیار ردیف با عیار محصول مشترک مطابقت ندارد.",
  CONFLICT_CLOSED_COUNT: "جلسه شمارش بسته شده است؛ جلسه جدیدی شروع کنید.",

  CONFLICT_OFFER_CHANGED:
    "قیمت یا موجودی عرضه تغییر کرده است؛ قیمت تازه را بررسی کنید.",
  CONFLICT_STOCK: "موجودی کافی نیست؛ سبد را اصلاح کنید.",
  CONFLICT_RATE_CHANGED:
    "نرخ طلا تغییر کرده است؛ قیمت تازه را بررسی و دوباره تأیید کنید.",
  CONFLICT_RATE_STALE: "نرخ نیاز به به‌روزرسانی مدیر دارد.",
  CONFLICT_QUOTE_EXPIRED: "مهلت قیمت پایان یافته است؛ قیمت تازه دریافت کنید.",
  CONFLICT_VERSION: "اطلاعات تغییر کرده است؛ صفحه را تازه کنید.",
  UNAUTHORIZED: "ایمیل یا رمز عبور نادرست است، یا نشست پایان یافته است.",
  FORBIDDEN: "دسترسی مجاز نیست.",
  CONFLICT_BUSINESS_SUSPENDED:
    "فعالیت تجاری فروشنده متوقف است؛ پرداخت تازه ممکن نیست. سوابق سفارش شما محفوظ است.",
  CONFLICT_AGENCY_DISABLED:
    "فروش نیابتی و مستقیم نسخه جدید در این محیط غیرفعال است؛ معامله جدید با این مجوز ممکن نیست.",
  CONFLICT_MANDATE_UNAVAILABLE:
    "مجوز فروش تأیید نشده، لغو شده یا خارج از بازه اعتبار است؛ مدیر باید مجوز معتبر را بررسی کند.",
  CONFLICT_MANDATE_CONTRACT:
    "مجوز فروش با نسخه جاری قرارداد یا نوع مالکیت سازگار نیست؛ قرارداد و مجوز را بررسی کنید.",
  CONFLICT_MANDATE_CHANGED:
    "مجوز یا هویت فروشنده تغییر کرده است؛ پیش از پرداخت، قیمت و نقش فروشنده را دوباره بررسی و سفارش تازه ثبت کنید.",
  CONFLICT_AGENCY_TERMS_CHANGED:
    "شرایط مصوب قیمت یا مالیات تغییر کرده است؛ قیمت تازه دریافت کنید و شرایط فروش را دوباره تأیید کنید.",
  CONFLICT_AGENCY_ALLOCATION:
    "تخصیص مبلغ وصولی با تعهد فروشنده، سهم مصوب دیدار و مالیات تطبیق ندارد؛ معامله ثبت نشد و نیازمند بررسی مالی است.",
  CONFLICT_AGENCY_DIRECT_PAYER:
    "شرایط پرداخت هزینه خدمات برای این فروش مستقیم تأیید نشده است؛ ادامه خرید ممکن نیست.",
  CONFLICT_AGENCY_BENEFICIARY:
    "ذی‌نفع یکی از اجزای قیمت یا خدمات ثالث مشخص و مصوب نیست؛ مدیر باید قواعد تخصیص را اصلاح کند.",
  CONFLICT_AGENCY_CONVERSION_ROUNDING:
    "اختلاف تبدیل تعهد از حد گردکردن مصوب بیشتر است؛ قرارداد، قیمت و حد مجاز باید بررسی شوند.",
  CONFLICT_PHYSICAL_TITLE_EVIDENCE:
    "مدرک پذیرش و مالکیت قطعه با نقش فروش انتخاب‌شده سازگار نیست؛ پیش از فروش، سوابق مالکیت را بررسی کنید.",
  CONFLICT_INVOICE_REQUIRED:
    "سند اصلی فروش برای این اصلاح پیدا نشد؛ سوابق سفارش باید بررسی شوند.",
  CONFLICT_INVOICE_SOURCE:
    "مرجع سند اصلاحی با رویداد اصلی فروش تطبیق ندارد؛ سند جدید ثبت نشد.",
  CONFLICT_IMMUTABLE_FINANCE:
    "تصمیم مالی ثبت‌شده قابل بازنویسی نیست؛ برای تغییر از نسخه جدید یا لغو مجاز استفاده کنید.",
  CONFLICT_CURATION_CHANGED:
    "توافق گزینش کالا تغییر کرده، لغو شده یا دیگر معتبر نیست؛ سبد و قیمت را در همین ویترین تازه کنید.",
  CONFLICT_CURATION_SELLER:
    "فروشنده کالا مجوز معتبر فروش نیابتی ندارد؛ توافق گزینش قابل تأیید نیست.",
  CONFLICT_IMMUTABLE_CURATION:
    "تصمیم ثبت‌شده توافق گزینش قابل بازنویسی نیست؛ برای توقف از لغو و برای تغییر از نسخه تازه استفاده کنید.",
  CONFLICT_STORE_SCOPE:
    "این عرضه در دامنه مجاز این ویترین نیست؛ کالای مجاز را از همین فروشگاه انتخاب کنید.",
  INVALID_MANDATE_CONTRACT:
    "کسب‌وکار فعال، قرارداد جاری تأییدشده و نوع مالکیت متناسب با فروش نیابتی یا مستقیم را انتخاب کنید.",
  INVALID_MANDATE_DATES:
    "بازه اثر مجوز معتبر نیست؛ زمان پایان باید پس از زمان شروع باشد.",
  INVALID_BENEFICIARIES:
    "کدهای یکتای خدمات و شناسه کسب‌وکارهای فعال و تأییدشده را برای ذی‌نفعان انتخاب کنید.",
  INVALID_ALLOCATION_RULE:
    "قاعده تخصیص انتخاب‌شده مصوب نیست؛ فقط قاعده پشتیبانی‌شده مجاز است.",
  INVALID_CURATION_PARTIES:
    "برای توافق گزینش، ویترین گزینشگر و فروشنده واقعی باید دو کسب‌وکار متفاوت باشند.",
  INVALID_CURATION_STORE:
    "ویترین گزینشگر باید متعلق به کسب‌وکار فعال و تأییدشده باشد.",
  INVALID_CURATION_SELLER:
    "فروشنده واقعی باید مجوز معتبر فروش نیابتی داشته باشد.",
  INVALID_CURATION_OFFER:
    "عرضه معتبر متعلق به فروشنده انتخاب‌شده را تعیین کنید؛ شناسه کالای دیگر مجاز نیست.",
  INVALID_CURATION_DATES:
    "بازه اثر توافق گزینش معتبر نیست؛ زمان پایان باید پس از زمان شروع باشد.",
  INVALID_ROUNDING_LIMIT:
    "حد گردکردن باید عدد صحیح بین صفر و ۱۰٬۰۰۰ ریال باشد و مطابق توافق مصوب ثبت شود.",
  INVALID_APPROVAL: "تصمیم بررسی باید تأیید یا رد باشد.",
  INVALID_TEXT:
    "شرح یا مرجع معتبر را وارد کنید؛ متن خالی یا بیش از حد مجاز پذیرفته نیست.",
  INVALID_ADDRESS: "شماره همراه و کد پستی را بررسی کنید.",
  INVALID_PASSWORD_MIN_12: "رمز عبور باید حداقل ۱۲ نویسه باشد.",
  CONFLICT_DUPLICATE: "این مورد قبلاً ثبت شده است.",
  BACKEND_UNAVAILABLE: "ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.",
  CONFLICT_SUPPLIER_PENDING: "فعالیت تأمین‌کننده پس از تأیید مدیر ممکن است.",
};
