import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Tahesab } from "@didar-ui/tahesab";
export const config: RouteConfig = {
  label: "طاهساب آزمایشی",
  group: "didar",
  permissions: ["payments:view"],
  rank: 7,
};
export const handle = {
  permissions: ["payments:view"],
  breadcrumb: () => "طاهساب آزمایشی",
};
export default function Page() {
  return (
    <Workspace>
      <Tahesab />
    </Workspace>
  );
}
