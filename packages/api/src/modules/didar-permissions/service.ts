import type {
  IPermissionResolver,
  PermissionActor,
  PermissionDefinition,
  PermissionMap,
} from "@mercurjs/types";
import { db } from "../../didar/db";
const rank: Record<string, number> = { view: 1, edit: 2, manage: 3 };
export default class PermissionsService implements IPermissionResolver {
  async resolvePermissions(
    actor: PermissionActor,
    catalog: PermissionDefinition[],
  ): Promise<PermissionMap> {
    const full = () =>
      Object.fromEntries(
        catalog
          .filter((p) => p.surface.includes(actor.surface))
          .map((p) => [
            p.key,
            p.rights.reduce((a, b) => (rank[a] > rank[b] ? a : b)),
          ]),
      );
    const native =
      actor.actor_type === "user"
        ? (
            await db.query(
              'SELECT id FROM "user" WHERE id=$1 AND deleted_at IS NULL',
              [actor.actor_id],
            )
          ).rows[0]
        : (
            await db.query(
              "SELECT sm.is_owner,sm.role_id,s.status native_status FROM seller_member sm JOIN member m ON m.id=sm.member_id JOIN seller s ON s.id=sm.seller_id WHERE sm.member_id=$1 AND sm.seller_id=$2 AND sm.deleted_at IS NULL AND m.deleted_at IS NULL AND s.deleted_at IS NULL",
              [actor.actor_id, actor.seller_id || ""],
            )
          ).rows[0];
    if (!native) return {};
    let link: any, policy: any;
    try {
      link = (
        await db.query(
          "SELECT n.active,u.id,u.role,u.supplier_id FROM didar_native_actor n JOIN didar_user u ON u.id=n.user_id WHERE n.actor_type=$1 AND n.actor_id=$2",
          [actor.actor_type, actor.actor_id],
        )
      ).rows[0];
      policy = (
        await db.query(
          "SELECT rights,active FROM didar_native_acl WHERE actor_type=$1 AND actor_id=$2",
          [actor.actor_type, actor.actor_id],
        )
      ).rows[0];
    } catch (e: any) {
      // Do not fall back to broad privileges during a partial upgrade.
      if (e.code === "42P01") throw Error("NATIVE_ACL_MIGRATION_REQUIRED");
      throw e;
    }
    if (link && !link.active) return {};
    let allowed: PermissionMap = {};
    if (actor.actor_type === "user") {
      if (link?.role === "admin") allowed = full();
      else if (
        link &&
        (
          await db.query(
            "SELECT 1 FROM didar_content_operator WHERE user_id=$1 AND active",
            [link.id],
          )
        ).rowCount
      )
        allowed = { "didar.content": "edit" };
    } else {
      // Native membership/ownership proves bootstrap context, not commerce authority.
      allowed = { store: "view" };
      if (link) {
        const scope = (
          await db.query(
            "SELECT s.id,s.active,s.status FROM didar_native_seller n JOIN didar_supplier s ON s.id=n.supplier_id WHERE n.seller_id=$1 AND n.active",
            [actor.seller_id],
          )
        ).rows[0];
        const owner =
          scope && link.role === "supplier" && link.supplier_id === scope.id;
        const eligible =
          scope?.active &&
          scope.status === "approved" &&
          native.native_status === "open";
        if (owner) {
          // Historical reads are scoped by canonical services; no native bank or customer access.
          allowed["didar.history"] = "view";
          allowed["didar.onboarding"] = "view";
          if (eligible) {
            Object.assign(allowed, {
              products: "view",
              offers: "view",
              orders: "view",
              inventory_items: "view",
              "didar.catalog": "view",
              "didar.inventory": "view",
              "didar.orders": "view",
              "didar.finance": "view",
              // Existing canonical supplier ownership permits these non-gold merchant actions.
              "didar.storefront": "edit",
              "didar.sharing": "edit",
              "didar.content": "edit",
              "didar.onboarding": "edit",
            });
            const grants = new Set(
              (
                await db.query(
                  "SELECT permission FROM didar_supplier_permission WHERE supplier_id=$1 AND granted",
                  [scope.id],
                )
              ).rows.map((r: any) => r.permission),
            );
            if (
              [
                "REQUEST_PRODUCT_CREATION",
                "CREATE_OWN_OFFER",
                "EDIT_OWN_OFFER",
                "EDIT_OWN_INVENTORY",
                "EDIT_OWN_MAKING_CHARGE",
                "SUGGEST_OWN_CLASSIFICATION",
              ].some((p) => grants.has(p))
            )
              allowed["didar.catalog"] = "edit";
            if (
              ["CREATE_OWN_INTAKE", "EDIT_OWN_INVENTORY", "PAIR_OWN_RFID"].some(
                (p) => grants.has(p),
              )
            )
              allowed["didar.inventory"] = "edit";
            if (grants.has("UPDATE_OWN_FULFILLMENT"))
              allowed["didar.orders"] = "edit";
          }
        } else if (link.role === "customer" && eligible) {
          const rows = (
            await db.query(
              "SELECT permission FROM didar_merchant_member WHERE user_id=$1 AND supplier_id=$2 AND active",
              [link.id, scope.id],
            )
          ).rows;
          const keys: Record<string, string> = {
            STOREFRONT: "didar.storefront",
            SHARE: "didar.sharing",
            ONBOARDING: "didar.onboarding",
            CONTENT_EDIT: "didar.content",
            CONTENT_PUBLISH: "didar.content",
          };
          for (const { permission } of rows)
            if (keys[permission]) allowed[keys[permission]] = "edit";
        }
      }
    }
    if (policy) {
      if (!policy.active) return {};
      // Explicit policy only narrows rights derived from native role + existing Didar grants.
      allowed = Object.fromEntries(
        Object.entries(allowed)
          .filter(([key, right]) => rank[policy.rights?.[key]])
          .map(([key, right]) => [
            key,
            rank[right] < rank[policy.rights[key]] ? right : policy.rights[key],
          ]),
      );
    }
    return Object.fromEntries(
      Object.entries(allowed).filter(([key]) =>
        catalog.some((p) => p.key === key && p.surface.includes(actor.surface)),
      ),
    );
  }
}
