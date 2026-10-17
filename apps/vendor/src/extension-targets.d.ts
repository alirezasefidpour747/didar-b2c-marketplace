/// <reference types="@mercurjs/vendor/extension-targets" />

import "@mercurjs/dashboard-sdk";
declare module "@mercurjs/dashboard-sdk" {
  interface PermissionKeys {
    "didar.history": true;
    "didar.catalog": true;
    "didar.inventory": true;
    "didar.orders": true;
    "didar.finance": true;
    "didar.content": true;
    "didar.onboarding": true;
    "didar.storefront": true;
    "didar.sharing": true;
  }
}
