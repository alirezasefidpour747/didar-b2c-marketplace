import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../lib/didar";
import { Manage } from "@didar-ui/manage";
import { PermissionGuard } from "@mercurjs/dashboard-shared";
export const config: RouteConfig = {
  label: "محصول و عرضه دیدار",
  group: "didar",
  permissions: ["products:view"],
  rank: 0,
};
// Child routes have independent native permissions; do not impose product
// access on account connection, content operators or merchant staff. The
// product screen itself requires the canonical admin/supplier role and API right.
export const handle = {
  breadcrumb: () => "فضای کاری دیدار",
};
export default function Page() {
  return (
    <Workspace>
      <PermissionGuard
        permission="products:view"
        fallback={<p>امکانات مجاز از فهرست فضای کاری در دسترس است.</p>}
      >
        <Manage />
      </PermissionGuard>
    </Workspace>
  );
}
