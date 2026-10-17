import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Workspace } from "../../../lib/didar";
import { Wallet } from "@didar-ui/wallet";
export const config: RouteConfig = {
  label: "کیف پول آزمایشی",
  group: "didar",
  permissions: ["payments:view"],
  rank: 10,
};
export default function Page() {
  return (
    <Workspace>
      <Wallet />
    </Workspace>
  );
}

export const handle = { permissions: ["payments:view"] };
