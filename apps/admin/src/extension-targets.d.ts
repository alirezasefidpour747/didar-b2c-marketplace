/// <reference types="@mercurjs/admin/extension-targets" />

import "@mercurjs/dashboard-sdk";
declare module "@mercurjs/dashboard-sdk" {
  interface PermissionKeys {
    "didar.content": true;
    "didar.onboarding": true;
    "didar.storefront": true;
    "didar.sharing": true;
  }
}
