import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { PageBuilder } from "@didar-ui/content-editor";
export const config: RouteConfig = {
  label: "صفحه‌ساز بصری",
  group: "didar",
  permissions: ["products:view"],
  rank: 8,
};
export const handle = {
  permissions: ["products:view"],
  breadcrumb: () => "صفحه‌ساز بصری",
};
export default function Page() {
  return (
    <Workspace>
      <PageBuilder />
    </Workspace>
  );
}
