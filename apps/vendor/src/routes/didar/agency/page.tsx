import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Agency } from "@didar-ui/agency";
export const config: RouteConfig = {
  label: "مجوز و فاکتور فروش · فقط خواندنی",
  group: "didar",
  permissions: ["didar.finance:view"],
  rank: 5,
};
export const handle = {
  permissions: ["didar.finance:view"],
  breadcrumb: () => "مجوز و فاکتور فروش",
};
export default function Page() {
  return (
    <Workspace>
      <Agency />
    </Workspace>
  );
}
