import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../lib/didar";
import { NativeGoldRecord } from "@didar-ui/native-product-record";
import { Container, Heading, Text } from "@medusajs/ui";
import { Link } from "react-router-dom";
export const config = defineWidgetConfig({
  zone: ["product.list.before", "product.detail.main.before"],
});
export default function DidarProduct({ data }: { data?: { id?: string } }) {
  if (data?.id)
    return (
      <Workspace>
        <NativeGoldRecord nativeId={data.id} />
      </Workspace>
    );
  return (
    <Container dir="rtl">
      <Heading level="h2">محصول مرجع دیدار</Heading>
      <Text>
        وزن دقیق، موجودی UID، طبقه‌بندی و قیمت طلا از سرویس معتبر دیدار مدیریت
        می‌شود.
      </Text>
      <Link to="/didar">محصول و عرضه دیدار ←</Link>
    </Container>
  );
}
