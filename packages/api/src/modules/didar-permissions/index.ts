import { Module } from "@medusajs/framework/utils";
import {
  defineMercurPermissions,
  getPermission,
} from "@mercurjs/core/permissions/index";
import PermissionsService from "./service";
for (const key of [
  "didar.history",
  "didar.catalog",
  "didar.inventory",
  "didar.orders",
  "didar.finance",
  "didar.content",
  "didar.onboarding",
  "didar.storefront",
  "didar.sharing",
]) {
  if (!getPermission(key))
    defineMercurPermissions({
      key,
      group: "didar",
      surface: ["admin", "vendor"],
      rights: ["view", "edit", "manage"],
    });
}
export default Module("permissions", { service: PermissionsService });
