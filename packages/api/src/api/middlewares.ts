import { defineMiddlewares, authenticate } from "@medusajs/medusa";

import { nativeVendorPrivacy } from "../didar/native-vendor-privacy";
import { nativeProductGuard } from "../didar/native-product-guard";

export default defineMiddlewares({
  routes: [
    {
      matcher: /^\/vendor\/(members\/me|sellers(?:\/[^/]+(?:\/members\/me)?)?)$/,
      method: ["GET", "POST"],
      middlewares: [
        authenticate("member", ["session", "bearer"], {
          allowUnregistered: true,
        }),
        nativeVendorPrivacy,
      ],
    },
    {
      matcher: /^\/admin\/products\/.+/,
      middlewares: [
        authenticate("user", ["session", "bearer"]),
        nativeProductGuard,
      ],
    },
    {
      matcher: /^\/vendor\/products(?:\/.*)?$/,
      middlewares: [
        authenticate("member", ["session", "bearer"]),
        nativeProductGuard,
      ],
    },
    {
      matcher: "/admin/didar/*",
      middlewares: [authenticate("user", ["session", "bearer"])],
      bodyParser: { sizeLimit: "29mb" },
    },
    {
      matcher: "/vendor/didar/*",
      middlewares: [authenticate("member", ["session", "bearer"])],
      bodyParser: { sizeLimit: "29mb" },
    },
    {
      matcher: "/didar/content-media",
      bodyParser: { sizeLimit: "29mb" },
      middlewares: [],
    },
    {
      matcher: "/didar/media",
      bodyParser: { sizeLimit: "12mb" },
      middlewares: [],
    },
    {
      matcher: "/didar/*",
      bodyParser: { sizeLimit: "1200kb" },
      middlewares: [
        (_req, res, next) => {
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.setHeader("Referrer-Policy", "same-origin");
          res.setHeader("Cache-Control", "no-store");
          next();
        },
      ],
    },
  ],
});
