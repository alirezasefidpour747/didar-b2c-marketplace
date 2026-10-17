import { getAuthHeaders } from "@mercurjs/vendor";
import { NativeWorkspace } from "@didar-ui/native-workspace";
import type { ReactNode } from "react";
declare const __BACKEND_URL__: string;
export function Workspace({ children }: { children: ReactNode }) {
  return (
    <NativeWorkspace
      surface="vendor"
      backend={__BACKEND_URL__}
      headers={getAuthHeaders}
    >
      {children}
    </NativeWorkspace>
  );
}
