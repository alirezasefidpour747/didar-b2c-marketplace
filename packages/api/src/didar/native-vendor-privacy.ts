import { getPermissionCatalog } from "@mercurjs/core/permissions/index";
import { db } from "./db";
/** Native bootstrap/settings DTOs include bank/legal relations. Resolve each
 * seller independently: ownership of A must never reveal B's financial fields. */
export async function nativeVendorPrivacy(req: any, res: any, next: any) {
  const permissions = new Map<string, any>();
  const actor = req.auth_context;
  if (actor?.actor_id) {
    const memberships = (
      await db.query(
        "SELECT seller_id FROM seller_member WHERE member_id=$1 AND deleted_at IS NULL",
        [actor.actor_id],
      )
    ).rows;
    const resolver = req.scope.resolve("permissions"),
      catalog = getPermissionCatalog();
    for (const { seller_id } of memberships)
      permissions.set(
        seller_id,
        await resolver.resolvePermissions(
          {
            actor_type: "member",
            actor_id: actor.actor_id,
            surface: "vendor",
            seller_id,
          },
          catalog,
        ),
      );
  }
  const clean = (seller: any) => {
    if (!seller || typeof seller !== "object") return seller;
    const rights = permissions.get(seller.id) || {},
      copy = { ...seller };
    if (!rights.payout_accounts) delete copy.payment_details;
    if (!["edit", "manage"].includes(rights.store))
      delete copy.professional_details;
    return copy;
  };
  const cleanMember = (member: any) =>
    member ? { ...member, seller: clean(member.seller) } : member;
  const json = res.json.bind(res);
  res.json = (value: any) => {
    if (value?.seller_member)
      value = { ...value, seller_member: cleanMember(value.seller_member) };
    if (value?.seller) value = { ...value, seller: clean(value.seller) };
    if (Array.isArray(value?.seller_members))
      value = {
        ...value,
        seller_members: value.seller_members.map(cleanMember),
      };
    return json(value);
  };
  next();
}
