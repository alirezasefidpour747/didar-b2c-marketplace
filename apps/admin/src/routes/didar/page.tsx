import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../lib/didar";
import { Manage } from "@didar-ui/manage";
export const config: RouteConfig = {
  label: "محصول و عرضه دیدار",
  group: "didar",
  permissions: ["products:view"],
  rank: 0,
};
export const handle = {
  permissions: ["products:view"],
  breadcrumb: () => "محصول و عرضه دیدار",
};
export default function Page() {
  return (
    <Workspace>
      <Manage />
    </Workspace>
  );
}
