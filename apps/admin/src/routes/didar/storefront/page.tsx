import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { StorefrontAdmin } from "@didar-ui/storefront-admin";
export const config: RouteConfig = {
  label: "ویترین فروشگاه",
  group: "didar",
  permissions: ["didar.storefront:view"],
  rank: 9,
};
export const handle = {
  permissions: ["didar.storefront:view"],
  breadcrumb: () => "ویترین فروشگاه",
};
export default function Page() {
  return (
    <Workspace>
      <StorefrontAdmin />
    </Workspace>
  );
}
