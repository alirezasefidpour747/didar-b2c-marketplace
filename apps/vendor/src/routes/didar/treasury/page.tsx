import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Treasury } from "@didar-ui/treasury";
export const config: RouteConfig = {
  label: "خزانه و تسویه",
  group: "didar",
  permissions: ["didar.finance:view"],
};
export const handle = {
  breadcrumb: () => "خزانه و تسویه",
  permissions: ["didar.finance:view"],
};
export default function Page() {
  return (
    <Workspace>
      <Treasury />
    </Workspace>
  );
}
