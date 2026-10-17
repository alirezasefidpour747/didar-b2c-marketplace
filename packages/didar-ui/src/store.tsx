"use client";
import React, {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";
export type Price = {
  [key: string]: any;
  distribution_irr?: number;
  retail_irr?: number;
  pricing_policy_id?: number;
  price_model?: string;
  metal_irr: number;
  labor_irr: number;
  margin_irr: number;
  tax_irr: number;
  fee_irr?: number;
  total_irr: number;
};
export type Offer = {
  prices?: Record<string, Price> | null;
  price_unavailable_reason?: string | null;
  stock_mode?: string;
  making_mode?: string;
  making_bps?: number;
  making_weight_mg?: number;
  id: string;
  supplier_id: string;
  supplier: string;
  weight_mg: number;
  quantity: number;
  labor_irr: number;
  labor_bps?: number;
  labor_mode?: string;
  margin_bps: number;
  active?: boolean;
  terms?: string;
  version: number;
  price: Price | null;
};
export type Image = {
  id: string;
  url: string;
  alt: string;
  position: number;
  private?: boolean;
  srcset?: string;
};
export type Product = {
  classification?: Record<string, { code: string; label: string }[]>;
  id: string;
  title: string;
  category: string;
  slug?: string;
  public_key?: string;
  taxonomy_ready?: boolean;
  canonical_path?: string;
  breadcrumbs?: { id: string; name: string; slug: string }[];
  category_id?: string;
  description: string;
  purity: number;
  reference?: string;
  jewelry_type?: string;
  min_weight_mg?: number;
  max_weight_mg?: number;
  active?: boolean;
  approved?: boolean;
  attributes?: Record<string, string>;
  published?: boolean;
  collection_ids?: string[];
  images?: Image[];
  offers: Offer[];
};
export type User = {
  content_operator?: boolean;
  merchant_memberships?: { supplier_id: string; permission: string }[];
  id: string;
  name: string;
  email: string;
  role: string;
  supplier_id?: string;
  phone?: string;
  address?: any;
};
export type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id?: string;
  kind?: "legacy" | "family" | "category" | "subcategory";
  active?: boolean;
  code?: string;
};
export type Collection = {
  id: string;
  name: string;
  slug: string;
  product_ids?: string[];
};
export type Store = {
  LinkComponent?: ComponentType<any>;
  publicOrigin?: string;
  mediaURL?: (src: string) => string;
  mediaHeaders?: () => Record<string, string>;
  store: any;
  scopedHref: (href: string) => string;
  scopeReady: boolean;

  paymentMethod: string;
  setPaymentMethod: (m: string) => void;
  products: Product[];
  categories: Category[];
  collections: Collection[];
  rate: any;
  user: User | null;
  ready: boolean;
  loading: boolean;
  busy: boolean;
  message: string;
  setMessage: (s: string) => void;
  cart: Record<string, number>;
  setCart: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  api: (action: string, body?: any, token?: string) => Promise<any>;
  refresh: () => Promise<void>;
  run: (fn: () => Promise<void>) => Promise<void>;
  authenticate: (data: { user: User; token: string }) => void;
  updateUser: (u: User) => void;
  add: (o: Offer) => void;
};
export const DidarContext = createContext<Store | null>(null);
export function useDidar() {
  const s = useContext(DidarContext);
  if (!s) throw Error("DidarProvider missing");
  return s;
}
export function Link(props: any) {
  const s = useDidar();
  const Component = s.LinkComponent;
  return Component ? <Component {...props} /> : <a {...props} />;
}
export function RequireUser({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: string[];
}) {
  const { user, ready, scopedHref } = useDidar();
  if (!ready) return <p role="status">در حال دریافت حساب…</p>;
  if (!user)
    return (
      <div className="empty">
        <h1>ورود به حساب</h1>
        <p>برای مشاهده این صفحه وارد حساب خود شوید.</p>
        <Link className="primary" href={scopedHref("/login")}>
          ورود / عضویت
        </Link>
      </div>
    );
  if (roles && !roles.includes(user.role))
    return (
      <div className="empty">
        <h1>دسترسی محدود</h1>
        <p>این بخش برای نقش حساب شما در دسترس نیست.</p>
      </div>
    );
  return <>{children}</>;
}

export function PaymentMethodPicker() {
  const { paymentMethod, setPaymentMethod } = useDidar();
  return (
    <label>
      روش محاسبه قیمت
      <select
        aria-label="روش محاسبه قیمت"
        value={paymentMethod}
        onChange={(e) => setPaymentMethod(e.target.value)}
      >
        <option value="CASH">نقدی</option>
        <option value="CREDIT">اعتباری؛ محاسبه و پرداخت آزمایشی</option>
      </select>
    </label>
  );
}

export function ScopedLink(
  props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string },
) {
  const { scopedHref } = useDidar();
  return (
    <Link
      {...props}
      href={
        typeof props.href === "string" ? scopedHref(props.href) : props.href
      }
    />
  );
}
