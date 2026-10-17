import { GET as nativeGET } from "@mercurjs/core/api/store/products/[id]/route";
import { hiddenNativeStoreProducts } from "../../../../didar/native-store-product-visibility";

export async function GET(req: any, res: any) {
  if ((await hiddenNativeStoreProducts()).includes(req.params.id))
    return res.status(404).json({ message: "NOT_FOUND", type: "not_found" });
  return nativeGET(req, res);
}
