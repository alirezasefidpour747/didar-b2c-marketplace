import { PagePreview } from '@/components/didar/content-editor'
export const metadata = {
  title: 'پیش‌نمایش خصوصی دیدار',
  robots: { index: false, follow: false },
}
export default async function Preview({
  params,
}: {
  params: Promise<{ version: string }>
}) {
  return <PagePreview version={(await params).version} />
}
