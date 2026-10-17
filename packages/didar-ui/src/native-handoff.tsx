import { useEffect } from "react";
const key = "didar-native-return";
const feature =
  /^\/didar(?:\/(?:history|connect|connections|pricing|operations|finance|treasury|ledger|tahesab|acceptance|onboarding|storefront|sharing|wallet|orders(?:\/[\w-]+)?|pages(?:\/preview\/[\w-]+)?))?$/;
export function safeNativeReturn(value: string) {
  try {
    const u = new URL(value, "https://native.invalid");
    if (
      u.origin !== "https://native.invalid" ||
      !feature.test(u.pathname) ||
      value.split("?")[0] !== u.pathname ||
      u.hash
    )
      return null;
    for (const [k, v] of u.searchParams)
      if (
        !["product_id", "supplier_id", "id", "batch_id", "order_id"].includes(
          k,
        ) ||
        !/^[\w-]{1,120}$/.test(v) ||
        u.searchParams.getAll(k).length !== 1
      )
        return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}
/** Public SDK route. Credentials stay in Mercur's original login/store selector. */
export function NativeHandoff({ base }: { base: string }) {
  useEffect(() => {
    const to = safeNativeReturn(
      new URLSearchParams(location.search).get("to") || "/didar/connect",
    );
    if (!to) return;
    sessionStorage.setItem(key, JSON.stringify({ to, at: Date.now() }));
    location.replace(base + to);
  }, [base]);
  return <p dir="rtl">در حال ورود به فضای کاری بومی دیدار…</p>;
}
/** The native Vendor selector intentionally returns to its own home. Restore
 * only a validated feature path after genuine native authentication/selection. */
export function NativeResume({
  base,
  backend,
  surface,
  headers,
}: {
  base: string;
  backend: string;
  surface: "admin" | "vendor";
  headers: () => Record<string, string>;
}) {
  useEffect(() => {
    let busy = false,
      last = "",
      disposed = false;
    const tick = async () => {
      if (busy || disposed) return;
      let saved: any;
      try {
        saved = JSON.parse(sessionStorage.getItem(key) || "null");
      } catch {
        sessionStorage.removeItem(key);
      }
      if (!saved) return;
      const to = safeNativeReturn(saved.to || "");
      if (
        !to ||
        !Number.isFinite(saved.at) ||
        Date.now() - saved.at > 1800000
      ) {
        sessionStorage.removeItem(key);
        return;
      }
      const path = location.pathname;
      if (!path.startsWith(base + "/") && path !== base) return;
      // Native Admin returns to the same pathname after login and drops its
      // search string. Reset the attempt marker while authentication/selection
      // is pending so that the authenticated return restores the exact query.
      if (/\/(login|store-select|handoff|reset-password)$/.test(path)) {
        last = "";
        return;
      }
      if (last === path) return;
      busy = true;
      last = path;
      try {
        const me = await fetch(
          `${backend}/${surface}/${surface === "admin" ? "users" : "members"}/me`,
          { headers: headers(), cache: "no-store" },
        );
        if (!me.ok) {
          last = "";
          return;
        }
        const context = await fetch(`${backend}/${surface}/didar/context`, {
          headers: headers(),
          cache: "no-store",
        });
        if (disposed) return;
        if (!context.ok) {
          if (path !== base + "/didar/connect")
            location.replace(base + "/didar/connect");
          return;
        }
        sessionStorage.removeItem(key);
        if (location.pathname + location.search !== base + to)
          location.replace(base + to);
      } catch {
        last = "";
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, 500);
    tick();
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [base, backend, surface, headers]);
  return null;
}
