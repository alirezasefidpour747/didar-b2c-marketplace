import { GET as nativeGET } from "@mercurjs/core/api/store/products/route";
import { hiddenNativeStoreProducts } from "../../../didar/native-store-product-visibility";

export async function GET(req: any, res: any) {
  const hidden = await hiddenNativeStoreProducts();
  req.filterableFields ??= {};
  req.filterableFields.$and = [
    ...(req.filterableFields.$and || []),
    { id: { $nin: hidden } },
  ];
  return nativeGET(req, res);
}
