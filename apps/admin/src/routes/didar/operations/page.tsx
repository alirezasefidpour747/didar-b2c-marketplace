import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Operations } from "@didar-ui/operations";
export const config: RouteConfig = {
  label: "موجودی و UID / RFID",
  group: "didar",
  permissions: ["inventory_items:view"],
  rank: 3,
};
export const handle = {
  permissions: ["inventory_items:view"],
  breadcrumb: () => "موجودی و UID / RFID",
};
export default function Page() {
  return (
    <Workspace>
      <Operations />
    </Workspace>
  );
}
