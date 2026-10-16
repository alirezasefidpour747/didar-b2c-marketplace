import { RequireUser } from '@/components/didar/store'
import { MerchantPricing } from '@/components/didar/merchant-pricing'
export default function Pricing() {
  return (
    <RequireUser roles={['admin', 'supplier']}>
      <MerchantPricing />
    </RequireUser>
  )
}
