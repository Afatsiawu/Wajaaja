# Kwabenya Spares — Full Platform Documentation

Web-based e-commerce platform for motorcycle spare parts sellers in
Kwabenya, Accra. This document explains **every file in the project, what
every function and component does, and how the pieces fit together.** It's
meant to be read alongside the source code — line-by-line comments live in
the code itself (see "How the code is commented" below); this document is
the bird's-eye view that ties those comments together.

## Table of contents

1. [Status, honestly](#1-status-honestly)
2. [Tech stack](#2-tech-stack)
3. [Project structure](#3-project-structure)
4. [Data model](#4-data-model)
5. [Frontend reference (`src/App.jsx`)](#5-frontend-reference-srcappjsx)
6. [Frontend support files](#6-frontend-support-files)
7. [Backend reference (`backend/`)](#7-backend-reference-backend)
8. [Full API endpoint reference](#8-full-api-endpoint-reference)
9. [How the frontend and backend connect](#9-how-the-frontend-and-backend-connect)
10. [Running it locally](#10-running-it-locally)
11. [Deploying it](#11-deploying-it)
12. [How the code is commented](#12-how-the-code-is-commented)
13. [Known limitations](#13-known-limitations)

---

## 1. Status, honestly

- **Frontend — fully functional on its own.** Runs entirely on realistic
  mock data held in React state (6 shops, 6 fitters, 20 parts). Every
  button, search box, filter, cart action, checkout step, and dashboard
  toggle described in this document actually works. Refreshing the page
  resets state, since nothing is persisted to a database yet.
- **Backend — a real, working Django REST API**, built to the exact
  PostgreSQL schema from the original spec, with a working admin panel and
  a seed command. It is not yet deployed anywhere, and the frontend does
  not yet call it (see [§9](#9-how-the-frontend-and-backend-connect)).
- **Payments are simulated.** Checkout validates input and produces a
  realistic order confirmation, but no real MoMo/Telecel/Paystack/Hubtel
  integration is wired in.

## 2. Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 (function components + hooks only, no class components) |
| Frontend build tool | Vite 5 |
| Styling | Tailwind CSS 3 (standard/core utility classes only — see [§5.6](#56-styling-system)) |
| Icons | lucide-react |
| Frontend state | React Context + `useState`/`useMemo`/`useEffect`/`useRef` (no Redux/Zustand/etc — the app is small enough that Context alone is sufficient) |
| Backend framework | Django 5 + Django REST Framework |
| Database | PostgreSQL |
| Backend auth | Django's built-in auth system, with a custom `User` model adding `phone_number` and `role` |
| Cross-origin access | `django-cors-headers`, so the separately-hosted frontend can call the API |
| Frontend hosting | Netlify (static site) |
| Backend hosting | Render or Railway (not Netlify — see [§11](#11-deploying-it)) |

## 3. Project structure

```
kwabenya-spares/
├── README.md                    Frontend-focused overview + Netlify deploy guide
├── DOCUMENTATION.md              ← this file
├── index.html                    Vite's HTML entry point
├── package.json                  Frontend dependencies + npm scripts
├── vite.config.js                Vite build configuration
├── tailwind.config.js            Tailwind configuration
├── postcss.config.js             PostCSS configuration (runs Tailwind)
├── netlify.toml                  Netlify build + SPA redirect configuration
├── .gitignore                    Frontend git-ignore rules
├── src/
│   ├── main.jsx                  React entry point — mounts <App/> into index.html
│   ├── App.jsx                   THE ENTIRE APPLICATION — see §5 below
│   ├── index.css                 Tailwind's @tailwind directives
│   └── services/
│       └── api.js                Ready-to-use fetch() wrappers for the Django API (not yet wired into App.jsx)
└── backend/
    ├── README.md                  Backend-focused setup + deploy guide
    ├── manage.py                  Django's command-line entry point
    ├── requirements.txt           Python dependencies
    ├── .env.example               Template for backend/.env (secrets, DB credentials)
    ├── .gitignore                 Backend git-ignore rules
    ├── config/                    The Django PROJECT (site-wide configuration)
    │   ├── settings.py            All Django settings
    │   ├── urls.py                Root URL routing
    │   └── wsgi.py                Production server entry point
    └── api/                       The Django APP (this platform's actual data + logic)
        ├── models.py              Database table definitions
        ├── serializers.py         Model <-> JSON converters
        ├── views.py                API endpoint logic
        ├── urls.py                 Maps views to URL paths
        ├── admin.py                Django admin site configuration
        └── management/commands/
            └── seed_demo_data.py   Loads demo data matching the frontend's mock data
```

## 4. Data model

The frontend's mock data (`CATEGORIES`, `SHOPS_INIT`, `PRODUCTS_INIT` in
`App.jsx`) and the backend's real database tables (`models.py`) describe
the exact same four entities. This table shows how the fields line up:

| Concept | Frontend mock field | Backend model field | Notes |
|---|---|---|---|
| **Category** | `category_id` | `Category.id` (auto) | |
| | `category_name` | `Category.category_name` | |
| **Shop** | `shop_id` | `Shop.id` (auto) | |
| | `owner_name` | `Shop.owner` → `User.first_name`/`last_name` | Frontend stores the name directly; backend links to a real `User` account |
| | `contact_phone` | `Shop.owner` → `User.phone_number` | |
| | `landmark_address` | `Shop.landmark_address` | |
| | `latitude` / `longitude` | `Shop.latitude` / `Shop.longitude` | `DECIMAL(9,6)` in both |
| | `opening_time` / `closing_time` | `Shop.opening_time` / `Shop.closing_time` | `"HH:MM"` string vs. Django `TimeField` |
| | `sunday_open` | *(not yet in backend)* | Backend's `is_open_now()` currently assumes every day follows the same hours — see [§13](#13-known-limitations) |
| | `is_open_override` | `Shop.is_open_override` | |
| **Mechanic** (nested under `shop.mechanic` on the frontend) | `mechanic_id` | `Mechanic.id` (auto) | |
| | `full_name` | `Mechanic.full_name` | |
| | `phone_number` | `Mechanic.phone_number` | |
| | `specialization` | `Mechanic.specialization` | |
| | `years_experience` | `Mechanic.years_experience` | |
| | `is_on_duty` | `Mechanic.is_on_duty` | |
| **Product** | `product_id` | `Product.id` (auto) | |
| | `shop_id` | `Product.shop` (FK) | |
| | `category_id` | `Product.category` (FK, nullable) | |
| | `part_name` | `Product.part_name` | |
| | `description` | `Product.description` | |
| | `compatible_models` | `Product.compatible_models` | |
| | `price` | `Product.price` | `DECIMAL(10,2)` in both |
| | `stock_quantity` | `Product.stock_quantity` | |

The backend also has a `User` model (rider/seller/mechanic/admin accounts)
that the frontend doesn't need a full equivalent of, since the frontend's
"role" is just a UI demo switch, not real authentication (see [§5.3](#53-context--global-state)).

---

## 5. Frontend reference (`src/App.jsx`)

The entire application is one file, organized top-to-bottom in this order
(this is also the order laid out in the file's own header comment):

1. Imports
2. Mock data
3. Helper functions
4. React Context
5. Small shared UI pieces
6. Route ticker
7. Header
8. Home view + everything on it
9. Shops view
10. Shop detail view
11. Product detail view
12. Cart view
13. Checkout + confirmation views
14. Seller dashboard
15. Mechanic dashboard
16. Admin dashboard
17. Footer
18. `MainContent` (the view router)
19. `App` (the root component)

### 5.1 Mock data

| Constant | Shape | Purpose |
|---|---|---|
| `CATEGORIES` | Array of `{ category_id, category_name }` | The 8 spare-parts categories. Drives the category pegboard, filter chips, and the `CategoryIcon` lookup. |
| `SHOPS_INIT` | Array of shop objects, each with a nested `mechanic` object | Starting value for the `shops` state in `App`. 6 shops covering the Kwabenya area. |
| `PRODUCTS_INIT` | Array of product objects | Starting value for the `products` state in `App`. 20 parts spread across the 6 shops and 8 categories. |

Full field-by-field meaning of every shop/product field is documented
directly above each array in the source code, and in the [data model
table](#4-data-model) above.

### 5.2 Helper functions

These are plain functions — no state, no JSX (except `CategoryIcon`, which
returns a small icon element) — usable from anywhere in the file.

| Function | Signature | What it does |
|---|---|---|
| `formatGHS` | `(n) => string` | Formats a number as a Ghana-Cedi string, e.g. `185` → `"GH₵185.00"` |
| `isShopOpenNow` | `(shop, now = new Date()) => boolean` | The single source of truth for every OPEN/CLOSED badge. Checks the manual override, Sunday trading, and the current time against opening/closing hours. |
| `formatHours` | `(shop) => string` | Turns a shop's 24-hour times into a display string like `"Mon–Sat: 7 AM – 7 PM"` |
| `CategoryIcon` | `({ categoryId, size, className, strokeWidth }) => JSX` | Renders the lucide icon that matches a category, via the `CATEGORY_ICON_MAP` lookup table. Falls back to a generic `Package` icon. |
| `telHref` | `(phone) => string` | Builds a `tel:+233...` link from a local Ghanaian phone number, for the "Call shop"/"Call fitter" buttons. |
| `directionsUrl` | `(lat, lng) => string` | Builds a Google Maps turn-by-turn directions URL — no API key required. |
| `mapEmbedUrl` | `(lat, lng) => string` | Builds a Google Maps embed URL for the `<iframe>` on the shop detail page — also no API key required. |
| `nextId` | `() => number` | Generates a fake auto-increment ID (starting at 1001) for products created at runtime through the seller dashboard. |

### 5.3 Context & global state

`AppCtx` (a React Context) is the app's single global store. Every
component reads from it via the `useApp()` hook instead of receiving props
through several layers of components. All of the state below lives in the
root `App` component and is exposed through `AppCtx.Provider`.

| State variable | Type | Purpose |
|---|---|---|
| `shops` | array | Mutable copy of `SHOPS_INIT` — seller-dashboard actions (open/close toggle, fitter duty toggle) edit this. |
| `products` | array | Mutable copy of `PRODUCTS_INIT` — seller add/edit/delete actions edit this. |
| `cart` | array of `{ productId, qty }` | The shopping cart. |
| `view` | string | Which top-level screen is showing (`'home'`, `'shops'`, `'cart'`, etc.) — read by `MainContent`. |
| `selectedShopId` / `selectedProductId` | number \| null | Which shop/product the detail views should display. |
| `role` | `'RIDER' \| 'SELLER' \| 'MECHANIC' \| 'ADMIN'` | **Demo-only** role switch — see the callout below. |
| `currentShopId` | number | Which shop's owner/fitter the seller/mechanic dashboards are "logged in" as. |
| `searchQuery` | string | The committed (not draft) search text, applied on the home view. |
| `filters` | `{ categoryIds, shopId, minPrice, maxPrice, sort }` | Catalog filter/sort state. |
| `toast` | string \| null | Current toast message, if any. |
| `lastOrder` | object \| null | The most recently placed order, read by the confirmation screen. |

> **On the `role` state:** this is *not* real authentication. There's no
> password, no server session, nothing persisted. It exists purely so one
> running instance of the app can demonstrate what a rider, a shop owner, a
> fitter, and an admin would each see, via a dropdown in the header.

Functions exposed through the same context: `navigate`, `addToCart`,
`updateCartQty`, `removeFromCart`, `clearCart`, `addProduct`,
`updateProduct`, `removeProduct`, `updateShop`, `showToast`, plus the
setters for every state variable above. Each is documented at its
definition inside `App()` in the source.

### 5.4 Component reference

Grouped by the section of the app they belong to.

**Shared UI pieces**

| Component | Purpose |
|---|---|
| `StatusPill` | The OPEN/CLOSED, AVAILABLE/BUSY badge, used everywhere a live status shows. |
| `Toast` | The floating bottom-of-screen confirmation message. |
| `DashedRule` | Decorative "road markings" divider (inline CSS, not a Tailwind class). |
| `SectionLabel` | The eyebrow-caption + heading pairing used to title every major section. |
| `RouteTicker` | The scrolling shop-name strip under the header, styled after Accra trotro destination boards. |
| `EmptyState` | Generic "nothing here" screen, used when a detail view is asked to show a stale/missing id. |

**Header**

| Component | Purpose |
|---|---|
| `Header` | Logo, desktop/mobile nav, search box (with a local draft value separate from the committed global `searchQuery`), role switcher, cart button with item-count badge, mobile hamburger menu. |

**Home / catalog**

| Component | Purpose |
|---|---|
| `Hero` | Big banner with headline, two CTA buttons, and a live stat row computed from `shops`/`products`. |
| `HowItWorks` | Static 3-step explainer (the one place that uses numbered steps, since it's a genuine sequence). |
| `CategoryPegboard` | Row of clickable category icons that toggle the category filter. |
| `ProductCard` | Reusable product tile (icon "image", name, compatible models, price, parent shop's live status, Add to cart button). Used on the home catalog AND the shop detail page. |
| `FilterBar` | Shop / price-range / sort-order controls, plus removable category-filter chips. |
| `HomeView` | Combines all of the above + the actual filtered/sorted product grid (`useMemo`-cached). |

**Shops directory**

| Component | Purpose |
|---|---|
| `ShopCard` | One tile in the shop directory: name, status, landmark, hours, mini fitter card, "View shop" / "Directions" buttons. |
| `ShopsView` | Search box + "open now only" checkbox + the grid of `ShopCard`s. |

**Shop detail**

| Component | Purpose |
|---|---|
| `ShopDetailView` | Full shop page: info card, embedded Google Map `<iframe>`, fitter card, and a grid of that shop's products (reusing `ProductCard`). |

**Product detail**

| Component | Purpose |
|---|---|
| `ProductDetailView` | Full product page: icon "image", description, compatible-model tags, price/stock, quantity stepper, Add to cart, and an embedded mini shop+fitter card with its own directions/call buttons. |

**Cart & checkout**

| Component | Purpose |
|---|---|
| `CartView` | Line items with quantity steppers and remove buttons, subtotal, checkout button. Dedicated empty-cart state. |
| `CheckoutView` | Delivery-details + payment-method form (MTN MoMo / Telecel Cash / Cash on pickup), full validation, simulated payment delay. |
| `ConfirmationView` | Order-placed success screen with a full line-item breakdown, reading from `lastOrder`. |

**Seller dashboard**

| Component | Purpose |
|---|---|
| `NewProductForm` | Collapsible "list a new part" form. |
| `SellerProductRow` | One editable inventory row (draft price/stock inputs, Save button only enabled once something changed, Delete button). |
| `SellerDashboardView` | Shop picker (demo login), stat cards, shop open/closed override toggle, fitter duty toggle, the editable inventory list, and the new-product form. |

**Mechanic & admin dashboards**

| Component | Purpose |
|---|---|
| `MechanicDashboardView` | Fitter picker (demo login) + a single toggle for that fitter's own duty status. |
| `AdminDashboardView` | Read-only platform-wide stat cards + a table of every shop with live status and assigned fitter. |

**Footer & routing**

| Component | Purpose |
|---|---|
| `Footer` | Brand blurb, quick nav links, honesty note about the demo build. |
| `MainContent` | Reads `view` from context and renders whichever top-level view component matches — the app's "router." |
| `App` | Root component — owns all state (§5.3), defines every mutation function, and renders `Header` + `RouteTicker` + `MainContent` + `Footer` + `Toast` inside `AppCtx.Provider`. |

### 5.5 View-by-view feature list

| View name (`view` string) | Reached via | What you can do there |
|---|---|---|
| `home` | Default / logo click | Search, filter by category/shop/price, sort, browse the catalog, add items to cart |
| `shops` | "Shops" nav link / "View all shops" button | Search shops by name/landmark, filter to only-open, view any shop |
| `shopDetail` | Clicking a shop card / product's embedded shop card | View full shop info, embedded map, fitter details, call/directions, browse that shop's products |
| `productDetail` | Clicking a product card | View full product info, adjust quantity, add to cart, view/contact the shop |
| `cart` | Cart icon | Adjust quantities, remove items, proceed to checkout |
| `checkout` | "Proceed to checkout" | Fill delivery details, choose a payment method, place the (simulated) order |
| `confirmation` | After placing an order | View the order summary |
| `seller` | Role switcher → "Shop owner" | Pick which shop you're "logged in" as, toggle shop open/closed, toggle fitter duty, edit/add/delete products |
| `mechanic` | Role switcher → "Fitter" | Pick which fitter you're "logged in" as, toggle your own duty status |
| `admin` | Role switcher → "Admin" | View platform-wide stats and the full shop table |

### 5.6 Styling system

The whole app uses **only Tailwind's standard, pre-built utility classes**
— no arbitrary bracket values like `bg-[#E8600C]` or `text-[11px]`, and no
opacity-modifier suffixes like `bg-white/10`. This is a deliberate
constraint of the live-preview artifact environment (which has no
JIT/build step, so only classes from Tailwind's default prebuilt
stylesheet actually render). The real downloadable project's Tailwind
config (§6) *would* support arbitrary values via its own build step, but
the code was kept identical between both so the live preview and the
downloaded project always look the same.

Because of that constraint, the color palette maps the design's intended
custom hex colors onto the nearest standard Tailwind shades:

| Design intent | Tailwind class used |
|---|---|
| Near-black page background | `stone-950` |
| Card surfaces | `stone-900` |
| Primary/brand orange | `orange-600` (hover: `orange-500`) |
| Body text on dark | `stone-100`–`stone-500` (lighter = more emphasis) |
| "Open" / "Available" status | `green-950` background, `green-400` text |
| "Closed" / "Busy" status | `red-950` background, `red-400` text |

Two small pieces of real CSS (impossible to express as Tailwind utility
classes) are injected via a `<style>` tag inside `App()`:
- `.font-display` / `.font-mono` — custom Google Fonts (Bebas Neue for
  headings, IBM Plex Mono for numbers/labels), since Tailwind's
  arbitrary-value font-family syntax isn't available here.
- `.ticker-track` / `.toast-in` — the route ticker's scrolling marquee
  animation and the toast's fade-in animation.

---

## 6. Frontend support files

| File | Purpose |
|---|---|
| `index.html` | Vite's HTML entry point. Contains the empty `<div id="root">` React mounts into and the `<script>` tag that loads `main.jsx`. |
| `src/main.jsx` | Creates the React root and renders `<App />` into it, wrapped in `<React.StrictMode>`. |
| `src/index.css` | The three `@tailwind` directives that pull in Tailwind's generated CSS, plus one small `scroll-behavior: smooth` rule. |
| `src/services/api.js` | Ready-to-use `fetch()` wrapper functions matching every backend endpoint. **Not yet called from `App.jsx`** — see [§9](#9-how-the-frontend-and-backend-connect). |
| `package.json` | Lists dependencies (`react`, `react-dom`, `lucide-react`) and dev dependencies (`vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`), plus the `dev`/`build`/`preview` npm scripts. *(JSON doesn't support comments, so this file's fields are documented here instead of inline.)* |
| `vite.config.js` | Registers the React plugin; everything else uses Vite's defaults. |
| `tailwind.config.js` | Points Tailwind at `index.html` + every `.js`/`.jsx` file under `src/` to scan for class names; deliberately makes no palette customizations (see [§5.6](#56-styling-system)). |
| `postcss.config.js` | Registers the `tailwindcss` and `autoprefixer` PostCSS plugins that actually turn `index.css`'s `@tailwind` directives into real CSS. |
| `netlify.toml` | Tells Netlify to run `npm run build` and publish the `dist/` folder, plus a redirect rule sending every path to `index.html` (needed for any future client-side routing). |
| `.gitignore` | Excludes `node_modules`, `dist`, `.env`, `.DS_Store` from version control. |

---

## 7. Backend reference (`backend/`)

### 7.1 `config/` — the Django project

| File | Purpose |
|---|---|
| `settings.py` | All configuration: installed apps, middleware, the custom `AUTH_USER_MODEL`, database connection (reads `DATABASE_URL` or individual `POSTGRES_*` env vars), DRF pagination/permission defaults, and `CORS_ALLOWED_ORIGINS`. |
| `urls.py` | Root URL routing: mounts Django admin at `/admin/` and every API route (from `api/urls.py`) under `/api/`. |
| `wsgi.py` | The entry point a production server (gunicorn) actually runs. |

### 7.2 `api/` — the Django app

| File | Purpose |
|---|---|
| `models.py` | Five models: `User` (extends Django's built-in user with `phone_number` + `role`), `Shop`, `Mechanic`, `Category`, `Product` — see [§4](#4-data-model) for the full field mapping. `Shop.is_open_now()` is the backend's equivalent of the frontend's `isShopOpenNow()` helper. |
| `serializers.py` | `CategorySerializer`, `MechanicSerializer`, `ShopSerializer` (nests mechanics + a computed `is_open_now` field + the owner's name/phone), `ShopMiniSerializer` (lightweight version nested inside products), `ProductSerializer` (nests shop/category on read, accepts plain `shop_id`/`category_id` on write), `UserSerializer`. |
| `views.py` | Four `ModelViewSet`s (`CategoryViewSet`, `ShopViewSet`, `MechanicViewSet`, `ProductViewSet`), each auto-generating full CRUD endpoints. `ShopViewSet` and `ProductViewSet` override `get_queryset()` to support search/filter query parameters. `MechanicViewSet` adds one custom endpoint, `toggle_duty`. |
| `urls.py` | Registers all four viewsets with a DRF `DefaultRouter`, generating the URL patterns listed in [§8](#8-full-api-endpoint-reference). |
| `admin.py` | Registers every model with Django's admin site, with sensible `list_display`/`list_filter`/`search_fields` for each. |
| `management/commands/seed_demo_data.py` | A custom `python manage.py seed_demo_data` command that creates the same 6 shops, 6 fitters, and 20 products as the frontend's mock data (plus login accounts for each shop owner/fitter, all sharing the password `demo-password-123`), so the real API returns matching results once connected. |

---

## 8. Full API endpoint reference

Base URL: `http://localhost:8000/api/` locally, or your deployed backend's
URL in production.

| Method | Path | Description |
|---|---|---|
| `GET` | `/shops/` | List all shops. Query params: `q` (search name/landmark), `open=true` (only currently-open shops). |
| `GET` | `/shops/<id>/` | Retrieve one shop (includes nested `mechanics` and computed `is_open_now`). |
| `POST` | `/shops/` | Create a shop. |
| `PATCH` | `/shops/<id>/` | Partially update a shop (e.g. `{"is_open_override": false}`). |
| `DELETE` | `/shops/<id>/` | Delete a shop (cascades to its mechanic and products). |
| `GET` | `/mechanics/` | List all mechanics. |
| `GET` | `/mechanics/<id>/` | Retrieve one mechanic. |
| `PATCH` | `/mechanics/<id>/toggle_duty/` | Flip a mechanic's `is_on_duty` status. |
| `GET` | `/categories/` | List all categories. |
| `GET` | `/products/` | List products. Query params: `q` (search name/description/compatible models/shop name), `category` (id), `shop` (id), `min_price`, `max_price`, `sort` (`price_asc` \| `price_desc` \| `name`). |
| `GET` | `/products/<id>/` | Retrieve one product (includes nested shop + category). |
| `POST` | `/products/` | Create a product. Body uses `shop_id`/`category_id` (plain integers), not the nested objects. |
| `PATCH` | `/products/<id>/` | Partially update a product (e.g. `{"price": 199, "stock_quantity": 5}`). |
| `DELETE` | `/products/<id>/` | Delete a product. |
| `GET`/`POST`/etc. | `/admin/` | Django's built-in admin site (HTML, not JSON). |

All list endpoints are paginated 20 items per page (`REST_FRAMEWORK.PAGE_SIZE`
in `settings.py`).

---

## 9. How the frontend and backend connect

**Right now, they don't** — `App.jsx` reads and writes `SHOPS_INIT` /
`PRODUCTS_INIT` entirely in React state, and nothing calls the Django API.

To connect them:

1. Deploy `backend/` (see [§11](#11-deploying-it)) and note its URL.
2. Set `VITE_API_URL` (in a `.env` file at the project root) to that URL.
3. In `App()` inside `App.jsx`, replace the two lines
   ```js
   const [shops, setShops] = useState(SHOPS_INIT);
   const [products, setProducts] = useState(PRODUCTS_INIT);
   ```
   with a `useEffect` that calls `api.getShops()` / `api.getProducts()`
   from `src/services/api.js` and stores the results in state instead,
   plus a loading flag while the request is in flight.
4. Swap the seller-dashboard mutation functions (`addProduct`,
   `updateProduct`, `removeProduct`, `updateShop` in `App()`) to call the
   matching `api.*` functions instead of `setProducts`/`setShops`
   directly.

`src/services/api.js` already has every one of these calls written and
matched to the exact backend endpoint — connecting the two is wiring, not
new code.

---

## 10. Running it locally

**Frontend:**
```bash
npm install
npm run dev
```
Opens at `http://localhost:5173` by default.

**Backend:**
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # edit with your local Postgres credentials
createdb kwabenya_spares  # create the database first
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_demo_data   # optional: loads demo data matching the frontend
python manage.py runserver
```
API at `http://localhost:8000/api/`, admin at `http://localhost:8000/admin/`.

## 11. Deploying it

**Frontend → Netlify:**
- Drag-and-drop: `npm run build`, then drag the generated `dist/` folder
  onto [app.netlify.com/drop](https://app.netlify.com/drop).
- Git-connected: push to GitHub, "Import an existing project" in Netlify,
  build command `npm run build`, publish directory `dist` (already set in
  `netlify.toml`).

**Backend → Render or Railway (not Netlify):** Netlify serves static
sites and short-lived serverless functions — it has no way to run a
persistent Django process with a live Postgres connection, which this
backend needs. Point either host at the `backend/` folder, set the
environment variables from `.env.example`, use `gunicorn config.wsgi` as
the start command, and run `python manage.py migrate` after the first
deploy. Full steps in `backend/README.md`.

## 12. How the code is commented

Every file in this project has comments explaining what each part does.
Two different styles are used depending on what the language allows:

- **Plain code (JS, Python, CSS, TOML):** a `//` or `#` comment on or
  directly above nearly every meaningful line — state declarations,
  function bodies, model fields, view logic, config options.
- **JSX markup (inside React components' `return (...)` blocks):** JSX
  doesn't allow a `//` comment on the same line as markup (it would just
  print as literal text on the page). Only `{/* like this */}` is valid,
  and only in positions where a child element is allowed — never inside an
  opening tag's own attribute list. So every meaningful chunk of markup
  (each card, each button group, each conditional section) has a
  `{/* ... */}` comment directly above it instead of one comment per line.
- **`package.json`:** JSON has no comment syntax at all — its fields are
  documented in [§6](#6-frontend-support-files) above instead.

## 13. Known limitations

- The frontend's `sunday_open` per-shop field has no equivalent yet in the
  backend's `Shop` model / `is_open_now()` method — it currently assumes
  every shop follows the same hours seven days a week. Add a matching
  `sunday_open = models.BooleanField(default=False)` field (and update
  `is_open_now()`'s day-of-week check) to bring the two in line.
- `ShopViewSet`'s `?open=true` filter evaluates the whole queryset in
  Python (see the comment in `views.py`) rather than filtering at the
  database level — fine at this dataset's size, worth revisiting if the
  shop count grows much larger.
- No real authentication: the Django backend's `DEFAULT_PERMISSION_CLASSES`
  is `AllowAny`, and the frontend's "role" is a UI-only demo switch. A
  production deployment would need real login (e.g. token or session auth)
  and per-role permissions (only a shop's own owner can edit its products, etc).
- No real payment integration (MoMo/Telecel/Paystack/Hubtel) — checkout is
  fully validated and functional, but simulated.
- No automated tests yet, on either side.
