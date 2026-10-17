import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { SupplierHistory } from "@didar-ui/supplier-history";
export const config: RouteConfig = {
  label: "سوابق مجاز · فقط خواندنی",
  group: "didar",
  permissions: ["didar.history:view"],
  rank: 20,
};
export const handle = {
  permissions: ["didar.history:view"],
  breadcrumb: () => "سوابق مجاز",
};
export default function Page() {
  return (
    <Workspace>
      <SupplierHistory />
    </Workspace>
  );
}
