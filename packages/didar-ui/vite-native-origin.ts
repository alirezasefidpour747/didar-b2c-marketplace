import type { Plugin } from "vite";
/** Native client 2.3.7 requires an absolute URL. Resolve same-origin in the browser,
 * for both SDK virtual config and host extensions, without patching Mercur packages. */
export function sameOriginBackend(enabled: boolean): Plugin {
  return {
    name: "didar-native-same-origin",
    enforce: "post",
    config() {
      if (enabled)
        return { define: { __BACKEND_URL__: "window.location.origin" } };
    },
    transform(code, id) {
      if (enabled && id === "\0virtual:mercur/config")
        return code.replace(
          /"backendUrl"\s*:\s*""/,
          '"backendUrl":window.location.origin',
        );
    },
  };
}
