import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Container, Heading, Text, Button, Input, Label } from "@medusajs/ui";
import { errors } from "./locale";
import { DidarContext, type Store } from "./store";
import "./native-workspace.css";
export function NativeWorkspace({
  surface,
  backend,
  headers,
  children,
}: {
  surface: "admin" | "vendor";
  backend: string;
  headers: () => Record<string, string>;
  children: ReactNode;
}) {
  const [user, setUser] = useState<any>(null),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [data, setData] = useState<any>({}),
    [publicOrigin, setPublicOrigin] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH"),
    [cart, setCart] = useState<Record<string, number>>({});
  const api = useCallback(
    async (action: string, body?: any) => {
      if (!/^[a-z-]+(?:\?.*)?$/.test(action)) throw Error("INVALID_ACTION");
      const r = await fetch(`${backend}/${surface}/didar/${action}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) {
        const message = String(d.message || "INTERNAL_ERROR");
        throw Error(
          errors[message] ||
            (message.startsWith("INVALID")
              ? "اطلاعات فرم یا مرجع انتخابی معتبر نیست؛ دوباره بررسی کنید."
              : message.startsWith("CONFLICT")
                ? "اطلاعات تغییر کرده است؛ صفحه را تازه کنید و دوباره تلاش کنید."
                : /^[A-Z_]+$/.test(message)
                  ? "انجام عملیات ممکن نشد؛ دسترسی و اطلاعات را بررسی کنید."
                  : message),
        );
      }
      return d;
    },
    [backend, surface, headers],
  );
  const mediaURL = useCallback(
    (src: string) => {
      if (!src.startsWith("/api/didar/")) return src;
      return `${backend}/${surface}/didar/${src.slice("/api/didar/".length)}`;
    },
    [backend, surface],
  );
  const refresh = useCallback(async () => {
    setData(await api("catalog"));
  }, [api]);
  const load = useCallback(async () => {
    try {
      const c = await api("context");
      setUser(c.user);
      setPublicOrigin(c.public_origin || "");
      if (c.can_catalog !== false) await refresh();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setReady(true);
    }
  }, [api, refresh]);
  useEffect(() => {
    load();
  }, [load]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  const LinkComponent = useCallback(
    ({ href, children, ...props }: any) => {
      if (href === "/account/wallet")
        return (
          <RouterLink {...props} to="/didar/wallet">
            {children}
          </RouterLink>
        );
      if (typeof href === "string" && /^\/(orders|wallet)(\/|$)/.test(href))
        return (
          <RouterLink {...props} to={"/didar" + href}>
            {children}
          </RouterLink>
        );
      if (typeof href === "string" && href.startsWith("/manage")) {
        const path = href.replace(
          /^\/manage(?:\/(?:admin|supplier))?(?=\/|$)/,
          "/didar",
        );
        return (
          <RouterLink {...props} to={path}>
            {children}
          </RouterLink>
        );
      }
      return (
        <a
          {...props}
          href={
            publicOrigin && href?.startsWith("/")
              ? new URL(href, publicOrigin).toString()
              : href
          }
        >
          {children}
        </a>
      );
    },
    [publicOrigin],
  );
  const value: Store = {
    user,
    ready,
    loading: !ready,
    busy,
    message,
    setMessage,
    api,
    refresh,
    run,
    products: data.products || [],
    categories: data.categories || [],
    collections: data.collections || [],
    rate: data.rate,
    store: null,
    scopeReady: true,
    scopedHref: (s) => s,
    paymentMethod,
    setPaymentMethod,
    cart,
    setCart,
    authenticate: () => {},
    updateUser: setUser,
    add: () => {},
    LinkComponent,
    publicOrigin,
    mediaURL,
    mediaHeaders: headers,
  };
  return (
    <DidarContext.Provider value={value}>
      <Container dir="rtl" className="didar-extension">
        <Heading level="h1">
          {surface === "admin"
            ? "دیدار · مدیریت مرکزی"
            : "دیدار · فضای فروشنده"}
        </Heading>
        {message && (
          <p role="status">
            {message === "FORBIDDEN"
              ? "دسترسی یا اتصال حساب معتبر نیست."
              : message}
          </p>
        )}
        {!ready ? (
          <Text>در حال دریافت حساب…</Text>
        ) : user &&
          user.native_supplier_id &&
          (!user.supplier_active ||
            user.supplier_status !== "approved" ||
            user.native_seller_status !== "open") ? (
          <>
            <p role="status">
              فعالیت تجاری متوقف است؛ سوابق مجاز فقط خواندنی است.
            </p>
            {children}
          </>
        ) : user ? (
          children
        ) : (
          <>
            <Heading level="h2">اتصال حساب موجود دیدار</Heading>
            <Text>
              با حساب بومی Mercur وارد شده‌اید. برای حفظ سوابق، مالکیت حساب
              موجود دیدار را یک بار تأیید کنید. فروشنده باید ابتدا به
              تأمین‌کننده درست توسط مدیر متصل شده باشد.
            </Text>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  const response = await fetch(`${backend}/didar/login`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      email: f.get("email"),
                      password: f.get("password"),
                    }),
                  });
                  const proof = await response.json();
                  if (!response.ok) throw Error(proof.message);
                  await api("connect", { didar_token: proof.token });
                  window.location.reload();
                });
              }}
            >
              <Label htmlFor="didar-email">ایمیل حساب دیدار</Label>
              <Input
                id="didar-email"
                name="email"
                type="email"
                required
                autoComplete="username"
              />
              <Label htmlFor="didar-password">رمز حساب دیدار</Label>
              <Input
                id="didar-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
              <Button type="submit" disabled={busy}>
                اتصال امن حساب
              </Button>
            </form>
          </>
        )}
      </Container>
    </DidarContext.Provider>
  );
}
