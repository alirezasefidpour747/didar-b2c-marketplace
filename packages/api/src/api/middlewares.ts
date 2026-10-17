import { nativeProductReadGuard } from "../didar/native-product-visibility";
import { nativeErrorHandler } from "../didar/native-error-handler";
import {
  nativePermissionBoundary,
  nativeVendorBoundary,
} from "../didar/native-vendor-boundary";
import { defineMiddlewares, authenticate } from "@medusajs/medusa";

import { nativeVendorPrivacy } from "../didar/native-vendor-privacy";
import { nativeProductGuard } from "../didar/native-product-guard";

export default defineMiddlewares({
  errorHandler: nativeErrorHandler,
  routes: [
    { matcher: "/admin/*", middlewares: [nativePermissionBoundary] },
    { matcher: "/vendor/*", middlewares: [nativePermissionBoundary] },
    { matcher: "/vendor/*", middlewares: [nativeVendorBoundary] },
    {
      matcher:
        /^\/vendor\/(members\/me|sellers(?:\/[^/]+(?:\/members\/me)?)?)$/,
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
        nativeProductReadGuard,
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
