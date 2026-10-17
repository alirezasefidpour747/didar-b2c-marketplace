import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Tahesab } from "@didar-ui/tahesab";
export const config: RouteConfig = {
  label: "طاهساب آزمایشی",
  group: "didar",
  permissions: ["didar.finance:view"],
  rank: 5,
};
export const handle = {
  permissions: ["didar.finance:view"],
  breadcrumb: () => "طاهساب آزمایشی",
};
export default function Page() {
  return (
    <Workspace>
      <Tahesab />
    </Workspace>
  );
}
