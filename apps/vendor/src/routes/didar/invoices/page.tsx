import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { useSearchParams } from "react-router-dom";
import { Workspace } from "../../../lib/didar";
import { InvoiceLookup } from "@didar-ui/invoice";
export const config: RouteConfig = {
  label: "اسناد مجاز · فقط خواندنی",
  group: "didar",
  permissions: ["didar.history:view"],
  rank: 21,
};
export const handle = {
  permissions: ["didar.history:view"],
  breadcrumb: () => "اسناد مجاز",
};
export default function Page() {
  const [search] = useSearchParams();
  return (
    <Workspace>
      <InvoiceLookup
        key={search.get("order_id") || ""}
        initialOrderId={search.get("order_id") || ""}
      />
    </Workspace>
  );
}
