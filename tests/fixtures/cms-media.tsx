import React, { useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { ImageAsset } from "../../packages/didar-ui/src/catalog";
import { ContentRenderer } from "../../packages/didar-ui/src/content-page";
import { DidarContext, type Store } from "../../packages/didar-ui/src/store";

type Settings = {
  src: string;
  srcSet?: string;
  sizes?: string;
  credential?: string;
  cms?: boolean;
};
function App({ initial }: { initial: Settings }) {
  const [settings, update] = useState(initial);
  if (typeof window !== "undefined") (window as any).updateMedia = update;
  const context = {
    products: [],
    categories: [],
    collections: [],
    scopedHref: (href: string) => href,
    ...(settings.credential
      ? {
          mediaHeaders: () => ({ authorization: settings.credential! }),
        }
      : {}),
  } as unknown as Store;
  const data = {
    page: { id: "fixture" },
    version: { id: "fixture" },
    assets: {
      image: {
        id: "image",
        url: settings.src,
        width: 40,
        height: 30,
        alt: "CMS image",
      },
    },
    blocks: [
      {
        id: "full",
        type: "FULL_BLEED_MEDIA",
        theme: "LIGHT",
        title: "CMS fixture",
        media: { asset_id: "image", alt: "CMS image" },
      },
    ],
  };
  return (
    <DidarContext.Provider value={context}>
      {settings.cms ? (
        <ContentRenderer data={data} />
      ) : (
        <ImageAsset {...settings} alt="CMS image" eager />
      )}
    </DidarContext.Provider>
  );
}
export function document(initial: Settings) {
  const settings = JSON.stringify(initial).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root">${renderToString(<App initial={initial} />)}</div><script>window.initialMedia=${settings};window.recoverableErrors=[];window.revoked=[];const revoke=URL.revokeObjectURL;URL.revokeObjectURL=(url)=>{window.revoked.push(url);revoke.call(URL,url)};</script><script src="/client.js"></script></body></html>`;
}
if (typeof window !== "undefined") {
  (window as any).startHydration = () =>
    hydrateRoot(
      documentGlobal(),
      <App initial={(window as any).initialMedia} />,
      {
        onRecoverableError: (error) =>
          (window as any).recoverableErrors.push(String(error)),
      },
    );
}
function documentGlobal() {
  return globalThis.document.getElementById("root")!;
}
