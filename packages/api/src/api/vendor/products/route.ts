import { GET as nativeGET } from "@mercurjs/core/api/vendor/products/route";
import { allowedNativeProducts } from "../../../didar/native-product-visibility";
/** Apply after native query validation, before its original list workflow so
 * filters, count and pagination all describe the same authorized catalogue. */
export async function GET(req: any, res: any) {
  const allowed = await allowedNativeProducts(req);
  req.filterableFields ??= {};
  req.filterableFields.$and = [
    ...(req.filterableFields.$and || []),
    { id: { $in: allowed } },
  ];
  return nativeGET(req, res);
}
