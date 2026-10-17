import { useEffect, useState } from "react";
import { useDidar } from "./store";
import { Link } from "react-router-dom";
import { Text } from "@medusajs/ui";
export function NativeGoldRecord({ nativeId }: { nativeId?: string }) {
  const { api, run } = useDidar(),
    [p, setProduct] = useState<any>(null);
  useEffect(() => {
    if (nativeId)
      run(async () =>
        setProduct(
          (
            await api(
              "product-record?native_id=" + encodeURIComponent(nativeId),
            )
          ).product,
        ),
      );
  }, [api, nativeId]);
  return p ? (
    <div>
      <Text>
        {p.title} · عیار {p.purity} ·{" "}
        {p.published && p.approved ? "منتشرشده" : "در انتظار انتشار"}
      </Text>
      <Text>{p.public_key}</Text>
      <Link to={"/didar?product_id=" + encodeURIComponent(p.id)}>
        پرونده معتبر محصول، طبقه‌بندی و عرضه ←
      </Link>
    </div>
  ) : (
    <Text>این محصول هنوز پرونده طلای متصل و مجاز ندارد.</Text>
  );
}
