import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Ledger } from "@didar-ui/ledger";
export const config: RouteConfig = {
  label: "دفتر حسابداری",
  group: "didar",
  permissions: ["payments:view"],
  rank: 6,
};
export const handle = {
  permissions: ["payments:view"],
  breadcrumb: () => "دفتر حسابداری",
};
export default function Page() {
  return (
    <Workspace>
      <Ledger />
    </Workspace>
  );
}
