import vocabulary from "./facet-vocabulary.json";
export async function seedFacetVocabulary(c: any) {
  for (const f of vocabulary) {
    await c.query(
      "INSERT INTO didar_facet(code,number,mode,target,sort_order) VALUES($1,$2,$3,$4,$2) ON CONFLICT DO NOTHING",
      [f.code, f.number, f.mode, f.target],
    );
    for (const [locale, label] of [
      ["fa", f.fa],
      ["en", f.en],
    ])
      await seedLabel(c, "facet", f.code, locale, label);
    for (const [i, v] of f.values.entries()) {
      const id = f.code + "." + v.code;
      await c.query(
        "INSERT INTO didar_facet_value(id,facet_code,code,evidence_required,sort_order) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [id, f.code, v.code, v.evidence_required, i],
      );
      for (const [locale, label] of [
        ["fa", v.fa],
        ["en", v.en],
      ])
        await seedLabel(c, "value", id, locale, label);
    }
  }
  for (const [slug, name, kind, query] of [
    ["everyday-gold", "طلای روزمره", "lifestyle", { usage: ["everyday"] }],
    [
      "minimal-gold",
      "طلای مینیمال",
      "lifestyle",
      { design_style: ["minimalist"] },
    ],
    ["nowruz-gifts", "هدایای نوروز", "occasion", { occasion: ["nowruz"] }],
    [
      "wedding-gold",
      "طلای عروسی",
      "occasion",
      { occasion: ["wedding", "bridal"] },
    ],
    [
      "persian-heritage",
      "میراث ایرانی",
      "heritage",
      { heritage: ["persian_heritage"] },
    ],
    [
      "heritage-collections",
      "کالکشن‌های میراث",
      "heritage",
      { collection_type: ["heritage"] },
    ],
    [
      "editors-picks",
      "منتخب دیدار",
      "curated",
      { merchandising: ["editors_pick"] },
    ],
    [
      "everyday-luxury",
      "طلای روزمره لوکس",
      "curated",
      { usage: ["everyday"], market_tier: ["luxury"] },
    ],
  ] as const) {
    await c.query(
      "INSERT INTO didar_discovery_page(id,slug,name,kind,query) VALUES($1,$1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [slug, name, kind, JSON.stringify(query)],
    );
    await seedLabel(c, "page", slug, "fa", name);
  }
}
async function seedLabel(
  c: any,
  type: string,
  id: string,
  locale: string,
  label: string,
) {
  await c.query(
    "INSERT INTO didar_catalog_translation(id,entity_type,entity_id,locale,label,status,source_ref,reviewed_at) VALUES($1,$2,$3,$4,$5,'approved','spec:B2C_PRODUCT_TAXONOMY_FACETS_SPEC@a75adca',now()) ON CONFLICT DO NOTHING",
    ["spec:" + type + ":" + id + ":" + locale, type, id, locale, label],
  );
}
