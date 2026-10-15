import { db } from "../../../didar/db";
import { sessionUser } from "../../../didar/auth";
export async function GET(req: any, res: any) {
  const id = req.query.id;
  if (typeof id !== "string" || id.length > 100)
    return res.status(400).json({ message: "INVALID_IMAGE" });
  const {
    rows: [image],
  } = await db.query(
    "SELECT i.data,i.mime_type,p.active,p.published FROM didar_product_image i JOIN didar_product p ON p.id=i.product_id WHERE i.id=$1",
    [id],
  );
  if (!image) return res.status(404).json({ message: "NOT_FOUND" });
  if (!image.active || !image.published) {
    const u = await sessionUser(req);
    if (u?.role !== "admin")
      return res.status(404).json({ message: "NOT_FOUND" });
  }
  res.setHeader("Content-Type", image.mime_type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "no-store");
  return res.send(image.data);
}
