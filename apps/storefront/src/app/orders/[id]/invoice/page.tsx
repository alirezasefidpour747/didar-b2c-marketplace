import { Invoice } from '../../../../../../../packages/didar-ui/src/invoice'
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <Invoice orderId={id} />
}
