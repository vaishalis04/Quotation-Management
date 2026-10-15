# Quotation Management Backend

Node.js + Express + MySQL + Sequelize. Same layout as the attendance projects
(`server.js`, `src/{config,controllers,middleware,models,routes,services,utils,validations}`).

GST-accurate quotations for **CCTV, security, IT and electrical** businesses (any business, really).
Every company uploads its **own quotation layout** (Word, Excel or HTML) and gets the calculated figures filled in.

## Setup
```bash
npm install
cp .env.example .env        # fill DB_* and JWT_SECRET
# create an empty MySQL database named in DB_NAME, then:
npm run seed                # tables + demo CCTV company, admin, items, terms, shared layout
npm run dev
npm test                    # 37 tests (calculator + full API flow)
```
Seed login: `admin@company.com` / `Admin@12345` (company admin), `super@admin.com` (super admin) - change both.
Later model changes: `npm run sync-db` or `SYNC_DB=true`.
PDF output: docx/xlsx need LibreOffice on the server (`SOFFICE_PATH`); html needs `npm i puppeteer`.

## How the numbers are worked out (`services/taxCalculator.service.js`)
All maths uses decimal.js (no floating point), rounded half-up to paise. Totals are **always computed on the server**;
anything the client sends for totals is ignored. `POST /quotations/calculate` runs the same engine without saving, for live totals.

1. line amount = qty x rate
2. line discount (percent or amount)
3. overall discount (percent or amount) - shared across lines in proportion, to the exact paisa
4. GST is charged on the value **after** discount
5. same state as your company -> CGST + SGST (always equal halves; UTGST label for UTs without legislature); other state -> IGST
6. additional charges (freight, installation...) are taxed with their own rate and never discounted
7. optional round-off of the grand total to the nearest rupee (shown separately), amount in words in Indian format
8. price mode `exclusive` (GST added) or `inclusive` (GST carved out of the entered price)
9. `gst_treatment: no_gst` for composition / exempt supplies

GST slabs are validated per quotation date: current 0, 0.1, 0.25, 1, 1.5, 3, 5, 18, 40; the old 7.5, 12, 28 are accepted only for quotes
dated before 22 Sep 2025 (GST 2.0). Override with `GST_ALLOWED_RATES` if the Council changes slabs again. **A rate is a property of the HSN/SAC
code - confirm each item's rate with your CA; the app only guarantees the maths and that the slab exists.**
GSTINs are checked with the real checksum; the state is read from the GSTIN.

## Layouts (the multi-format part)
`GET /quotation-templates/samples/{docx|xlsx|html}` gives a starter file. Edit it (logo, colours, columns), keep the tags, upload it.
`GET /quotation-templates/placeholders` lists every tag with example values (generated from code, never stale).
Upload is **test-rendered immediately**: a wrong tag is rejected with the reason instead of failing later on a customer quotation.

| format | tag style | repeat a table row |
|---|---|---|
| docx | `{company.name}` | `{#items}` in first cell, `{/items}` in last cell of one row; `{#is_intra}...{/is_intra}` for conditional rows |
| xlsx | `{{company.name}}` | any row containing `{{items.name}}` (also `charges.`, `tax_summary.`, `terms.`) is copied per entry - keep that row free of other content |
| html | `{{company.name}}` | `{{#each items}}`, `{{#if is_intra}}` (Handlebars, auto-escaped) |

Layout choice order: `?templateId=` > the layout saved on the quotation > company default > shared default for the business type > built-in HTML.
Word logos/images: place them directly in your .docx (static). HTML layouts get `{{company.logo_data_uri}}`.

## API (all under `/api/v1`, `Authorization: Bearer <jwt>`)
- `auth`: POST `/login`, POST `/register`, GET `/users`, PATCH `/users/:id/active`, GET `/me`, PUT `/change-password`
- `companies`: GET/PUT `/me` (GSTIN, state, bank, numbering, defaults), POST `/me/logo`; super admin: GET/POST `/`, PUT `/:id`
- `customers`, `items` (+ GET `/categories`), `terms-templates`: CRUD
- `quotation-templates`: GET `/`, POST `/` (multipart `file`), POST `/html`, PUT `/:id`, PUT `/:id/file`, DELETE, GET `/:id/download`, GET `/:id/preview`
- `quotations`:
  - POST `/calculate` - live totals, nothing saved
  - GET `/` (status, customer_id, from, to, q, all_versions), POST `/`, GET/PUT/DELETE `/:id` (edit/delete drafts only)
  - PATCH `/:id/status` (draft -> sent -> accepted / rejected / expired / cancelled)
  - POST `/:id/revise` (new version `QT/2026-27/0007-R1`, old one becomes `revised`), POST `/:id/duplicate`
  - GET `/:id/versions`, GET `/:id/activity`
  - GET `/:id/render?templateId=&output=native|pdf&inline=true`
- `meta`: GET `/states`, `/constants`, `/gst-rates?date=`, `/validate-gstin?gstin=`; `reports`: GET `/summary`

Request body for create/update:
```json
{ "customer_id": 1, "subject": "CCTV for showroom", "quote_date": "2026-10-14", "place_of_supply_state_code": "23",
  "price_mode": "exclusive", "discount_type": "percent", "discount_value": 5, "terms_template_id": 1,
  "items":   [{ "item_id": 3, "quantity": 4 }, { "name": "NVR 8ch", "quantity": 1, "rate": 12500, "gst_rate": 18, "hsn_sac": "8521",
                "discount_type": "amount", "discount_value": 500, "section": "Recording" }],
  "charges": [{ "name": "Installation", "amount": 3000, "gst_rate": 18, "hsn_sac": "995469" }] }
```
Catalogue items supply name/HSN/unit/rate/GST; anything you send on the line overrides them.

## Behaviour worth knowing
- Customer and company details are **frozen into each quotation**; editing masters never changes an issued quotation.
- Numbering `PREFIX/FY/0001` per company, resets each 1 April, allotted in the same DB transaction as the insert. Deleting a draft leaves a gap.
- Roles: `super_admin`, `company_admin`, `manager` (masters, layouts, any quotation), `sales` (own quotations only; cannot see `cost_price`).
- Multi-tenant: every query is scoped to the user's company; layouts uploaded by a company are visible only to it.
- Uploaded layouts are untrusted: HTML is escaped and served with a no-script CSP, PDF rendering disables JS and blocks network, docx tag paths cannot reach JS internals.
- "sent" quotations past `valid_until` become `expired` nightly (00:10 IST) and on every list call.

## Not included
E-invoice/IRN, e-way bill, TCS/TDS, cess, bulk item import, e-mail/WhatsApp sending, quotation -> invoice conversion.
