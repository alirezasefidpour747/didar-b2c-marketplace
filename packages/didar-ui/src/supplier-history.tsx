import { useEffect, useState } from "react";
import { useDidar } from "./store";
export function SupplierHistory() {
  const { api } = useDidar();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api("history")
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active)
          setError("دریافت سوابق مجاز ممکن نشد؛ دسترسی را بررسی کنید.");
      });
    return () => {
      active = false;
    };
  }, [api]);
  return (
    <section>
      {error && <p role="status">{error}</p>}
      <h2>سوابق مجاز فروشنده · فقط خواندنی</h2>
      <p>
        توقف فعالیت تجاری، سوابق پرداخت‌شده و شناسه قطعات را تغییر نمی‌دهد.
        ایجاد معامله یا تسویه از این صفحه ممکن نیست.
      </p>
      {data && (
        <>
          <p>{data.supplier.name}</p>
          <table>
            <caption>سفارش‌های پرداخت‌شده خود شما</caption>
            <thead>
              <tr>
                <th>سفارش</th>
                <th>محصول</th>
                <th>شناسه قطعه</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o: any) => (
                <tr key={o.line_id}>
                  <td>{o.id}</td>
                  <td>{o.title}</td>
                  <td>{o.items?.map((i: any) => i.uid).join("، ") || "—"}</td>
                  <td>{o.fulfillment_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <caption>مانده ثبت‌شده دفترکل</caption>
            <thead>
              <tr>
                <th>حساب</th>
                <th>واحد</th>
                <th>مانده</th>
              </tr>
            </thead>
            <tbody>
              {data.balances.map((b: any) => (
                <tr key={b.account + b.instrument}>
                  <td>{b.account}</td>
                  <td>{b.instrument}</td>
                  <td>{b.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
