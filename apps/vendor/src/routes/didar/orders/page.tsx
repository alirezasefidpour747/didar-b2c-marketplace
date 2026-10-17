import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Orders } from "@didar-ui/orders";
export const config: RouteConfig = {
  label: "سفارش و ارسال طلای دیدار",
  group: "didar",
  permissions: ["orders:view"],
  rank: 4,
};
export const handle = {
  permissions: ["orders:view"],
  breadcrumb: () => "سفارش‌های دیدار",
};
export default function Page() {
  return (
    <Workspace>
      <Orders />
    </Workspace>
  );
}
