import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Ledger } from "@didar-ui/ledger";
export const config: RouteConfig = {
  label: "دفتر حسابداری",
  group: "didar",
  permissions: ["didar.finance:view"],
};
export const handle = {
  breadcrumb: () => "دفتر حسابداری",
  permissions: ["didar.finance:view"],
};
export default function Page() {
  return (
    <Workspace>
      <Ledger />
    </Workspace>
  );
}
