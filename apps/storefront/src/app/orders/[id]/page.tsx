import { Orders } from '@/components/didar/customer'
export default async function Order({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <Orders id={id} />
}
