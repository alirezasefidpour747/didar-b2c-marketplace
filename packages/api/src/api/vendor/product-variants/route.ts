import { GET as nativeGET } from "@mercurjs/core/api/vendor/product-variants/route";
import { allowedNativeProducts } from "../../../didar/native-product-visibility";

/** The independent variant endpoint must apply the same canonical visibility
 * before the original native handler computes both rows and pagination. */
export async function GET(req: any, res: any) {
  const allowed = await allowedNativeProducts(req);
  req.filterableFields ??= {};
  req.filterableFields.$and = [
    ...(req.filterableFields.$and || []),
    { product_id: { $in: allowed } },
  ];
  return nativeGET(req, res);
}
