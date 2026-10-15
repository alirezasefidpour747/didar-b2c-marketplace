Implement Phase 1 physical intake and item-level sales in the existing Mercur marketplace. A supplier invoice now contains grouped lines and individually measured pieces with permanent UIDs, optional unique EPC bindings, exact reconciliation and admin verification/posting. Checkout reserves concrete items and sandbox payment sells or releases those same UIDs once; fulfillment, physical return/quarantine/restock and RFID counting preserve the item history. Legacy aggregate stock and historical order snapshots stay separate and unchanged.

Admins retain shared catalog/category/image/attribute/publication and supplier management, and operate on any supplier's behalf with audit. Suppliers read their own records by default; eight independent backend permissions enable specified writes and support immediate revocation. Count reports redact competitor identifiers. Gold-First pricing uses additive making/distribution/retail components, versioned policies and actual IRR VAT; the mandatory 100 g example yields 124.2 g-equivalent monetary value.

Verified locally against compiled production artifacts and the four-service Docker Compose stack:

- 52 backend/integration/migration tests, 507 assertions, passed, including 19-item reconciliation, global UID/EPC constraints, permissions/isolation, concurrent exact-item reservation, payment replay/expiry, physical returns and legacy preservation.
- All 8 Playwright checks passed against the Docker API/storefront and also compiled API/Next standalone, covering existing marketplace regressions and the full intake → physical UID sale → fulfillment → remaining-stock counting journey.
- Official route codegen, both native panels, API and Next builds passed; native HTTP health and 23 local/mocked deployment guards passed.

RFID/HID text input and mock mode are implemented; physical RF hardware, encoding and a real scale remain unverified. No Oracle or production deployment, financial obligations, procurement, wallets, GL or settlement is included. Keep this implementation unmerged for review. PR #1 was already merged as the specification-only change; this description is prepared for the implementation review.
