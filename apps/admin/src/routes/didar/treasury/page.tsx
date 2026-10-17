import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Treasury } from "@didar-ui/treasury";
export const config: RouteConfig = {
  label: "خزانه و تسویه",
  group: "didar",
  permissions: ["payments:view"],
  rank: 5,
};
export const handle = {
  permissions: ["payments:view"],
  breadcrumb: () => "خزانه و تسویه",
};
export default function Page() {
  return (
    <Workspace>
      <Treasury />
    </Workspace>
  );
}
