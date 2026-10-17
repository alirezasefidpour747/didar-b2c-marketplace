import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { SharingAdmin } from "@didar-ui/sharing";
export const config: RouteConfig = {
  label: "پیوند و صفحه منتخب",
  group: "didar",
  permissions: ["products:view"],
  rank: 10,
};
export const handle = {
  permissions: ["products:view"],
  breadcrumb: () => "پیوند و صفحه منتخب",
};
export default function Page() {
  return (
    <Workspace>
      <SharingAdmin />
    </Workspace>
  );
}
