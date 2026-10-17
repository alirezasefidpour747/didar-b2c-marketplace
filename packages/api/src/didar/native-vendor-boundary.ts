/** Defense in depth for unsupported generic writes: none is a second writer of
 * DIDAR gold commerce. Mercur's resolver still mediates each supported read.
 * Bootstrap endpoints retain native authentication/selection/validation. */
export function nativeVendorBoundary(req: any, res: any, next: any) {
  const path = String(req.originalUrl || req.path).split("?")[0];
  if (/^\/vendor\/(didar|products)\//.test(path) || path === "/vendor/products")
    return next();
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (
    [
      "/vendor/sellers",
      "/vendor/sellers/select",
      "/vendor/members/me",
      "/vendor/members/invites/accept",
    ].includes(path)
  )
    return next();
  return res.status(403).json({ message: "FORBIDDEN", type: "not_allowed" });
}

/** Mercur deliberately supports a permissions-disabled fallback. DIDAR commerce
 * must fail closed instead; only native public/identity bootstrap routes may
 * run without a resolved catalog. This does not grant or reimplement rights. */
export function nativePermissionBoundary(req: any, res: any, next: any) {
  const path = String(req.originalUrl || req.path).split("?")[0];
  if (
    [
      "/vendor/sellers",
      "/vendor/sellers/select",
      "/vendor/stores",
      "/vendor/feature-flags",
      "/vendor/members/invites/accept",
      "/admin/feature-flags",
    ].includes(path)
  )
    return next();
  if (req.permissions_enforced !== true)
    return res.status(403).json({ message: "FORBIDDEN", type: "not_allowed" });
  return next();
}
