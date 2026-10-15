export const PERMISSIONS = [
  "REQUEST_PRODUCT_CREATION",
  "CREATE_OWN_OFFER",
  "EDIT_OWN_OFFER",
  "EDIT_OWN_INVENTORY",
  "EDIT_OWN_MAKING_CHARGE",
  "CREATE_OWN_INTAKE",
  "PAIR_OWN_RFID",
  "UPDATE_OWN_FULFILLMENT",
] as const;
export const audit = (
  c: any,
  actor: string | null,
  action: string,
  details: any,
) =>
  c.query("INSERT INTO didar_audit(actor_id,action,details) VALUES($1,$2,$3)", [
    actor,
    action,
    JSON.stringify(details),
  ]);
/** Supplier row lock serializes writes with immediate permission revocation. */
export async function authorize(
  c: any,
  u: any,
  supplier: string,
  permission?: string,
) {
  const {
    rows: [s],
  } = await c.query("SELECT * FROM didar_supplier WHERE id=$1 FOR SHARE", [
    supplier,
  ]);
  if (!s) throw new Error("NOT_FOUND");
  if (u.role === "admin") return;
  if (
    u.role !== "supplier" ||
    u.supplier_id !== supplier ||
    !s.active ||
    s.status !== "approved"
  )
    throw new Error("FORBIDDEN");
  if (permission) {
    const {
      rows: [p],
    } = await c.query(
      "SELECT granted FROM didar_supplier_permission WHERE supplier_id=$1 AND permission=$2 FOR SHARE",
      [supplier, permission],
    );
    if (!p?.granted) throw new Error("FORBIDDEN");
  }
}
export async function permissions(c: any, u: any) {
  const { rows } = await c.query(
    "SELECT * FROM didar_supplier_permission WHERE $1='admin' OR supplier_id=$2",
    [u.role, u.supplier_id],
  );
  return rows;
}
