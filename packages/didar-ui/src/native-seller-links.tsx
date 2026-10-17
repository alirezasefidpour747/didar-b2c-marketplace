import { useEffect, useState } from "react";
import { useDidar } from "./store";
export function NativeSellerLinks() {
  const { api, run, busy } = useDidar(),
    [data, setData] = useState<any[]>([]),
    [suppliers, setSuppliers] = useState<any[]>([]);
  async function load() {
    setData((await api("seller-links")).links);
    setSuppliers((await api("manage")).suppliers);
  }
  useEffect(() => {
    run(load);
  }, []);
  return (
    <section>
      <h2>پیوند فروشگاه Mercur و تأمین‌کننده دیدار</h2>
      <p>
        شناسه فروشگاه بومی را از بخش Stores بردارید. اتصال فقط به پرونده موجود
        انجام می‌شود؛ محصول، موجودی یا حساب مالی جدیدی ایجاد نمی‌کند.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(async () => {
            await api("seller-links", {
              seller_id: f.get("seller_id"),
              supplier_id: f.get("supplier_id"),
            });
            await load();
          });
        }}
      >
        <label>
          شناسه فروشگاه Mercur
          <input name="seller_id" required maxLength={100} />
        </label>
        <label>
          تأمین‌کننده موجود
          <select name="supplier_id" required>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy}>ثبت پیوند تأییدشده</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>فروشگاه بومی</th>
            <th>تأمین‌کننده</th>
            <th>وضعیت</th>
          </tr>
        </thead>
        <tbody>
          {data.map((l) => (
            <tr key={l.seller_id}>
              <td>{l.seller_id}</td>
              <td>{l.name}</td>
              <td>{l.active ? "فعال" : "غیرفعال"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
