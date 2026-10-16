'use client'
import { useEffect, useState } from 'react'
import { useDidar } from './store'
type Label = {
  id: string
  uid: string
  title: string
  barcode_width_mm: number
  barcode: string
  resolver_url: string | null
  qr: string | null
}
export function UIDLabels({
  batchId,
  items,
}: {
  batchId: string
  items: { id: string; uid: string; status: string }[]
}) {
  const { api, run, busy, setMessage } = useDidar()
  const [configuration, setConfiguration] = useState<{
    customer_qr_available: boolean
  } | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [mode, setMode] = useState('warehouse')
  const [width, setWidth] = useState(100),
    [height, setHeight] = useState(80)
  const eligible = items.filter((i) => i.status !== 'void')
  useEffect(() => {
    let active = true
    api('labels')
      .then((d) => {
        if (active) setConfiguration(d)
      })
      .catch((e) => {
        if (active) setMessage(e.message)
      })
    return () => {
      active = false
    }
  }, [api, setMessage])
  useEffect(() => {
    setSelected([])
    setLabels([])
  }, [batchId])
  const fits =
    labels.length > 0 &&
    labels.every((i) => i.barcode_width_mm <= width - 8) &&
    (mode !== 'customer' || height >= 80)
  async function generate(all = false) {
    setLabels([])
    const d = await api('labels', {
      mode,
      ...(all ? { batch_id: batchId } : { item_ids: selected }),
    })
    setLabels(d.items)
  }
  return (
    <details className="uid-label-controls" data-testid="uid-label-controls">
      <summary>بارکد UID و QR دائمی / چاپ برچسب</summary>
      <p>
        بارکد انبار بدون RFID کار می‌کند. QR مشتری فقط برای محصول منتشرشده و
        مبدأ عمومی تأییدشده فعال است. اسکن، موجود بودن همان قطعه را تضمین
        نمی‌کند.
      </p>
      {configuration && !configuration.customer_qr_available && (
        <p role="status">
          QR مشتری غیرفعال است؛ مدیر استقرار باید نشانی عمومی HTTPS را تأیید
          کند. فقط بارکد انبار قابل چاپ است.
        </p>
      )}
      <label>
        نوع برچسب
        <select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value)
            setLabels([])
          }}
        >
          <option value="warehouse">انبار / UID بدون QR</option>
          <option
            value="customer"
            disabled={!configuration?.customer_qr_available}
          >
            مشتری / UID و QR دائمی
          </option>
        </select>
      </label>
      <fieldset>
        <legend>قطعات برای چاپ تکی یا انتخابی</legend>
        {eligible.map((i) => (
          <label className="check" key={i.id}>
            <input
              type="checkbox"
              aria-label={'چاپ ' + i.uid}
              checked={selected.includes(i.id)}
              onChange={(e) => {
                setLabels([])
                setSelected((s) =>
                  e.target.checked
                    ? [...s, i.id]
                    : s.filter((id) => id !== i.id),
                )
              }}
            />
            <span dir="ltr">{i.uid}</span>
          </label>
        ))}
      </fieldset>
      <div className="form-grid">
        <label>
          عرض برچسب (میلی‌متر)
          <input
            type="number"
            min={50}
            max={420}
            value={width}
            onChange={(e) =>
              setWidth(
                Math.min(420, Math.max(50, Number(e.target.value) || 50)),
              )
            }
          />
        </label>
        <label>
          ارتفاع برچسب (میلی‌متر)
          <input
            type="number"
            min={65}
            max={150}
            value={height}
            onChange={(e) =>
              setHeight(
                Math.min(150, Math.max(65, Number(e.target.value) || 65)),
              )
            }
          />
        </label>
      </div>
      <button
        disabled={busy || !selected.length || selected.length > 100}
        onClick={() => run(() => generate())}
      >
        ساخت برچسب انتخابی
      </button>{' '}
      <button
        disabled={busy || !eligible.length || eligible.length > 100}
        onClick={() => run(() => generate(true))}
      >
        ساخت برچسب کل پذیرش
      </button>
      {eligible.length > 100 && (
        <p>حداکثر ۱۰۰ قطعه در هر نوبت؛ قطعات را انتخاب کنید.</p>
      )}
      {!!labels.length && (
        <>
          {!fits && (
            <p role="alert">
              ابعاد کافی نیست؛ عرض بارکد و ارتفاع QR مشتری (حداقل ۸۰ میلی‌متر)
              را افزایش دهید. بارکد برای چاپ کوچک نمی‌شود.
            </p>
          )}
          <button disabled={!fits || busy} onClick={() => window.print()}>
            چاپ برچسب‌ها
          </button>
          <p>
            مقیاس چاپ ۱۰۰٪، حاشیه صفر، سرصفحه/پاصفحه خاموش. اندازه کاغذ با برچسب
            یکسان باشد؛ ابتدا خوانایی یک نمونه را با دستگاه واقعی بررسی کنید.
          </p>
          <style>{`@media print { @page { size: ${width}mm ${height}mm; margin: 0; } body * { visibility: hidden !important; } .uid-print-sheet,.uid-print-sheet * { visibility: visible !important; } .uid-print-sheet { position: absolute; top: 0; left: 0; margin: 0; padding: 0; } .uid-print-label { break-after: page; break-inside: avoid; margin: 0 !important; border: 0 !important; } }`}</style>
          <div className="uid-print-sheet" data-testid="uid-print-sheet">
            {labels.map((i) => (
              <article
                key={i.id}
                className="uid-print-label"
                style={{
                  width: width + 'mm',
                  height: height + 'mm',
                  boxSizing: 'border-box',
                  padding: '4mm',
                  background: 'white',
                  color: 'black',
                  border: '1px dashed #999',
                  margin: '8px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    fontSize: '10pt',
                    maxWidth: '100%',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {i.title}
                </div>
                {/* Local encoder output only; retain quiet zones and physical module width. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={i.barcode}
                  alt={'Code 128 ' + i.uid}
                  style={{
                    width: i.barcode_width_mm + 'mm',
                    height: '18mm',
                    maxWidth: 'none',
                  }}
                />
                <strong
                  dir="ltr"
                  style={{
                    fontSize: '10pt',
                    fontFamily: 'monospace',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {i.uid}
                </strong>
                {i.qr && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={i.qr}
                      alt={'QR دائمی ' + i.uid}
                      style={{ width: '28mm', height: '28mm' }}
                    />
                    <span
                      dir="ltr"
                      style={{ fontSize: '6pt', overflowWrap: 'anywhere' }}
                    >
                      {i.resolver_url}
                    </span>
                  </>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </details>
  )
}
