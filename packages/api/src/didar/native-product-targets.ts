/** Concrete targets accepted by the pinned Medusa 2.21.2 product routes.
 * A URL parent is not proof of ownership: several native workflows mutate child
 * IDs directly. Collect before any workflow, including every member of a batch.
 */
export function nativeProductTargets(path: string, body: any) {
  const products = new Set<string>(),
    variants = new Set<string>();
  const images = new Set<string>(),
    options = new Set<string>();
  const values = new Set<string>();
  const add = (set: Set<string>, id: unknown) => {
    if (typeof id === "string" && id) set.add(id);
  };
  const rows = (value: any): any[] => (Array.isArray(value) ? value : []);
  const product = (p: any) => {
    add(products, p?.id);
    for (const v of rows(p?.variants)) add(variants, v?.id);
    for (const image of rows(p?.images)) add(images, image?.id);
    for (const id of rows(p?.option_ids)) add(options, id);
    for (const option of rows(p?.options)) add(options, option?.id);
  };
  const parts = path.split("/").slice(1).map(decodeURIComponent);
  if (parts.some((part) => part.includes("/")))
    throw Error("INVALID_PRODUCT_ID");
  if (parts[1] === "product-options") {
    add(options, parts[2]);
    if (parts[3] === "values") add(values, parts[4]);
  } else if (parts[1] === "products") {
    const parent = parts[2];
    if (parent === "batch") {
      for (const id of rows(body?.delete)) add(products, id);
      for (const p of [...rows(body?.update), ...rows(body?.create)])
        product(p);
    } else if (!parent || !["import", "imports", "export"].includes(parent)) {
      add(products, parent);
      if (!parts[3]) product(body);
      if (parts[3] === "variants") {
        if (parts[4] === "batch") {
          for (const id of rows(body?.delete)) add(variants, id);
          for (const v of rows(body?.update)) add(variants, v?.id);
        } else if (parts[4] === "inventory-items") {
          for (const v of [
            ...rows(body?.create),
            ...rows(body?.update),
            ...rows(body?.delete),
          ])
            add(variants, v?.variant_id);
        } else {
          add(variants, parts[4]);
          // The pinned update service permits data.id to override its selector.
          if (!parts[5]) add(variants, body?.id);
          if (parts[5] === "images")
            for (const id of [...rows(body?.add), ...rows(body?.remove)])
              add(images, id);
        }
      } else if (parts[3] === "images") {
        add(images, parts[4]);
        for (const id of [...rows(body?.add), ...rows(body?.remove)])
          add(variants, id);
      } else if (parts[3] === "options") {
        for (const option of rows(body?.add))
          add(options, typeof option === "string" ? option : option?.id);
        for (const id of rows(body?.remove)) add(options, id);
        for (const option of rows(body?.update)) {
          add(options, option?.product_option_id);
          for (const id of [...rows(option?.add), ...rows(option?.remove)])
            add(values, id);
        }
      }
    }
  }
  return { products, variants, images, options, values };
}
