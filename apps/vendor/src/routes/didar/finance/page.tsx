import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Finance } from "@didar-ui/finance";
export const config: RouteConfig = {
  label: "قرارداد و حساب طلا",
  group: "didar",
  permissions: ["didar.finance:view"],
  rank: 4,
};
export const handle = {
  permissions: ["didar.finance:view"],
  breadcrumb: () => "قرارداد و حساب طلا",
};
export default function Page() {
  return (
    <Workspace>
      <Finance />
    </Workspace>
  );
}
