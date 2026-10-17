'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useDidar } from './store'
import { safeNativeReturn } from '../../../../../packages/didar-ui/src/native-handoff'
export function LegacyWorkspace({
  children,
  operatorOnly = false,
}: {
  children: ReactNode
  operatorOnly?: boolean
}) {
  const { user, ready, api } = useDidar()
  const path = usePathname(),
    search = useSearchParams().toString()
  const [checked, setChecked] = useState('')
  useEffect(() => {
    if (!ready || !user || (operatorOnly && user.role === 'customer')) return
    let active = true
    const feature =
      path === '/account/wallet'
        ? '/didar/wallet'
        : path.startsWith('/orders')
          ? '/didar' + path
          : path.replace(/^\/manage(?:\/(?:admin|supplier))?(?=\/|$)/, '/didar')
    const candidate = feature + (search ? '?' + search : '')
    const target = safeNativeReturn(candidate)
    api('workspace')
      .then((state: any) => {
        if (!active) return
        if (state.ready && target) {
          const base = state.surface === 'admin' ? '/dashboard' : '/seller'
          window.location.replace(
            state.panel_origin +
              base +
              '/handoff?to=' +
              encodeURIComponent(target),
          )
        } else setChecked(user.id)
      })
      .catch(() => {
        if (active) setChecked(user.id)
      })
    return () => {
      active = false
    }
  }, [ready, user?.id, user?.role, api, path, search, operatorOnly])
  if (
    ready &&
    user &&
    !(operatorOnly && user.role === 'customer') &&
    checked !== user.id
  )
    return <p role="status">در حال بررسی فضای کاری بومی…</p>
  return <>{children}</>
}
