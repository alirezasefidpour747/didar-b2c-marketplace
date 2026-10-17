import { Workspace } from "../../../lib/didar";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
export const config: RouteConfig = {
  label: "اتصال حساب دیدار",
  group: "didar",
  rank: -1,
};
export const handle = { breadcrumb: () => "اتصال حساب دیدار" };
export default function Page() {
  return (
    <Workspace>
      <p>حساب موجود متصل است. امکانات مجاز از فهرست فضای کاری در دسترس است.</p>
    </Workspace>
  );
}
