import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Acceptance } from "@didar-ui/acceptance";
export const config: RouteConfig = {
  label: "کنترل پذیرش مالی",
  group: "didar",
  permissions: ["payments:view"],
};
export const handle = {
  breadcrumb: () => "کنترل پذیرش مالی",
  permissions: ["payments:view"],
};
export default function Page() {
  return (
    <Workspace>
      <Acceptance />
    </Workspace>
  );
}
