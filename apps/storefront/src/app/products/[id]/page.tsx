import { ProductDetail } from '@/components/didar/catalog'
export default async function Product({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ProductDetail id={id} />
}
