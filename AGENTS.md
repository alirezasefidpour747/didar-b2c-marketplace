# Mercur Marketplace Project

**This is a Mercur marketplace project — an open-source AI-native multi-vendor marketplace built on MedusaJS v2.**

## Standing owner policy: architecture, integration and staging delivery

Read and apply [DIDAR Operating Guidance](docs/OPERATING_GUIDANCE.md) before implementation, integration, packaging, release handoffs or staging work. This is persistent, version-independent owner policy; preserve the native architecture directive below and resolve task-specific authorization separately.

Development owns accepted implementation, integration and reproducible packages/runbooks. “03 — DIDAR Deployment & Runtime QA” owns guiding installation and runtime verification on the existing hosted staging server; direct server access or modification requires explicit assignment. Hosted staging must work over public domain HTTPS without owner-side servers, tunnels, VPNs or proxies. Use the reviewed authentication/trust model, preserve data, and report package, installation, Internet verification and production readiness separately.

Executable technical instructions are in English; owner-facing explanations and handoffs are in Persian unless requested otherwise. The full policy defines provenance, branch lifecycle, recovery, verification and authority boundaries; it is not blanket authorization for future work.

## Owner directive: develop the NATIVE Mercur panels (2026-10-17)

**MANDATORY BEFORE EVERY NEW FEATURE:** Read [`docs/MERCUR_NATIVE_PANEL_ARCHITECTURE.md`](docs/MERCUR_NATIVE_PANEL_ARCHITECTURE.md). DIDAR is a customized **Mercur/Medusa** marketplace. DO NOT replace its Admin/Vendor panels with a parallel Next.js dashboard. Extend **`apps/admin`** (`/dashboard`), **`apps/vendor`** (`/seller`) via the Mercur Dashboard SDK, and reserve **`apps/storefront`** for B2C public and customer experience. Existing Next `/manage` pages are legacy transition surfaces, NOT the target Admin or Vendor UI. Build parity and safe, role-aware cutover; never delete data or rewrite existing DIDAR Product Master, Merchant Offers, exact UID/Gold-First pricing/ledger. Native Medusa/Mercur product, seller and order conventions are to be reused **when business semantics match**, with tested links/adapters for Didar's physical UID and gold-specific financial history. All technical deliverables require real native-panel browser journeys plus backend tests. Owner Mac testing remains only after all features.

## Read the docs first

Before any non-trivial change, read the **bundled documentation** — it ships as a dependency, so it is offline and version-matched to this project's packages:

1. Index: `node_modules/@mercurjs/docs/llms.txt`
2. Full pages: `node_modules/@mercurjs/docs/content/**/*.mdx`

It covers the domain model (sellers, products, offers, attributes, commissions, payouts, order groups), the CLI, the typed API client, the dashboard SDK, and module references. Don't guess at an API or data model the docs already describe.

### Project Structure

```
├── packages/api/         # Backend API — modules, workflows, links, subscribers
├── apps/admin/           # Admin dashboard — operator panel
├── apps/vendor/          # Vendor portal — seller dashboard
└── blocks.json           # Block configuration and registry aliases
```

## Documentation

- **Bundled docs (read first)**: `node_modules/@mercurjs/docs/llms.txt` → `content/**/*.mdx`
- **Online docs**: https://docs.mercurjs.com
- **MCP Server**: https://docs.mercurjs.com/mcp — connect your AI agent for documentation search
- **llms.txt (online)**: https://docs.mercurjs.com/llms.txt

## Configuration Files

- `blocks.json` — block configuration and registry path aliases
- `packages/api/medusa-config.ts` — MedusaJS configuration
- `apps/admin/vite.config.ts` — admin dashboard build config
- `apps/vendor/vite.config.ts` — vendor portal build config

## Getting Started

```bash
bun run dev
```

This starts:

- Backend API at `http://localhost:9000`
- Admin Panel at `http://localhost:9000/dashboard`
- Vendor Panel at `http://localhost:9000/seller`
