import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { MerchantPricing } from "@didar-ui/merchant-pricing";
export const config: RouteConfig = {
  label: "پروفایل قیمت طلا",
  group: "didar",
  permissions: ["products:view"],
  rank: 2,
};
export const handle = {
  permissions: ["products:view"],
  breadcrumb: () => "پروفایل قیمت طلا",
};
export default function Page() {
  return (
    <Workspace>
      <MerchantPricing />
    </Workspace>
  );
}
