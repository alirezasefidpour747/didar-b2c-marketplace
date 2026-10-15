// All formatters and navigation copy are centralized for a later English locale.
export const locale = 'fa-IR'
export const number = (n: number | string) =>
  new Intl.NumberFormat(locale).format(Number(n))
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
