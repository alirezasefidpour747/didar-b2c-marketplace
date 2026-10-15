import { defineMiddlewares } from "@medusajs/medusa";

export default defineMiddlewares({
  routes: [
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
