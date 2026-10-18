import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Agency } from "@didar-ui/agency";
export const config: RouteConfig = {
  label: "مجوز فروش و فاکتور نیابتی",
  group: "didar",
  permissions: ["payments:view"],
  rank: 5,
};
export const handle = {
  permissions: ["payments:view"],
  breadcrumb: () => "مجوز فروش و فاکتور نیابتی",
};
export default function Page() {
  return (
    <Workspace>
      <Agency />
    </Workspace>
  );
}
