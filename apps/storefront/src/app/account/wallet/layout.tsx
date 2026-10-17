import { Suspense, type ReactNode } from 'react'
import { LegacyWorkspace } from '@/components/didar/legacy-workspace'
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p>در حال دریافت حساب…</p>}>
      <LegacyWorkspace operatorOnly>{children}</LegacyWorkspace>
    </Suspense>
  )
}
