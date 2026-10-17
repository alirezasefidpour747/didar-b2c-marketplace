import { getAuthHeaders } from "@mercurjs/admin";
import { NativeWorkspace } from "@didar-ui/native-workspace";
import type { ReactNode } from "react";
declare const __BACKEND_URL__: string;
export function Workspace({ children }: { children: ReactNode }) {
  return (
    <NativeWorkspace
      surface="admin"
      backend={__BACKEND_URL__}
      headers={getAuthHeaders}
    >
      {children}
    </NativeWorkspace>
  );
}
