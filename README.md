# Shopify Markets Localization

Hi! 👋

This is a **Node.js toolkit** for translating a **Shopify** store from Dutch (`nl`) into other languages using **DeepL** and Shopify’s native **Translations API**. Translations are stored inside Shopify (not in a proxy layer), so they work naturally with **Markets** and language switchers on your storefront.

Built for real e‑commerce catalogs — products, collections, pages, menus, theme strings, variant options, SEO fields, and glossary-controlled motorsport terminology.

**Author:** [Haseeb536 on GitHub](https://github.com/Haseeb536)

---

## What it does

- Translates **product titles, descriptions, SEO**, and **variant option names**
- Supports **bulk catalog** runs with resume/progress (large stores welcome)
- **Text-only mode** — translate words without editing theme layout files
- **Theme text-only mode** — UI labels via Translations API + `locales/*.json` (no `.liquid` surgery)
- **Glossary** for brand terms (Forge, Short Shift, Mit/Ohne Klemmen, etc.)
- **QA / repair** scripts for titles, bodies, and locale-specific polish
- Optional **webhook + Redis worker** pipeline for ongoing sync

---

## How it works (simple version)

```
Dutch source (nl)  →  DeepL  →  Shopify Translations API  →  Published locale (de, fr, en, it, es, pl…)
```

1. You connect a Shopify app with translation scopes.
2. You set `SOURCE_LOCALE` and `TARGET_LOCALES` in `.env`.
3. You run a translate script (or start the worker).
4. Shoppers pick a language on the storefront — Shopify serves the translated strings.

---

## Requirements

| You need | Why |
|----------|-----|
| **Node.js 18+** | Runtime |
| **Shopify store** + Admin API app | Read/write products & translations |
| **DeepL API key** | Machine translation |
| **Redis** (optional) | Only for webhook worker / BullMQ queue |

---

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/Haseeb536/shopify-markets-localization.git
cd shopify-markets-localization
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in at minimum:

- `SHOPIFY_STORE` — your shop (e.g. `my-shop.myshopify.com`)
- `SHOPIFY_ACCESS_TOKEN` **or** OAuth via `SHOPIFY_CLIENT_ID` + `APP_BASE_URL`
- `DEEPL_API_KEY`
- `SOURCE_LOCALE=nl`
- `TARGET_LOCALES=es` (or `de,fr,en,it,es,pl`)

Run the sanity checks:

```bash
npm run test:shopify
npm run test:deepl
npm run check:locales
```

### 3. Translate (no Redis needed)

**Products only — safe for production (no theme layout changes):**

```bash
npm run translate:text-only -- --limit 20          # smoke test
node scripts/translate-text-only.js --resume       # continue large catalog
```

**Theme UI words only (footer, labels, menus — no `.liquid` edits):**

```bash
npm run translate:theme-text-only
```

**Full store (includes theme Liquid patches — use on dev/staging first):**

```bash
npm run translate:store:full -- --text-only        # products only
npm run translate:store:full                       # theme + catalog (careful on live themes)
```

### 4. Optional: webhook worker

```bash
npm run redis:up
npm run dev          # API + OAuth
npm run worker       # translation queue
```

---

## Useful commands

| Command | What it does |
|---------|----------------|
| `npm run translate:text-only` | Catalog text via Translations API (design-safe) |
| `npm run translate:theme-text-only` | Theme UI strings without Liquid changes |
| `npm run fix:terminology` | Glossary pass on titles & bodies |
| `npm run fix:product-options` | Variant option names (Kleur → Color, etc.) |
| `npm run verify:locale` | Check a product has translations for a locale |
| `npm run audit:store` | Catalog translation audit |

See `package.json` for the full list of scripts.

---

## Project layout

```
├── config/          Glossary, locale QA rules, theme nav strings
├── scripts/         CLI tools (translate, audit, fix, probe)
├── src/
│   ├── services/    Shopify, DeepL, translation pipeline
│   ├── workers/     BullMQ worker (optional)
│   └── server.js    Express API + OAuth + webhooks
├── data/            Local progress & OAuth token (gitignored)
└── .env.example     Copy to .env — never commit secrets
```

---

## Modes explained

### Text-only (recommended for live stores)

Translates **catalog text** only. Does **not** modify theme `.liquid` files, so your product page layout stays intact.

### Theme text-only

Translates **theme UI copy** (labels, footer, menus) through Shopify’s translation system and locale JSON files. Still avoids layout-breaking Liquid patches.

### Full sync

Includes Liquid snippet wiring for hardcoded Dutch strings. Powerful but can affect theme markup — always test on a **duplicate theme** first.

---

## Troubleshooting

| Problem | Try this |
|---------|----------|
| `DeepL quota exceeded` | Pause bulk jobs; upgrade plan or wait for monthly reset; `--resume` later |
| Products still Dutch on storefront | Switch language to ES in the storefront URL/switcher |
| `translation_skipped_keys` in logs | Normal — `handle` and `product_type` are skipped on purpose |
| Slow bulk run | Set `PRODUCT_TRANSLATE_CONCURRENCY=8` in `.env` (see `.env.example`) |

---

## License

This project is provided as-is for learning and store localization workflows. Use at your own risk on production stores — always back up your theme first.

---

Questions or improvements? Open an issue on [GitHub](https://github.com/Haseeb536) — happy to help! 🚀
