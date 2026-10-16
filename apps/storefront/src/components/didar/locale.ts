// All formatters and navigation copy are centralized for a later English locale.
export const locale = 'fa-IR'
export const number = (n: number | string) =>
  new Intl.NumberFormat(locale).format(
    typeof n === 'string' && /^-?\d+$/.test(n) ? BigInt(n) : Number(n),
  )
export const money = (n: number | string) => number(n) + ' ریال'
export const weight = (n: number) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n / 1000) + ' گرم'
export const date = (s: string) => new Date(s).toLocaleString(locale)
export const copy = {
  home: 'دیدار گلد',
  catalog: 'ویترین طلا',
  cart: 'سبد خرید',
  account: 'حساب من',
  orders: 'سفارش‌ها',
  login: 'ورود / عضویت',
  manage: 'مدیریت طلا',
}
export const states: Record<string, string> = {
  reserved: 'رزرو شده',
  sold: 'فروخته شده',
  returned: 'مرجوعی',
  requested: 'درخواست مرجوعی',
  received: 'دریافت فیزیکی',
  restocked: 'بازگشت به فروش',
  pending: 'در انتظار پرداخت',
  initialized: 'آماده پرداخت',
  paid: 'پرداخت شده',
  success: 'موفق',
  failed: 'پرداخت ناموفق',
  failure: 'ناموفق',
  cancelled: 'لغو شده',
  cancel: 'لغو شده',
  expired: 'منقضی شده',
  approved: 'تأیید شده',
  rejected: 'رد شده',
  allocated: 'تخصیص به تأمین‌کننده',
  preparing: 'در حال آماده‌سازی',
  dispatched: 'ارسال شده',
  delivered: 'تحویل شده',
}
export const errors: Record<string, string> = {
  CONFLICT_FACET_CARDINALITY:
    'این محصول یک جایگاه تجاری تأییدشده دارد؛ ابتدا مقدار قبلی را بازنشسته کنید.',
  CONFLICT_CLASSIFICATION_APPROVED:
    'پیشنهاد نمی‌تواند طبقه‌بندی تأییدشده دیدار را جایگزین کند.',
  CONFLICT_CLASSIFICATION_OWNERSHIP:
    'این پیشنهاد متعلق به تأمین‌کننده دیگری است و قابل ویرایش نیست.',
  CONFLICT_TRANSLATION_REVIEWED:
    'این ترجمه قبلاً بررسی شده است؛ برای تغییر، پیش‌نویس تازه ثبت کنید.',
  INVALID_CLASSIFICATION_EVIDENCE:
    'برای تأیید این برچسب، شاهد و منبع بررسی‌شده با حداقل ۱۰ نویسه لازم است.',
  INVALID_CLASSIFICATION_REASON:
    'دلیل پیشنهاد یا بررسی را با حداقل ۵ نویسه وارد کنید.',
  INVALID_BEST_SELLER_EVIDENCE:
    'برچسب پرفروش نیازمند شاهد و حداقل ۵ واحد فروش پرداخت‌شده است؛ برای انتخاب تحریریه از منتخب دیدار استفاده کنید.',
  INVALID_COLLECTION_EVIDENCE:
    'انتشار مجموعه نسخه محدود نیازمند شاهد و منبع بررسی‌شده است.',
  INVALID_COLLECTION_TYPE:
    'نوع فعال و تأییدشده F11 را برای انتشار مجموعه انتخاب کنید.',
  INVALID_TRANSLATION_SCRIPT:
    'خط و زبان برچسب با زبان انتخاب‌شده سازگار نیست؛ ترجمه را بازبینی کنید.',
  INVALID_FACET_VALUE:
    'مقدار باید فعال، دارای برچسب فارسی تأییدشده و متعلق به گروه مجاز باشد.',
  INVALID_FACET_IDENTITY:
    'کد، گروه و قواعد هویتی واژه دائمی هستند؛ از بازنشستگی استفاده کنید.',
  INVALID_COLLECTION_IDENTITY: 'شناسه و کد دائمی مجموعه قابل تغییر نیست.',

  INVALID_CATEGORY_RANK:
    'رتبه باید خانواده ← دسته ← زیردسته نهایی باشد؛ گره قدیمی نیازمند بازبینی مدیر است.',
  INVALID_CATEGORY_CODE: 'شناسه و کد ساختاری دائمی قابل تغییر نیست.',
  INVALID_PUBLICATION_TAXONOMY:
    'انتشار نیازمند خانواده، دسته و زیردسته نهایی فعال است.',
  INVALID_LABEL_VISIBILITY:
    'QR مشتری فقط برای قطعه پذیرفته‌شده با محصول فعال و منتشرشده مجاز است.',
  INVALID_PUBLIC_ORIGIN: 'نشانی عمومی HTTPS برای چاپ QR مشتری تأیید نشده است.',
  INVALID_LABEL_ITEMS:
    'قطعات معتبر و یکتا را انتخاب کنید؛ حداکثر ۱۰۰ قطعه در هر نوبت.',

  CONFLICT_NO_UNEXPORTED_EVENTS:
    'رویداد مالی تازه‌ای در این دوره وجود ندارد؛ دوره، تأمین‌کننده و خروجی قبلی را بررسی کنید.',
  CONFLICT_MAPPING_REQUIRED:
    'پیش از بستن دوره، نگاشت آزمایشی حساب تأمین‌کننده را ثبت کنید.',
  CONFLICT_WALLET_OVERDRAFT:
    'مانده آزاد کافی نیست؛ وجوه رزرو یا وثیقه قابل خرج نیستند.',
  CONFLICT_OVER_ALLOCATION: 'مقدار تخصیص بیش از ظرفیت خرید یا تعهد است.',
  CONFLICT_OVER_SETTLEMENT: 'مقدار تسویه بیش از مانده مجاز است.',
  CONFLICT_TITLE_AND_CUSTODY_REQUIRED:
    'پیش از تسویه طلا، انتقال مالکیت و وضعیت فیزیکی را مستقل تأیید کنید.',
  CONFLICT_APPROVAL_REQUIRED:
    'تأیید درخواست و خرید یا سند مالکیت خرید هنوز کامل نیست.',
  CONFLICT_RETURN_REQUIRED:
    'برای استرداد آزمایشی، ابتدا مرجوعی فیزیکی را دریافت کنید.',
  CONFLICT_IDEMPOTENCY: 'این شناسه قبلاً با اطلاعات متفاوت ثبت شده است.',

  INVALID_UID:
    'UID باید ۳ تا ۸۰ نویسه شامل حروف لاتین، عدد، خط تیره یا زیرخط باشد.',
  INVALID_EPC: 'EPC باید کد هگز با طول زوج، بین ۸ و ۱۲۸ نویسه باشد.',
  CONFLICT_RECONCILIATION:
    'تعداد یا مجموع وزن قطعات با فاکتور تطبیق ندارد؛ اختلاف ردیف‌ها را بررسی کنید.',
  CONFLICT_VERIFIED_BATCH:
    'پذیرش تأییدشده قابل ویرایش نیست؛ سوابق قطعات باید حفظ شوند.',
  CONFLICT_DERIVED_STOCK:
    'تعداد موجودی از قطعات واقعی محاسبه می‌شود؛ اصلاح را از بخش قطعات انجام دهید.',
  CONFLICT_ITEM_STATE: 'این عملیات با وضعیت فعلی قطعه سازگار نیست.',
  CONFLICT_AMBIGUOUS_SCAN:
    'این ورودی با UID و EPC دو قطعه متفاوت تطبیق دارد؛ در بخش جستجوی قطعه بررسی کنید.',
  INVALID_UNLINKED_PRODUCT:
    'پیش از تأیید، همه ردیف‌ها باید به محصول مشترک متصل شوند.',
  INVALID_PRODUCT_PURITY: 'عیار ردیف با عیار محصول مشترک مطابقت ندارد.',
  CONFLICT_CLOSED_COUNT: 'جلسه شمارش بسته شده است؛ جلسه جدیدی شروع کنید.',

  CONFLICT_OFFER_CHANGED:
    'قیمت یا موجودی عرضه تغییر کرده است؛ قیمت تازه را بررسی کنید.',
  CONFLICT_STOCK: 'موجودی کافی نیست؛ سبد را اصلاح کنید.',
  CONFLICT_RATE_CHANGED:
    'نرخ طلا تغییر کرده است؛ قیمت تازه را بررسی و دوباره تأیید کنید.',
  CONFLICT_RATE_STALE: 'نرخ نیاز به به‌روزرسانی مدیر دارد.',
  CONFLICT_QUOTE_EXPIRED: 'مهلت قیمت پایان یافته است؛ قیمت تازه دریافت کنید.',
  CONFLICT_VERSION: 'اطلاعات تغییر کرده است؛ صفحه را تازه کنید.',
  UNAUTHORIZED: 'ایمیل یا رمز عبور نادرست است، یا نشست پایان یافته است.',
  FORBIDDEN: 'دسترسی مجاز نیست.',
  INVALID_ADDRESS: 'شماره همراه و کد پستی را بررسی کنید.',
  INVALID_PASSWORD_MIN_12: 'رمز عبور باید حداقل ۱۲ نویسه باشد.',
  CONFLICT_DUPLICATE: 'این مورد قبلاً ثبت شده است.',
  BACKEND_UNAVAILABLE: 'ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.',
  CONFLICT_SUPPLIER_PENDING: 'فعالیت تأمین‌کننده پس از تأیید مدیر ممکن است.',
}
