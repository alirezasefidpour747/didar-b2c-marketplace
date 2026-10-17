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

export function NativeAccessAdmin() {
  const { api, run, busy } = useDidar(),
    [actors, setActors] = useState<any[]>([]);
  async function load() {
    setActors((await api("access-links")).actors);
  }
  useEffect(() => {
    run(load);
  }, []);
  return (
    <section>
      <h2>دسترسی بومی همکاران</h2>
      <p>
        محدودیت بومی فقط دسترسی موجود را کاهش می‌دهد. اعطای اختیار تجاری از
        مجوزهای دیدار و مالکیت فروشگاه پیروی می‌کند. آخرین مدیر قابل استفاده
        تعلیق نمی‌شود.
      </p>
      {actors.map((a) => (
        <form
          key={a.actor_type + ":" + a.actor_id}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              await api("access-links", {
                operation: "policy",
                actor_type: a.actor_type,
                actor_id: a.actor_id,
                preset: f.get("preset"),
                reason: f.get("reason"),
              });
              await load();
            });
          }}
        >
          <h3>
            {a.name} · {a.email}
          </h3>
          <p>
            {a.role} · {a.active ? "ورود متصل فعال" : "ورود متصل تعلیق شده"}
          </p>
          <label>
            محدودیت ورود بومی
            <select name="preset" defaultValue="DEFAULT">
              <option value="DEFAULT">نقش و مجوزهای اصلی</option>
              <option value="READ_ONLY">فقط مشاهده</option>
              <option value="CONTENT">فقط محتوای مجاز</option>
              <option value="ONBOARDING">فقط پذیرش مجاز</option>
              <option value="DISABLED">تعلیق ورود بومی</option>
            </select>
          </label>
          <label>
            دلیل ثبت تغییر
            <input name="reason" required maxLength={1000} />
          </label>
          <button disabled={busy}>ثبت محدودیت ورود</button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              const f = new FormData(e.currentTarget.form!);
              run(async () => {
                await api("access-links", {
                  operation: "actor",
                  actor_type: a.actor_type,
                  actor_id: a.actor_id,
                  active: !a.active,
                  reason: f.get("reason"),
                });
                await load();
              });
            }}
          >
            {a.active ? "تعلیق اتصال حساب" : "فعال‌سازی اتصال حساب"}
          </button>
        </form>
      ))}
    </section>
  );
}
