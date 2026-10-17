import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { PageBuilder } from "@didar-ui/content-editor";
export const config: RouteConfig = {
  label: "صفحه‌ساز بصری",
  group: "didar",
  permissions: ["didar.content:view"],
  rank: 11,
};
export const handle = {
  permissions: ["didar.content:view"],
  breadcrumb: () => "صفحه‌ساز بصری",
};
export default function Page() {
  return (
    <Workspace>
      <PageBuilder />
    </Workspace>
  );
}
