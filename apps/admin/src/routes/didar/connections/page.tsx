import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { NativeSellerLinks } from "@didar-ui/native-seller-links";
export const config: RouteConfig = {
  label: "اتصال فروشگاه بومی",
  group: "didar",
  permissions: ["sellers:view"],
  rank: 0,
};
export const handle = {
  permissions: ["sellers:view"],
  breadcrumb: () => "اتصال فروشگاه بومی",
};
export default function Page() {
  return (
    <Workspace>
      <NativeSellerLinks />
    </Workspace>
  );
}
