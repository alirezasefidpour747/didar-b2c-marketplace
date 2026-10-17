import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Acceptance } from "@didar-ui/acceptance";
export const config: RouteConfig = {
  label: "کنترل پذیرش مالی",
  group: "didar",
  permissions: ["payments:view"],
  rank: 8,
};
export const handle = {
  permissions: ["payments:view"],
  breadcrumb: () => "کنترل پذیرش مالی",
};
export default function Page() {
  return (
    <Workspace>
      <Acceptance />
    </Workspace>
  );
}
