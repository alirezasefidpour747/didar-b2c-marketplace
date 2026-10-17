import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Onboarding } from "@didar-ui/onboarding";
export const config: RouteConfig = {
  label: "پذیرش محصول",
  group: "didar",
  permissions: ["didar.onboarding:view"],
  rank: 1,
};
export const handle = {
  permissions: ["didar.onboarding:view"],
  breadcrumb: () => "پذیرش محصول",
};
export default function Page() {
  return (
    <Workspace>
      <Onboarding />
    </Workspace>
  );
}
