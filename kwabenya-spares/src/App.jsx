// ============================================================================
// KWABENYA SPARES — main application file.
//
// This is a SINGLE-FILE React app: every component, every helper function,
// and all of the demo data live in this one file. That's a deliberate choice
// (not a shortcut) — it's what lets the whole platform run as one artifact
// with zero build step, and it's also exactly what gets used as src/App.jsx
// in the real, installable Vite project.
//
// HOW TO READ THIS FILE (it's organized top to bottom in this order):
//   1. Imports
//   2. Mock data (stands in for the database until the Django API is wired up)
//   3. Helper functions (pure functions — no state, no UI)
//   4. React Context (the app's global "store")
//   5. Small shared UI pieces used by many screens (badges, toasts, dividers)
//   6. The route ticker (decorative header strip)
//   7. Header (logo, search, nav, cart button, role switcher)
//   8. HOME VIEW and everything on it (hero, how-it-works, category grid,
//      filter bar, product cards, the catalog grid)
//   9. SHOPS VIEW (shop directory + shop cards)
//  10. SHOP DETAIL VIEW (single shop page with map + fitter + its products)
//  11. PRODUCT DETAIL VIEW (single product page)
//  12. CART VIEW
//  13. CHECKOUT VIEW + ORDER CONFIRMATION VIEW
//  14. SELLER DASHBOARD (shop owner tools)
//  15. MECHANIC DASHBOARD (fitter's own duty-status screen)
//  16. ADMIN DASHBOARD (platform-wide overview)
//  17. FOOTER
//  18. MainContent — picks which view above to render
//  19. App — the root component: owns all state, wires up the Context, and
//      renders Header + ticker + MainContent + Footer + Toast
//
// A NOTE ON COMMENTING STYLE IN THIS FILE:
// Plain JavaScript lines (state, functions, calculations) get a `//` comment
// on or above the line, same as any commented JS file. JSX markup can't take
// a `//` comment on the same line — inside JSX, only `{/* like this */}` is
// valid, and only in positions where a child element is allowed (never
// inside an opening tag's own attribute list). So for JSX-heavy return
// blocks, every meaningful chunk of markup (each card, each button group,
// each conditional section) gets a `{/* ... */}` comment directly above it
// explaining what that chunk renders and why.
// ============================================================================

// React itself, plus the specific hooks this file uses:
//   useState      — local component state
//   useMemo       — cache an expensive calculation until its inputs change
//   useEffect     — run side effects (e.g. "when X changes, do Y")
//   useContext    — read values from the AppCtx context defined below
//   createContext — create that context in the first place
//   useRef        — hold a mutable value (here: a timer ID) that doesn't
//                   trigger a re-render when it changes
import React, { useState, useMemo, useEffect, useContext, createContext, useRef } from 'react';
import { api, unwrap, getToken, setToken } from './services/api';

// Icon components from lucide-react. Each one below is used somewhere in
// this file — grouped here so every icon the app can render is visible at a
// glance. (Filter is aliased to FilterIcon because `filter` is also a very
// common local variable/array-method name, and aliasing avoids any clash.)
import {
  Search, ShoppingCart, MapPin, PhoneCall, Clock, Wrench, X, Plus, Minus,
  ChevronRight, ChevronDown, Menu, User, Store, CheckCircle2, AlertCircle,
  SlidersHorizontal, ArrowLeft, Navigation, Package, Zap, Disc, Cog,
  CircleDot, MoveVertical, Frame, Lightbulb, Droplet, Star, Users,
  LayoutDashboard, Pencil, Trash2, Save, Bike, ShieldCheck, Loader2,
  ClipboardCheck, TrendingUp, Filter as FilterIcon, PlusCircle, MapPinned,
  Sun, Moon, LogOut
} from 'lucide-react';

/* ============================================================
   MOCK DATA — mirrors the PostgreSQL schema (categories, shops,
   mechanics nested per shop, products). Swap this block for real
   API calls later; every component reads only from context.
   ============================================================ */

// CATEGORIES: one row per spare-parts category. Mirrors the `categories`
// table in the schema (category_id, category_name). Every product below
// references one of these via its category_id, and the pegboard / filter UI
// is generated entirely from this array — add a category here and it
// automatically shows up everywhere categories are listed.
const CATEGORIES = [
  { category_id: 1, category_name: 'Engine Components' },
  { category_id: 2, category_name: 'Braking System' },
  { category_id: 3, category_name: 'Electricals' },
  { category_id: 4, category_name: 'Tires & Rims' },
  { category_id: 5, category_name: 'Suspension' },
  { category_id: 6, category_name: 'Body & Frame' },
  { category_id: 7, category_name: 'Lighting' },
  { category_id: 8, category_name: 'Filters & Fluids' },
];

// Map of category_id -> image filename under /images/ (served from public/).
const CATEGORY_IMAGES = {
  1: 'piston-kit-standard-bore.jfif',            // Engine Components
  2: 'front-brake-disc-rotor-220mm.jfif',        // Braking System
  3: '12v-motorcycle-battery.jfif',              // Electricals
  4: 'tubeless-tyre-90-90-18-rear.jfif',        // Tires & Rims
  5: 'front-fork-suspension-set.jfif',           // Suspension
  6: 'fuel-tank-steel.jfif',                     // Body & Frame
  7: 'led-headlight-bulb-h4.jfif',               // Lighting
  8: 'oil-filter.jfif',                          // Filters & Fluids
};


// resolveImageUrl: uploaded images come back as full https:// URLs (Cloudinary),
// while seeded images are bare filenames served from /public/images. Handle both.
function resolveImageUrl(url, categoryId) {
  if (!url) {
    const fallback = categoryId ? CATEGORY_IMAGES[categoryId] : null;
    return fallback ? `/images/${fallback}` : '';
  }
  if (url.startsWith('http')) return url;
  return `/images/${url}`;
}

// SHOPS_INIT: the starting value loaded into React state for every shop.
// Each object corresponds to one row of the `shops` table PLUS its
// one-to-one `mechanics` row nested inline as `mechanic` (in the real
// Postgres schema these are two separate tables joined by shop_id; nesting
// them here just keeps the mock data easy to read and pass around).
//
// Field-by-field meaning (same for every shop object below):
//   shop_id            — primary key, matches products' shop_id foreign key
//   shop_name          — public display name of the shop
//   owner_name         — the vendor/owner's name (shown as "Owner / Vendor")
//   contact_phone      — shop's phone number (used to build tel: links)
//   landmark_address   — human landmark description, no formal street address
//   latitude/longitude — decimal coordinates, used for the embedded map and
//                        the "Directions to shop" Google Maps link
//   opening_time/closing_time — 24-hour "HH:MM" strings
//   sunday_open        — whether the shop trades on Sundays at all
//   is_open_override   — a manual kill-switch: when false, the shop shows as
//                        CLOSED regardless of the clock (e.g. shop owner
//                        closes for a public holiday)
//   mechanic           — the shop's single assigned fitter:
//       mechanic_id       — primary key
//       full_name         — fitter's name
//       phone_number      — fitter's own phone (separate tel: link)
//       specialization    — free-text list of what they're skilled at
//       years_experience  — integer, shown as "N yrs experience"
//       is_on_duty        — Available / Busy toggle shown as a status pill
const SHOPS_INIT = [
  {
    // Shop 1 — Kwabenya Roundabout Motor Spares, owned by Kwame Owusu.
    // Opens 7am, closes 7pm, closed Sundays.
    shop_id: 1, shop_name: 'Kwabenya Roundabout Motor Spares', owner_name: 'Kwame Owusu',
    contact_phone: '024 411 2287', landmark_address: 'Kwabenya Roundabout, opposite Shell filling station',
    latitude: 5.6792, longitude: -0.2311, opening_time: '07:00', closing_time: '19:00',
    sunday_open: false, is_open_override: true,
    // Assigned fitter: Yaw Boateng, 6 years' experience, currently on duty.
    mechanic: { mechanic_id: 1, full_name: 'Yaw Boateng', phone_number: '020 555 1190', specialization: 'Engine Overhaul, Carburetor Tuning', years_experience: 6, is_on_duty: true },
  },
  {
    // Shop 2 — Ayi Mensah Bike Parts & Fitting, owned by Abena Sarpong.
    // Opens 7:30am, closes 6:30pm, closed Sundays.
    shop_id: 2, shop_name: 'Ayi Mensah Bike Parts & Fitting', owner_name: 'Abena Sarpong',
    contact_phone: '054 220 9981', landmark_address: 'Ayi Mensah junction, near the GIMPA road',
    latitude: 5.6647, longitude: -0.2038, opening_time: '07:30', closing_time: '18:30',
    sunday_open: false, is_open_override: true,
    // Assigned fitter: Kojo Mensah, 4 years' experience, currently BUSY (not on duty).
    mechanic: { mechanic_id: 2, full_name: 'Kojo Mensah', phone_number: '026 771 3345', specialization: 'Brake & Clutch Calibration', years_experience: 4, is_on_duty: false },
  },
  {
    // Shop 3 — Atomic Junction Cycle Center, owned by Fred Nii Armah.
    // Longest hours of any shop (6:30am–8pm) and the only one open Sundays.
    shop_id: 3, shop_name: 'Atomic Junction Cycle Center', owner_name: 'Fred Nii Armah',
    contact_phone: '050 903 4471', landmark_address: 'Atomic Junction, near the Total filling station',
    latitude: 5.6721, longitude: -0.2199, opening_time: '06:30', closing_time: '20:00',
    sunday_open: true, is_open_override: true,
    // Assigned fitter: Emmanuel Tetteh, 8 years' experience, currently on duty.
    mechanic: { mechanic_id: 3, full_name: 'Emmanuel Tetteh', phone_number: '059 214 8802', specialization: 'Electricals, Wiring & Battery Systems', years_experience: 8, is_on_duty: true },
  },
  {
    // Shop 4 — Haatso–Kwabenya Road Spares, owned by Comfort Adjei.
    // Opens 8am (the latest opener), closes 6pm, closed Sundays.
    shop_id: 4, shop_name: 'Haatso–Kwabenya Road Spares', owner_name: 'Comfort Adjei',
    contact_phone: '027 662 1183', landmark_address: 'Haatso–Kwabenya road, opposite Blue Bird Estate',
    latitude: 5.6755, longitude: -0.2265, opening_time: '08:00', closing_time: '18:00',
    sunday_open: false, is_open_override: true,
    // Assigned fitter: Isaac Owusu-Ansah, 3 years' experience, currently on duty.
    mechanic: { mechanic_id: 4, full_name: 'Isaac Owusu-Ansah', phone_number: '024 330 7762', specialization: 'Tire & Rim Alignment, Suspension', years_experience: 3, is_on_duty: true },
  },
  {
    // Shop 5 — Commandos Junction Parts Depot, owned by Nii Odartey Lamptey.
    // Opens 7am, closes 6pm, closed Sundays.
    shop_id: 5, shop_name: 'Commandos Junction Parts Depot', owner_name: 'Nii Odartey Lamptey',
    contact_phone: '055 118 4420', landmark_address: 'Commandos junction, Kwabenya',
    latitude: 5.6811, longitude: -0.2340, opening_time: '07:00', closing_time: '18:00',
    sunday_open: false, is_open_override: true,
    // Assigned fitter: Prince Asante, the most experienced (10 yrs), currently BUSY.
    mechanic: { mechanic_id: 5, full_name: 'Prince Asante', phone_number: '020 887 6621', specialization: 'Engine Overhaul, Body & Frame Repair', years_experience: 10, is_on_duty: false },
  },
  {
    // Shop 6 — Ogbojo Road Motor Spares, owned by Linda Asiedu.
    // Opens 7am, closes 7pm, and (like shop 3) also trades on Sundays.
    shop_id: 6, shop_name: 'Ogbojo Road Motor Spares', owner_name: 'Linda Asiedu',
    contact_phone: '059 442 1076', landmark_address: 'Ogbojo road, near the Kwabenya SDA church',
    latitude: 5.6698, longitude: -0.2158, opening_time: '07:00', closing_time: '19:00',
    sunday_open: true, is_open_override: true,
    // Assigned fitter: Solomon Tetteh, 5 years' experience, currently on duty.
    mechanic: { mechanic_id: 6, full_name: 'Solomon Tetteh', phone_number: '026 550 9934', specialization: 'Lighting & Electricals, Filters & Fluids', years_experience: 5, is_on_duty: true },
  },
];

// PRODUCTS_INIT: the starting value loaded into React state for every part
// listing. Mirrors the `products` table: each row has
//   product_id          — primary key
//   shop_id              — foreign key into SHOPS_INIT above (which shop sells it)
//   category_id          — foreign key into CATEGORIES above
//   part_name            — display name
//   description           — short blurb shown on the product detail page
//   compatible_models    — comma-separated free text of compatible bikes
//   price                — GH₵, stored as a plain number (formatted for
//                          display by formatGHS() below)
//   stock_quantity       — units on hand; drives the "Out of stock" button
//                          state and the seller dashboard's low-stock count
//
// The 20 rows below are grouped by shop (products 1–3 belong to shop 1,
// products 4–6 to shop 2, and so on) purely for readability — the app
// itself doesn't care about ordering, it filters/sorts this array freely.
const PRODUCTS_INIT = [
  // --- Shop 1: Kwabenya Roundabout Motor Spares (3 parts) ---
  { product_id: 1, shop_id: 1, category_id: 1, part_name: 'Piston Kit, Standard Bore', description: 'Complete piston, rings and gudgeon pin set, ready to fit.', compatible_models: 'Bajaj Boxer BM150, Bajaj Boxer CT100', price: 185, stock_quantity: 12 , image_url: 'piston-kit-standard-bore.jfif'},
  { product_id: 2, shop_id: 1, category_id: 1, part_name: 'Carburetor Assembly', description: 'Full carburetor assembly with jets pre-set for local fuel blends.', compatible_models: 'TVS HLX 125', price: 220, stock_quantity: 7 , image_url: 'carburetor-assembly.jfif'},
  { product_id: 3, shop_id: 1, category_id: 8, part_name: 'Air Filter Element', description: 'Foam air filter, cleans and re-oils for reuse.', compatible_models: 'TVS HLX 125', price: 28, stock_quantity: 33 , image_url: 'air-filter-element.jfif'},
  // --- Shop 2: Ayi Mensah Bike Parts & Fitting (3 parts, all Braking System) ---
  { product_id: 4, shop_id: 2, category_id: 2, part_name: 'Front Brake Disc Rotor 220mm', description: 'Universal 220mm floating disc rotor, drilled for cooling.', compatible_models: 'Bajaj Boxer, TVS HLX, Haojue HJ125', price: 95, stock_quantity: 20 , image_url: 'front-brake-disc-rotor-220mm.jfif'},
  { product_id: 5, shop_id: 2, category_id: 2, part_name: 'Brake Lever Set (Front & Rear)', description: 'Forged alloy lever pair, direct bolt-on fit.', compatible_models: 'Universal fit — most okada models', price: 45, stock_quantity: 30 },
  { product_id: 6, shop_id: 2, category_id: 2, part_name: 'Clutch Cable', description: 'Braided steel clutch cable with lubricated housing.', compatible_models: 'Haojue DK150', price: 30, stock_quantity: 40 , image_url: 'clutch-cable.jfif'},
  // --- Shop 3: Atomic Junction Cycle Center (3 parts, all Electricals) ---
  { product_id: 7, shop_id: 3, category_id: 3, part_name: '12V Motorcycle Battery', description: 'Maintenance-free sealed 12V battery, ships charged.', compatible_models: 'Universal 12V systems', price: 260, stock_quantity: 15 , image_url: '12v-motorcycle-battery.jfif'},
  { product_id: 8, shop_id: 3, category_id: 3, part_name: 'Wiring Harness, Full Loom', description: 'Complete replacement wiring loom, colour-coded connectors.', compatible_models: 'Bajaj Boxer BM150', price: 150, stock_quantity: 5 , image_url: 'wiring-harness-full-loom.jfif'},
  { product_id: 9, shop_id: 3, category_id: 3, part_name: 'CDI Ignition Unit', description: 'Capacitor discharge ignition module, direct replacement.', compatible_models: 'TVS Star City', price: 175, stock_quantity: 9 , image_url: 'cdi-ignition-unit.jfif'},
  // --- Shop 4: Haatso–Kwabenya Road Spares (4 parts: Tires & Rims, then Suspension) ---
  { product_id: 10, shop_id: 4, category_id: 4, part_name: 'Tubeless Tyre 90/90-18 Rear', description: 'Reinforced tread tubeless rear tyre for rough peri-urban roads.', compatible_models: 'Universal fit — 18" rear wheels', price: 210, stock_quantity: 22 , image_url: 'tubeless-tyre-90-90-18-rear.jfif'},
  { product_id: 11, shop_id: 4, category_id: 4, part_name: 'Alloy Rim, Front 17"', description: 'Lightweight cast alloy front rim, pre-balanced.', compatible_models: 'Universal fit — 17" front wheels', price: 340, stock_quantity: 6 , image_url: 'alloy-rim-front-17.jfif'},
  { product_id: 12, shop_id: 4, category_id: 5, part_name: 'Front Fork Suspension Set', description: 'Matched pair of front forks with fresh oil seals.', compatible_models: 'Bajaj Boxer BM150, Haojue HJ125', price: 480, stock_quantity: 4 , image_url: 'front-fork-suspension-set.jfif'},
  { product_id: 13, shop_id: 4, category_id: 5, part_name: 'Rear Shock Absorber Pair', description: 'Adjustable preload rear shocks, twin pack.', compatible_models: 'Universal fit — most okada models', price: 260, stock_quantity: 10 , image_url: 'rear-shock-absorber-pair.jfif'},
  // --- Shop 5: Commandos Junction Parts Depot (3 parts, all Body & Frame) ---
  { product_id: 14, shop_id: 5, category_id: 6, part_name: 'Fuel Tank, Steel', description: 'Powder-coated steel fuel tank, includes cap and tap.', compatible_models: 'Bajaj Boxer BM150', price: 390, stock_quantity: 3 , image_url: 'fuel-tank-steel.jfif'},
  { product_id: 15, shop_id: 5, category_id: 6, part_name: 'Side Mirror Pair', description: 'Folding side mirrors, standard 10mm thread.', compatible_models: 'Universal fit — most okada models', price: 40, stock_quantity: 60 , image_url: 'side-mirror-pair.jfif'},
  { product_id: 16, shop_id: 5, category_id: 6, part_name: 'Padded Seat Cover', description: 'Weatherproof padded seat cover, quick-fit clips.', compatible_models: 'Universal fit — most okada models', price: 55, stock_quantity: 25 , image_url: 'padded-seat-cover.jfif'},
  // --- Shop 6: Ogbojo Road Motor Spares (4 parts: Lighting + Filters & Fluids, interleaved) ---
  { product_id: 17, shop_id: 6, category_id: 7, part_name: 'Turn Signal Indicator Set', description: 'Set of four amber indicators with wiring pigtails.', compatible_models: 'Universal fit — most okada models', price: 48, stock_quantity: 35 , image_url: 'turn-signal-indicator-set.jfif'},
  { product_id: 18, shop_id: 6, category_id: 8, part_name: 'Engine Oil 20W-50, 1L', description: 'Mineral engine oil for high-mileage commercial riding.', compatible_models: 'Universal fit — all 4-stroke engines', price: 38, stock_quantity: 100 , image_url: 'engine-oil-20w-50-1l.jfif'},
  { product_id: 19, shop_id: 6, category_id: 8, part_name: 'Oil Filter', description: 'Genuine-spec oil filter, fits standard filter housing.', compatible_models: 'Haojue HJ125', price: 22, stock_quantity: 45 , image_url: 'oil-filter.jfif'},
  { product_id: 20, shop_id: 6, category_id: 7, part_name: 'LED Headlight Bulb H4', description: 'Bright white LED headlight bulb, plug-and-play.', compatible_models: 'Universal fit — most okada models', price: 65, stock_quantity: 50 , image_url: 'led-headlight-bulb-h4.jfif'},
];

/* ============================================================
   HELPERS — plain functions, no React/state involved. Every one
   of these takes plain data in and returns plain data (or a tiny
   bit of JSX for CategoryIcon) out. Used all over the components
   below.
   ============================================================ */

// formatGHS: turns a plain number (e.g. 185) into a Ghana-Cedi display
// string (e.g. "GH₵185.00"). Number(n) guards against n arriving as a
// string (e.g. straight from a form input); toFixed(2) always shows two
// decimal places, matching the DECIMAL(10,2) price column in the schema.
function formatGHS(n) {
  return `GH₵${Number(n).toFixed(2)}`;
}

// isShopOpenNow: the single source of truth for every OPEN/CLOSED badge in
// the app. Takes a shop object and (optionally) a Date to check against —
// defaulting to the real current time — and returns a plain boolean.
function isShopOpenNow(shop, now = new Date()) {
  if (!shop) return false; // no shop passed in (e.g. product's shop was deleted) -> treat as closed
  if (!shop.is_open_override) return false; // owner has manually force-closed the shop
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  if (day === 0 && !shop.sunday_open) return false; // it's Sunday and this shop doesn't open Sundays
  // Split "HH:MM" strings into [hours, minutes] number pairs.
  const [oh, om] = shop.opening_time.split(':').map(Number);
  const [ch, cm] = shop.closing_time.split(':').map(Number);
  // Convert everything to "minutes since midnight" so opening/closing/now
  // can be compared as plain numbers instead of juggling Date objects.
  const openMins = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  // Open if the current time falls on or after opening AND strictly before
  // closing. (This simple comparison assumes closing time is later in the
  // same day than opening time, which holds for every shop in the mock data.)
  return nowMins >= openMins && nowMins < closeMins;
}

// formatHours: turns a shop's 24-hour opening/closing strings into the
// human-readable line shown on shop cards, e.g. "Mon–Sat: 7 AM – 7 PM".
function formatHours(shop) {
  // Local helper: converts one "HH:MM" 24-hour string to 12-hour "H:MM AM/PM".
  const to12 = (t) => {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12; // 0 or 12 in 24h -> 12 in 12h format
    // Omit the ":00" minutes when the time lands exactly on the hour, so
    // "7:00 AM" reads as the cleaner "7 AM".
    return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
  };
  const days = shop.sunday_open ? 'Mon–Sun' : 'Mon–Sat'; // which days the hours below apply to
  return `${days}: ${to12(shop.opening_time)} – ${to12(shop.closing_time)}`;
}

// CATEGORY_ICON_MAP: links each category_id to the lucide-react icon that
// represents it visually (engine -> Cog, brakes -> Disc, and so on).
const CATEGORY_ICON_MAP = { 1: Cog, 2: Disc, 3: Zap, 4: CircleDot, 5: MoveVertical, 6: Frame, 7: Lightbulb, 8: Droplet };

// CategoryIcon: small wrapper component so the rest of the app can render
// "the icon for category X" with one line instead of repeating the lookup
// logic everywhere. Falls back to a generic Package icon if categoryId
// doesn't match anything in the map above (e.g. a category was deleted).
function CategoryIcon({ categoryId, size = 20, className = '', strokeWidth }) {
  const Icon = CATEGORY_ICON_MAP[categoryId] || Package; // pick the icon component (or fallback)
  return <Icon size={size} className={className} strokeWidth={strokeWidth} />; // render it like any other icon
}

// telHref: builds a `tel:` link from a Ghanaian local-format phone number
// (e.g. "024 411 2287") so "Call shop" / "Call fitter" buttons actually
// dial on a phone. Strips whitespace, drops the leading 0, and prefixes
// Ghana's country code (+233) so the link works internationally too.
function telHref(phone) {
  return `tel:+233${phone.replace(/\s+/g, '').replace(/^0/, '')}`;
}

// directionsUrl: builds a Google Maps turn-by-turn directions link from a
// shop's coordinates. Opening this URL launches the Google Maps app on
// mobile (or the web app on desktop) with directions already pre-filled —
// this satisfies the spec's "Directions to Shop" requirement with no API
// key needed.
function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// mapEmbedUrl: builds a Google Maps *embed* URL (for the <iframe> on the
// shop detail page) from the same coordinates. This is the "show a little
// map right on the page" link, as opposed to directionsUrl's "open Maps and
// navigate there" link above. Also needs no API key.
function mapEmbedUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
}

// __idCounter / nextId: a tiny fake "auto-increment primary key" generator
// for demo data created at runtime (i.e. new products a seller adds
// through the dashboard). Starts at 1000 so new IDs never collide with the
// product_id values 1–20 already used in PRODUCTS_INIT above. In the real
// backend this job is done by Postgres's SERIAL column instead.
let __idCounter = 1000;
function nextId() { __idCounter += 1; return __idCounter; }

// --- API <-> local-shape adapters -----------------------------------------
// The Django API uses snake_case field names that mostly match the mock data,
// but ids are nested objects and some optional fields differ. These two
// helpers keep every component in this file working with one stable shape.

function mapApiShop(s) {
  const mech = (s.mechanics && s.mechanics[0]) || null;
  return {
    shop_id: s.id,
    owner_id: s.owner,
    shop_name: s.shop_name,
    owner_name: s.owner_name || 'Shop owner',
    contact_phone: s.owner_phone || '',
    landmark_address: s.landmark_address || '',
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    opening_time: (s.opening_time || '07:00').slice(0, 5),
    closing_time: (s.closing_time || '19:00').slice(0, 5),
    // The backend does not store a separate Sunday flag; treat every shop as
    // trading on Sunday so the hours calculation stays optimistic.
    sunday_open: true,
    is_open_override: s.is_open_override !== false,
    is_open_now: s.is_open_now,
    mechanic: mech ? {
      mechanic_id: mech.id,
      user_id: mech.user,
      full_name: mech.full_name,
      phone_number: mech.phone_number,
      specialization: mech.specialization,
      years_experience: mech.years_experience,
      is_on_duty: mech.is_on_duty,
    } : {
      mechanic_id: null,
      user_id: null,
      full_name: 'No fitter assigned',
      phone_number: '',
      specialization: 'Ask the shop for fitting support',
      years_experience: 0,
      is_on_duty: false,
    },
  };
}

function mapApiProduct(p) {
  return {
    product_id: p.id,
    shop_id: p.shop?.id ?? p.shop,
    category_id: p.category?.id ?? p.category ?? null,
    part_name: p.part_name,
    description: p.description || '',
    compatible_models: p.compatible_models || 'Universal fit',
    price: Number(p.price),
    stock_quantity: p.stock_quantity,
    image_url: p.image_url || '',
  };
}

// mapApiOrder: converts an order from the API into the shape the
// confirmation screen already understands.
function mapApiOrder(order) {
  return {
    id: order.id,
    orderId: `KS-${order.id}`,
    status: order.status,
    total: Number(order.total),
    shop_name: order.shop_name,
    items: (order.items || []).map((item) => ({
      productId: item.product,
      qty: item.quantity,
      product: {
        product_id: item.product,
        part_name: item.product_name,
        image_url: item.image_url || '',
        price: Number(item.unit_price),
      },
    })),
    customer: {
      name: order.contact_name,
      phone: order.contact_phone,
      landmark: order.notes,
      payment: order.payment_method,
    },
    placedAt: order.created_at,
  };
}

/* ============================================================
   APP CONTEXT — the app's single global "store". Every screen
   reads shops/products/cart/etc. from here instead of receiving
   them as props, which avoids threading the same values through
   a dozen layers of components by hand.
   ============================================================ */

// AppCtx: the actual React Context object. Starts as null; it's only ever
// used through the useApp() hook below, and only ever gets a real value
// once <App> mounts and wraps everything in <AppCtx.Provider>.
const AppCtx = createContext(null);

// useApp: shorthand hook so every component below can write
// `const { shops, cart, navigate } = useApp();` instead of importing
// useContext and AppCtx separately every time.
function useApp() { return useContext(AppCtx); }

/* ============================================================
   SMALL SHARED UI PIECES — reused across many different views.
   ============================================================ */

// StatusPill: the small OPEN/CLOSED, AVAILABLE/BUSY badge used everywhere
// a shop or fitter's live status needs to show. `ok` picks which of the two
// labels/colors to show; `size` switches between the compact "sm" badge
// used on cards and the slightly bigger "md" badge used on detail pages.
function StatusPill({ ok, onLabel, offLabel, size = 'sm' }) {
  const sizing = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1'; // padding varies by size, font size does not
  return (
    // Green styling when ok is true, red styling when ok is false — chosen
    // entirely with a ternary inside the className string.
    <span className={`${sizing} rounded-sm font-mono font-semibold tracking-wide ${ok ? 'bg-green-950 text-green-400 ring-1 ring-green-800' : 'bg-red-950 text-red-400 ring-1 ring-red-800'}`}>
      {ok ? onLabel : offLabel /* show whichever label matches the current state */}
    </span>
  );
}

// Toast: the small floating confirmation message ("Added to cart", "Order
// placed", etc.) that appears at the bottom of the screen. Reads its
// message from context — showToast() (defined later, in App) is what sets
// that message and clears it again a couple of seconds later.
function Toast() {
  const { toast } = useApp(); // current toast message, or null if none is showing
  if (!toast) return null; // render nothing at all when there's no active toast
  return (
    // "toast-in" is a custom CSS class (defined in the <style> block near
    // the bottom of this file) that plays a small fade/slide-in animation.
    <div className="toast-in fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-stone-100 text-stone-950 px-4 py-2.5 rounded-sm shadow-xl flex items-center gap-2 text-sm font-medium">
      <CheckCircle2 size={16} className="text-green-600" /> {/* success checkmark icon */}
      {toast} {/* the actual message text */}
    </div>
  );
}

// DashedRule: a thin horizontal "road markings" divider used once, between
// the How It Works section and the category pegboard on the home page.
// Built with a repeating-linear-gradient background (set via the `style`
// prop, i.e. real inline CSS) rather than a Tailwind class, since this
// exact dash pattern isn't one of Tailwind's built-in utilities.
function DashedRule({ className = '' }) {
  return (
    <div
      className={`w-full opacity-70 ${className}`}
      style={{ height: '3px', backgroundImage: 'repeating-linear-gradient(90deg, #ea580c 0px, #ea580c 18px, transparent 18px, transparent 34px)' }}
    />
  );
}

// SectionLabel: the small "eyebrow" caption + big heading pairing used to
// title every major section (e.g. eyebrow "The route", heading "How it
// works"). `eyebrow` is optional — if it's falsy, that line is skipped
// entirely rather than rendering an empty div.
function SectionLabel({ eyebrow, title }) {
  return (
    <div className="mb-5">
      {eyebrow && <div className="font-mono text-xs tracking-widest text-orange-600 uppercase mb-1">{eyebrow}</div>}
      <h2 className="font-display text-3xl sm:text-4xl tracking-wide text-stone-100">{title}</h2>
    </div>
  );
}

/* ============================================================
   ROUTE TICKER — signature element (trotro destination board)
   ============================================================ */

// RouteTicker: the scrolling orange strip under the header that lists every
// shop name, styled after the hand-painted destination boards on Accra's
// trotro (minibus) vehicles. Purely decorative/branding — it doesn't
// respond to clicks.
function RouteTicker() {
  const { shops } = useApp(); // need the shop list to build the scrolling text
  // Join every shop's (uppercased) name with a ✦ separator into one long string.
  const items = shops.map((s) => s.shop_name.toUpperCase()).join('   ✦   ');
  // Duplicate that string so the CSS marquee animation (which slides the
  // track left by exactly 50% of its width, see .ticker-track in the
  // <style> block) loops seamlessly with no visible jump or gap.
  const doubled = `${items}   ✦   ${items}   ✦   `;
  return (
    <div className="bg-orange-600 text-stone-950 overflow-hidden border-y-2 border-stone-950">
      {/* ticker-track is the element the CSS keyframe animation slides */}
      <div className="ticker-track whitespace-nowrap py-1.5 font-mono text-xs font-bold tracking-wide">
        <span className="px-4">{doubled}</span> {/* first copy of the looped text */}
        <span className="px-4">{doubled}</span> {/* second copy, immediately after, for the seamless loop */}
      </div>
    </div>
  );
}

/* ============================================================
   HEADER
   ============================================================ */

// ROLE_LABELS: human-readable label shown in the role-switcher dropdown for
// each internal role code. This is a DEMO login switcher, not real
// authentication — see the note on the `role` state in App() further down.
const ROLE_LABELS = { RIDER: 'Rider', SELLER: 'Shop owner', MECHANIC: 'Fitter', ADMIN: 'Admin' };
// ROLE_VIEW: which dashboard `view` name each non-rider role should jump to
// when selected (riders have no dashboard, so RIDER isn't listed here).
const ROLE_VIEW = { SELLER: 'seller', MECHANIC: 'mechanic', ADMIN: 'admin' };

function Header() {
  // Pull everything this component needs straight out of global context.
  const { navigate, view, cartCount, searchQuery, setSearchQuery, auth, notifications, theme, toggleTheme, logout, showToast, clearCart } = useApp();
  const unreadCount = (notifications || []).filter((n) => !n.is_read).length;
  // The role is always derived from the authenticated account — guests are
  // riders only, and there is no UI control that can change it.
  const signedInRole = auth?.user?.role || 'RIDER';
  const dashboardView = auth?.user ? ROLE_VIEW[signedInRole] : null;
  const [mobileOpen, setMobileOpen] = useState(false); // is the mobile hamburger menu open?
  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);
  // Close on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);
  // Close on route change.
  useEffect(() => { setMobileOpen(false); }, [view]);
  // localQuery is a *draft* copy of the search box text — kept separate
  // from the real (global) searchQuery so typing doesn't re-filter the
  // whole catalog on every keystroke; it only commits on Enter/"Go".
  const [localQuery, setLocalQuery] = useState(searchQuery);

  // If searchQuery changes from somewhere else (there's currently nowhere
  // else it does, but this keeps the header in sync if that ever changes),
  // mirror that value into the local draft box too.
  useEffect(() => setLocalQuery(searchQuery), [searchQuery]);

  // runSearch: commits the draft search text to the real global search
  // state, jumps to the home/catalog view if we're not already there (so
  // the results are visible), and closes the mobile menu if it was open.
  const runSearch = () => {
    setSearchQuery(localQuery);
    if (view !== 'home') navigate('home');
    setMobileOpen(false);
  };

  // navLinkClass: returns the Tailwind classes for a nav link, highlighting
  // it in orange when `v` matches the view currently being shown.
  const navLinkClass = (v) => `text-sm font-semibold tracking-wide transition-colors ${view === v ? 'text-orange-600' : 'text-stone-300 hover:text-stone-100'}`;

  return (
    // sticky + z-50 keeps the header pinned to the top of the viewport while scrolling.
    <header className="sticky top-0 z-50 bg-stone-950 border-b border-stone-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-4 h-16">
          {/* Logo / home button — clicking the wordmark always returns to the catalog */}
          <button onClick={() => navigate('home')} className="flex items-center gap-2 shrink-0">
            <span className="bg-orange-600 p-1.5 rounded-sm"><Bike size={20} className="text-stone-950" strokeWidth={2.5} /></span>
            <span className="leading-none">
              <span className="block font-display text-xl tracking-wider text-stone-100">KWABENYA SPARES</span>
              <span className="hidden sm:block font-mono text-xs tracking-widest text-stone-500 uppercase">Parts &amp; Fitters, Accra</span>
            </span>
          </button>

          {/* Desktop nav links — hidden below the md breakpoint (mobile uses the hamburger menu instead) */}
          <nav className="hidden md:flex items-center gap-6 ml-4">
            <button onClick={() => navigate('home')} className={navLinkClass('home')}>Catalog</button>
            <button onClick={() => navigate('shops')} className={navLinkClass('shops')}>Shops</button>
            {auth?.user && <button onClick={() => navigate('enquiries')} className={navLinkClass('enquiries')}>Enquiries</button>}
            {/* Dashboard link only appears for an authenticated non-rider account */}
            {dashboardView && (
              <button onClick={() => navigate(dashboardView)} className={navLinkClass(dashboardView)}>Dashboard</button>
            )}
          </nav>

          {/* Desktop search box — also hidden on mobile, which gets its own copy inside the hamburger menu below */}
          <div className="hidden md:flex flex-1 max-w-md ml-4">
            <div className="flex items-center w-full bg-stone-800 border border-stone-800 rounded-sm focus-within:border-orange-600 transition-colors">
              <Search size={16} className="ml-3 text-stone-500 shrink-0" />
              <input
                value={localQuery} // controlled input — value always mirrors localQuery state
                onChange={(e) => setLocalQuery(e.target.value)} // update the draft as the person types
                onKeyDown={(e) => e.key === 'Enter' && runSearch()} // pressing Enter commits the search
                placeholder="Search parts, models, shops…"
                className="bg-transparent px-2 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none w-full"
              />
              <button onClick={runSearch} className="px-3 py-2 text-xs font-mono uppercase text-orange-600 hover:text-orange-500">Go</button>
            </div>
          </div>

          {/* Right-hand icon cluster: role badge, notifications, account, cart, menu */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Read-only role badge — role comes from the signed-in account,
                never from a user-selectable switcher. */}
            <span
              className="hidden sm:flex items-center bg-stone-800 border border-stone-800 text-stone-300 text-xs font-mono rounded-sm px-2 py-2"
              title="Your role is set by the account you signed in with"
            >
              Viewing as: {auth?.user ? ROLE_LABELS[signedInRole] : 'Rider (guest)'}
            </span>

            {/* Notifications bell — shows unread activity from orders/reviews */}
            <button onClick={() => navigate('notifications')} className="relative p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-stone-800 hover:bg-stone-700 rounded-sm border border-stone-800 transition-colors" title="Notifications">
              <AlertCircle size={18} className="text-stone-100" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-orange-600 text-stone-950 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{unreadCount}</span>
              )}
            </button>

            {/* Real account button — login/register or the signed-in user's name */}
            <button onClick={() => navigate('account')} className="hidden sm:flex items-center gap-2 px-3 py-2.5 bg-stone-800 hover:bg-stone-700 rounded-sm border border-stone-800 transition-colors text-stone-100 text-xs font-semibold">
              <User size={16} />
              {auth?.user ? (auth.user.first_name || auth.user.username) : 'Sign in'}
            </button>

            {/* Logout button — only when signed in */}
            {auth?.user && (
              <button onClick={async () => { await logout(); clearCart(); showToast('Signed out'); navigate('home'); setMobileOpen(false); }} className="hidden sm:flex items-center gap-2 px-3 py-2.5 bg-stone-800 hover:bg-stone-700 rounded-sm border border-stone-800 transition-colors text-stone-100 text-xs font-semibold" title="Sign out">
                <LogOut size={16} /> Sign out
              </button>
            )}

            {/* Cart button — shows a small badge with the item count when the cart isn't empty */}
            <button onClick={() => navigate('cart')} className="relative p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-stone-800 hover:bg-stone-700 rounded-sm border border-stone-800 transition-colors">
              <ShoppingCart size={18} className="text-stone-100" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-orange-600 text-stone-950 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{cartCount}</span>
              )}
            </button>

            {/* Light/dark theme toggle — sits beside the cart */}
            <button onClick={toggleTheme} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-stone-800 hover:bg-stone-700 rounded-sm border border-stone-800 transition-colors" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={18} className="text-stone-100" /> : <Moon size={18} className="text-stone-100" />}
            </button>

            {/* Hamburger toggle — only visible below the md breakpoint */}
            <button onClick={() => setMobileOpen((v) => !v)} className="md:hidden p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-stone-800 hover:bg-stone-700 rounded-sm border border-stone-800">
              <Menu size={18} className="text-stone-100" />
            </button>
          </div>
        </div>

        {/* Mobile full-screen menu overlay — covers the whole page, solid
            background, scrollable, with a close button in the header spot. */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-[60] bg-stone-950 flex flex-col overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800">
              <span className="font-display text-xl tracking-wider text-stone-100">KWABENYA SPARES</span>
              <button onClick={() => setMobileOpen(false)} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-stone-800 hover:bg-stone-700 rounded-sm border border-stone-800" aria-label="Close menu">
                <X size={18} className="text-stone-100" />
              </button>
            </div>
            <div className="flex flex-col gap-3 px-4 py-4">
              {/* Mobile copy of the search box */}
              <div className="flex items-center bg-stone-800 border border-stone-800 rounded-sm">
                <Search size={16} className="ml-3 text-stone-500" />
                <input
                  value={localQuery}
                  onChange={(e) => setLocalQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="Search parts, models, shops…"
                  className="bg-transparent px-2 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none w-full"
                />
                <button onClick={runSearch} className="px-3 text-xs font-mono uppercase text-orange-600">Go</button>
              </div>
              {/* Mobile nav links */}
              <div className="flex flex-col gap-1">
                <button onClick={() => { navigate('home'); setMobileOpen(false); }} className="text-left py-2 text-sm font-semibold text-stone-300">Catalog</button>
                <button onClick={() => { navigate('shops'); setMobileOpen(false); }} className="text-left py-2 text-sm font-semibold text-stone-300">Shops</button>
                <button onClick={() => { navigate('notifications'); setMobileOpen(false); }} className="text-left py-2 text-sm font-semibold text-stone-300">Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}</button>
              {auth?.user && <button onClick={() => { navigate('enquiries'); setMobileOpen(false); }} className="text-left py-2 text-sm font-semibold text-stone-300">Enquiries</button>}
                <button onClick={() => { navigate('account'); setMobileOpen(false); }} className="text-left py-2 text-sm font-semibold text-stone-300">{auth?.user ? `Account (${auth.user.username})` : 'Sign in / Register'}</button>
                {dashboardView && <button onClick={() => { navigate(dashboardView); setMobileOpen(false); }} className="text-left py-2 text-sm font-semibold text-stone-300">Dashboard</button>}
                {auth?.user && (
                  <button onClick={async () => { await logout(); clearCart(); showToast('Signed out'); navigate('home'); setMobileOpen(false); }} className="text-left py-2 text-sm font-semibold text-stone-300">Sign out</button>
                )}
              </div>
              <button onClick={() => { toggleTheme(); setMobileOpen(false); }} className="text-left py-2 text-sm font-semibold text-stone-300">{theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</button>
              <p className="text-xs font-mono text-stone-500 uppercase tracking-widest">Viewing as: {auth?.user ? ROLE_LABELS[signedInRole] : 'Rider (guest)'}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

/* ============================================================
   HOME VIEW
   ============================================================ */

// Hero: the big banner at the top of the home page — headline, subheading,
// two call-to-action buttons, and a row of live stats computed from the
// actual shops/products arrays (so the numbers never go stale as data changes).
function Hero() {
  const { shops, products, navigate } = useApp(); // need shops/products for the live stat counts, navigate for the buttons
  return (
    <div className="bg-gradient-to-b from-stone-900 to-stone-950 border-b border-stone-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Small orange "eyebrow" line above the headline */}
        <div className="font-mono text-xs tracking-widest text-orange-600 uppercase mb-3">Kwabenya · Accra · Genuine &amp; compatible parts</div>
        {/* Big display headline, split across three lines with the last line in orange */}
        <h1 className="font-display text-5xl sm:text-6xl md:text-7xl leading-none tracking-wide text-stone-100 max-w-3xl">
          FIND THE PART.<br />MEET THE FITTER.<br /><span className="text-orange-600">GET BACK ON THE ROAD.</span>
        </h1>
        {/* Supporting one-line pitch under the headline */}
        <p className="text-stone-300 max-w-lg mt-5 text-sm sm:text-base">
          Every Kwabenya spare parts shop on one board — with the fitter who'll install it, their duty status, and directions straight to the stall.
        </p>
        {/* Two call-to-action buttons */}
        <div className="flex flex-wrap gap-3 mt-7">
          {/* "Browse parts" smooth-scrolls down to the #catalog grid instead of navigating anywhere */}
          <button onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })} className="bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-sm uppercase tracking-wide px-5 py-3 rounded-sm transition-colors">
            Browse parts
          </button>
          {/* "View all shops" jumps to the Shops directory view */}
          <button onClick={() => navigate('shops')} className="border border-stone-700 hover:border-stone-500 text-stone-100 font-bold text-sm uppercase tracking-wide px-5 py-3 rounded-sm transition-colors">
            View all shops
          </button>
        </div>
        {/* Live stat row — every number here is derived from real state, not hardcoded */}
        <div className="flex flex-wrap gap-x-8 gap-y-3 mt-10 font-mono text-xs text-stone-400">
          <span><span className="text-stone-100 text-base font-bold">{shops.length}</span> shops</span>
          <span><span className="text-stone-100 text-base font-bold">{shops.length}</span> assigned fitters</span>
          <span><span className="text-stone-100 text-base font-bold">{products.length}</span> parts listed</span>
          {/* Filters the shop list live through isShopOpenNow() to count only currently-open shops */}
          <span><span className="text-stone-100 text-base font-bold">{shops.filter((s) => isShopOpenNow(s)).length}</span> open right now</span>
        </div>
      </div>
    </div>
  );
}

// HowItWorks: the static 3-step explainer section ("Search & compare" ->
// "Reserve or order" -> "Fitter installs it"). Genuinely a sequence, so it's
// the one place in the app that uses numbered steps.
function HowItWorks() {
  // Plain local array (not app data — this never changes, so it lives right
  // here instead of up with CATEGORIES/SHOPS_INIT/PRODUCTS_INIT).
  const steps = [
    { n: '01', title: 'Search & compare', body: "Filter by part, motorcycle model, category or shop until you find the right fit and price." },
    { n: '02', title: 'Reserve or order', body: 'Pay by MTN MoMo, Telecel Cash, or choose cash on pickup — whichever is easier at the stall.' },
    { n: '03', title: 'Fitter installs it', body: "The shop's assigned fitter handles the install on-site, same day, no guesswork." },
  ];
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <SectionLabel eyebrow="The route" title="How it works" />
      {/* Three-column grid on larger screens, stacks to one column on mobile */}
      <div className="grid sm:grid-cols-3 gap-4">
        {/* One card per entry in the steps array above */}
        {steps.map((s) => (
          <div key={s.n} className="bg-stone-900 border border-stone-800 rounded-sm p-5">
            <span className="font-mono text-orange-600 text-2xl font-bold">{s.n}</span>
            <h3 className="text-stone-100 font-bold mt-2 mb-1">{s.title}</h3>
            <p className="text-stone-400 text-sm leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// CategoryPegboard: the row of clickable category icons under the "Shop by
// category" heading. Clicking one toggles it in/out of the active category
// filter set and scrolls down to the catalog grid to show the (now
// filtered) results.
function CategoryPegboard() {
  const { filters, setFilters } = useApp(); // need the current filter state and its setter

  // toggle: adds categoryId to filters.categoryIds if it isn't already
  // there, or removes it if it is — then scrolls to the catalog so the
  // person immediately sees the effect of their click.
  const toggle = (id) => {
    setFilters((f) => {
      const has = f.categoryIds.includes(id);
      return { ...f, categoryIds: has ? f.categoryIds.filter((c) => c !== id) : [...f.categoryIds, id] };
    });
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
      <SectionLabel eyebrow="The pegboard" title="Shop by category" />
      {/* Responsive grid: 2 columns on phones, up to 8 (i.e. one row) on large screens */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* One button per category in CATEGORIES — adding a category to that
            array automatically adds a tile here with no other code changes. */}
        {CATEGORIES.map((c) => {
          const active = filters.categoryIds.includes(c.category_id); // is this category currently selected?
          return (
            <button
              key={c.category_id}
              onClick={() => toggle(c.category_id)}
              // Solid orange styling when active, subtle dark styling otherwise
              className={`flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-sm border transition-colors ${active ? 'bg-orange-600 border-orange-600 text-stone-950' : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-orange-600'}`}
            >
              <CategoryIcon categoryId={c.category_id} size={22} strokeWidth={1.75} />
              <span className="text-xs font-mono uppercase text-center leading-tight">{c.category_name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ProductCard: the reusable product tile used in every grid of products
// (home catalog, shop detail page, etc). Shows the part's category icon,
// name, compatible models, price, the parent shop's live open/closed
// status, the shop name, and an Add to cart button.
function ProductCard({ product }) {
  const { shops, navigate, addToCart } = useApp();
  const shop = shops.find((s) => s.shop_id === product.shop_id); // look up this product's parent shop
  const open = isShopOpenNow(shop); // is that shop open right now?
  const category = CATEGORIES.find((c) => c.category_id === product.category_id); // look up the category name for the small label
  return (
    <div className="group bg-stone-900 border border-stone-800 rounded-sm overflow-hidden hover:border-orange-600 transition-colors flex flex-col">
      {/* The whole top portion of the card (image + text) is one big button
          that navigates to the product detail page when clicked */}
      <button onClick={() => navigate('productDetail', { productId: product.product_id })} className="text-left flex flex-col flex-1">
        {/* Product image from /images (served from public/) with a gradient fallback */}
        <div className="h-28 bg-gradient-to-br from-stone-800 to-stone-900 flex items-center justify-center overflow-hidden">
          <img src={resolveImageUrl(product.image_url, product.category_id)} alt={category?.category_name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
        <div className="p-3 flex flex-col gap-1 flex-1">
          <span className="text-xs uppercase tracking-wider text-stone-500 font-mono">{category?.category_name}</span>
          {/* line-clamp-2 caps the title at two lines no matter how long the part name is */}
          <h3 className="text-stone-100 font-semibold text-sm leading-snug line-clamp-2">{product.part_name}</h3>
          {/* line-clamp-1 keeps the compatible-models line to one row */}
          <p className="text-stone-400 text-xs line-clamp-1">{product.compatible_models}</p>
          {/* mt-auto pushes this price+status row to the bottom of the card even when the text above is short */}
          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="font-mono text-orange-600 font-bold text-sm">{formatGHS(product.price)}</span>
            <StatusPill ok={open} onLabel="OPEN" offLabel="CLOSED" />
          </div>
          <span className="text-xs text-stone-500 truncate">{shop?.shop_name}</span>
        </div>
      </button>
      {/* Add to cart button — separate from the button above so clicking it
          doesn't also trigger navigation to the detail page */}
      <button
        onClick={() => addToCart(product.product_id, 1)}
        disabled={product.stock_quantity === 0} // can't add an out-of-stock part
        className="m-3 mt-0 bg-orange-600 hover:bg-orange-500 disabled:bg-stone-700 disabled:text-stone-600 disabled:cursor-not-allowed text-stone-950 font-bold text-xs uppercase tracking-wide py-2 rounded-sm transition-colors flex items-center justify-center gap-1.5"
      >
        <ShoppingCart size={13} /> {product.stock_quantity === 0 ? 'Out of stock' : 'Add to cart'}
      </button>
    </div>
  );
}

// FilterBar: the shop / price-range / sort-order controls shown above the
// catalog grid, plus the row of removable "chips" for any active category
// filters (the categories themselves are toggled from CategoryPegboard
// above, not from this bar — this bar just displays and clears them).
function FilterBar() {
  const { filters, setFilters, shops } = useApp();
  const [open, setOpen] = useState(false); // is the filter panel expanded? (only matters on mobile, where it's collapsible)

  // clear: resets every filter field back to its default "no filter applied" value.
  const clear = () => setFilters({ categoryIds: [], shopId: 'all', minPrice: '', maxPrice: '', sort: 'relevance' });

  // activeCount: how many distinct filters are currently applied, used to
  // show "(N)" next to the mobile "Filters" toggle and to decide whether
  // the "Clear filters" button should render at all.
  const activeCount = filters.categoryIds.length + (filters.shopId !== 'all' ? 1 : 0) + (filters.minPrice ? 1 : 0) + (filters.maxPrice ? 1 : 0);

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-sm mb-5">
      {/* Mobile-only toggle header — hidden entirely on sm and above, where the filters are always visible */}
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 sm:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold text-stone-100"><SlidersHorizontal size={15} className="text-orange-600" /> Filters {activeCount > 0 && `(${activeCount})`}</span>
        <ChevronDown size={16} className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} /> {/* arrow flips upside-down when expanded */}
      </button>

      {/* The actual filter controls: hidden on mobile unless `open` is true, always shown (flex) from sm upward */}
      <div className={`${open ? 'flex' : 'hidden'} sm:flex flex-wrap items-end gap-4 px-4 py-4`}>
        {/* Shop filter dropdown */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono uppercase text-stone-500">Shop</label>
          <select
            value={filters.shopId}
            // "all" stays a string; any real shop id gets converted back to a Number (since <select> values are always strings)
            onChange={(e) => setFilters((f) => ({ ...f, shopId: e.target.value === 'all' ? 'all' : Number(e.target.value) }))}
            className="bg-stone-800 border border-stone-800 text-stone-100 text-xs rounded-sm px-2 py-2 outline-none w-40"
          >
            <option value="all" className="bg-stone-950">All shops</option>
            {shops.map((s) => <option key={s.shop_id} value={s.shop_id} className="bg-stone-950">{s.shop_name}</option>)}
          </select>
        </div>
        {/* Minimum price input */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono uppercase text-stone-500">Min price (GH₵)</label>
          <input type="number" min="0" value={filters.minPrice} onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))} placeholder="0" className="bg-stone-800 border border-stone-800 text-stone-100 text-xs rounded-sm px-2 py-2 outline-none w-24" />
        </div>
        {/* Maximum price input */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono uppercase text-stone-500">Max price (GH₵)</label>
          <input type="number" min="0" value={filters.maxPrice} onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))} placeholder="500" className="bg-stone-800 border border-stone-800 text-stone-100 text-xs rounded-sm px-2 py-2 outline-none w-24" />
        </div>
        {/* Sort order dropdown */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono uppercase text-stone-500">Sort by</label>
          <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))} className="bg-stone-800 border border-stone-800 text-stone-100 text-xs rounded-sm px-2 py-2 outline-none">
            <option value="relevance" className="bg-stone-950">Relevance</option>
            <option value="price-asc" className="bg-stone-950">Price: Low to High</option>
            <option value="price-desc" className="bg-stone-950">Price: High to Low</option>
            <option value="name" className="bg-stone-950">Name A–Z</option>
          </select>
        </div>
        {/* "Clear filters" only appears once at least one filter is active */}
        {activeCount > 0 && (
          <button onClick={clear} className="text-xs font-mono uppercase text-orange-600 hover:text-orange-500 flex items-center gap-1 pb-2"><X size={12} /> Clear filters</button>
        )}
      </div>

      {/* Row of removable chips, one per currently-selected category filter */}
      {filters.categoryIds.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {filters.categoryIds.map((id) => {
            const cat = CATEGORIES.find((c) => c.category_id === id); // look up the display name for this category id
            return (
              <span key={id} className="flex items-center gap-1 bg-orange-950 text-orange-600 text-xs font-mono px-2 py-1 rounded-sm">
                {cat?.category_name}
                {/* Clicking the X removes just this one category from the filter set */}
                <button onClick={() => setFilters((f) => ({ ...f, categoryIds: f.categoryIds.filter((c) => c !== id) }))}><X size={11} /></button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// HomeView: the full home/catalog page — combines Hero, HowItWorks, the
// dashed divider, CategoryPegboard, FilterBar, and the actual filtered
// product grid. This is the view shown by default and whenever `view` is
// set to 'home'.
function HomeView() {
  const { products, shops, searchQuery, filters } = useApp();

  // filtered: the actual list of products to display, recalculated only
  // when one of its dependencies changes (useMemo avoids re-filtering on
  // every unrelated re-render).
  const filtered = useMemo(() => {
    let list = products; // start from the full product list

    // --- text search ---
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const shop = shops.find((s) => s.shop_id === p.shop_id);
        // Matches if the query appears in the part name, the compatible
        // models text, the description, OR the parent shop's name.
        return (
          p.part_name.toLowerCase().includes(q) ||
          p.compatible_models.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (shop && shop.shop_name.toLowerCase().includes(q))
        );
      });
    }

    // --- category filter (multi-select: keep products whose category is
    //     in the selected set, or keep everything if nothing is selected) ---
    if (filters.categoryIds.length) list = list.filter((p) => filters.categoryIds.includes(p.category_id));
    // --- single-shop filter ---
    if (filters.shopId !== 'all') list = list.filter((p) => p.shop_id === filters.shopId);
    // --- price range filter (each bound only applies if it's been typed in) ---
    if (filters.minPrice !== '') list = list.filter((p) => p.price >= Number(filters.minPrice));
    if (filters.maxPrice !== '') list = list.filter((p) => p.price <= Number(filters.maxPrice));

    // Copy the array before sorting (Array.sort mutates in place, and we
    // don't want to mutate the `products` array that's still in state).
    list = [...list];
    if (filters.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (filters.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (filters.sort === 'name') list.sort((a, b) => a.part_name.localeCompare(b.part_name));
    // (filters.sort === 'relevance' falls through and keeps the existing order)

    return list;
  }, [products, shops, searchQuery, filters]); // recompute only when any of these change

  return (
    <div>
      <Hero />
      <HowItWorks />
      <DashedRule className="max-w-7xl mx-auto" />
      <CategoryPegboard />
      {/* id="catalog" is the scroll target used by the Hero and CategoryPegboard buttons above */}
      <div id="catalog" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 scroll-mt-16">
        {/* Heading changes to "Results for "<query>"" while a search is active, otherwise "All parts" */}
        <SectionLabel eyebrow={`${filtered.length} result${filtered.length === 1 ? '' : 's'}`} title={searchQuery ? `Results for "${searchQuery}"` : 'All parts'} />
        <FilterBar />
        {filtered.length === 0 ? (
          // Empty state shown when no product matches the current search/filters
          <div className="text-center py-16 border border-dashed border-stone-800 rounded-sm">
            <Package size={32} className="mx-auto text-stone-700 mb-3" />
            <p className="text-stone-400 text-sm">No parts match those filters. Try clearing a filter or searching a different model.</p>
          </div>
        ) : (
          // Responsive product grid: 2 columns on phones, up to 4 on large screens
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((p) => <ProductCard key={p.product_id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SHOPS VIEW
   ============================================================ */

// ShopCard: one tile in the shop directory grid. Shows the shop's name,
// open/closed status, landmark, hours, its assigned fitter's mini-card, how
// many parts it has listed, and two action buttons (view shop / directions).
function ShopCard({ shop }) {
  const { navigate, products } = useApp();
  const open = isShopOpenNow(shop); // live open/closed status for this shop
  const count = products.filter((p) => p.shop_id === shop.shop_id).length; // how many products this shop has listed
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-sm overflow-hidden hover:border-orange-600 transition-colors flex flex-col">
      <div className="p-4 flex-1">
        {/* Shop name + status badge, side by side */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-stone-100 font-bold leading-snug">{shop.shop_name}</h3>
          <StatusPill ok={open} onLabel="OPEN" offLabel="CLOSED" />
        </div>
        {/* Landmark address line */}
        <p className="text-stone-400 text-xs flex items-start gap-1.5 mb-1"><MapPin size={13} className="shrink-0 mt-0.5" /> {shop.landmark_address}</p>
        {/* Formatted opening hours line */}
        <p className="text-stone-400 text-xs flex items-center gap-1.5 mb-3"><Clock size={13} className="shrink-0" /> {formatHours(shop)}</p>
        {/* Mini fitter card embedded inside the shop card */}
        <div className="bg-stone-800 rounded-sm p-2.5 flex items-center gap-2.5">
          <span className="bg-orange-950 p-1.5 rounded-sm"><Wrench size={14} className="text-orange-600" /></span>
          <div className="min-w-0">
            <p className="text-stone-100 text-xs font-semibold truncate">{shop.mechanic.full_name}</p>
            <p className="text-stone-500 text-xs truncate">{shop.mechanic.specialization}</p>
          </div>
          <span className="ml-auto shrink-0"><StatusPill ok={shop.mechanic.is_on_duty} onLabel="AVAILABLE" offLabel="BUSY" /></span>
        </div>
        <p className="text-stone-600 text-xs font-mono mt-2">{count} parts listed</p>
      </div>
      {/* Two-button footer row: view the full shop page, or jump straight to directions */}
      <div className="grid grid-cols-2 border-t border-stone-800">
        <button onClick={() => navigate('shopDetail', { shopId: shop.shop_id })} className="py-2.5 text-xs font-bold uppercase tracking-wide text-stone-300 hover:bg-stone-800 transition-colors">View shop</button>
        {/* Real Google Maps directions link, opens in a new tab */}
        <a href={directionsUrl(shop.latitude, shop.longitude)} target="_blank" rel="noreferrer" className="py-2.5 text-xs font-bold uppercase tracking-wide text-orange-600 hover:bg-stone-800 transition-colors flex items-center justify-center gap-1 border-l border-stone-800"><Navigation size={12} /> Directions</a>
      </div>
    </div>
  );
}

// ShopsView: the full shop directory page — a search box, an "open now
// only" checkbox, and the resulting grid of ShopCards.
function ShopsView() {
  const { shops } = useApp();
  const [q, setQ] = useState(''); // local search text for filtering shops by name/landmark
  const [onlyOpen, setOnlyOpen] = useState(false); // whether to hide currently-closed shops

  // filtered: recalculated on every render (deliberately not memoized —
  // this list is small and cheap, so useMemo would be unnecessary overhead).
  const filtered = shops.filter((s) => {
    const matches = s.shop_name.toLowerCase().includes(q.toLowerCase()) || s.landmark_address.toLowerCase().includes(q.toLowerCase());
    return matches && (!onlyOpen || isShopOpenNow(s)); // also require "open now" if that checkbox is ticked
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <SectionLabel eyebrow="The directory" title="Shops in Kwabenya" />
      {/* Search box + "open now only" checkbox, side by side on larger screens */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex items-center bg-stone-900 border border-stone-800 rounded-sm flex-1 max-w-md">
          <Search size={15} className="ml-3 text-stone-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shop name or landmark…" className="bg-transparent px-2 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none w-full" />
        </div>
        <label className="flex items-center gap-2 text-xs font-mono text-stone-300 cursor-pointer select-none">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="accent-orange-600" />
          Open now only
        </label>
      </div>
      {filtered.length === 0 ? (
        // Empty state shown when no shop matches the current search/checkbox combo
        <div className="text-center py-16 border border-dashed border-stone-800 rounded-sm">
          <Store size={32} className="mx-auto text-stone-700 mb-3" />
          <p className="text-stone-400 text-sm">No shops match that search.</p>
        </div>
      ) : (
        // Responsive shop grid: 1 column on phones, up to 3 on large screens
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => <ShopCard key={s.shop_id} shop={s} />)}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SHOP DETAIL VIEW
   ============================================================ */

// ShopDetailView: the full single-shop page — shop info card, embedded
// Google Map, the assigned fitter's full card, and a grid of every product
// that shop sells. Reads which shop to show from selectedShopId in context
// (set by whichever screen navigated here).
function ShopDetailView() {
  const { shops, products, selectedShopId, navigate } = useApp();
  const shop = shops.find((s) => s.shop_id === selectedShopId); // look up the shop to display
  if (!shop) return <EmptyState onBack={() => navigate('shops')} label="Shop not found" />; // guard against a bad/stale id
  const open = isShopOpenNow(shop); // live open/closed status
  const shopProducts = products.filter((p) => p.shop_id === shop.shop_id); // every product this shop sells

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link to the shop directory */}
      <button onClick={() => navigate('shops')} className="flex items-center gap-1.5 text-xs font-mono uppercase text-stone-400 hover:text-orange-500 mb-6"><ArrowLeft size={14} /> Back to shops</button>

      {/* Two-column layout on large screens: shop info + map on the left (wider), fitter card on the right */}
      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          {/* Main shop info card */}
          <div className="bg-stone-900 border border-stone-800 rounded-sm p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl tracking-wide text-stone-100">{shop.shop_name}</h1>
                <p className="text-stone-500 text-sm font-mono mt-1">Owner / Vendor: {shop.owner_name}</p>
              </div>
              <StatusPill ok={open} onLabel="OPEN NOW" offLabel="CLOSED" size="md" />
            </div>
            {/* Landmark / hours / phone, in a responsive 2-column grid */}
            <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
              <p className="flex items-start gap-2 text-stone-300"><MapPin size={16} className="shrink-0 mt-0.5 text-orange-600" /> {shop.landmark_address}</p>
              <p className="flex items-center gap-2 text-stone-300"><Clock size={16} className="shrink-0 text-orange-600" /> {formatHours(shop)}</p>
              <p className="flex items-center gap-2 text-stone-300"><PhoneCall size={16} className="shrink-0 text-orange-600" /> {shop.contact_phone}</p>
            </div>
            {/* Directions + call buttons */}
            <div className="flex flex-wrap gap-3 mt-5">
              <a href={directionsUrl(shop.latitude, shop.longitude)} target="_blank" rel="noreferrer" className="bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm flex items-center gap-1.5"><Navigation size={14} /> Directions to shop</a>
              <a href={telHref(shop.contact_phone)} className="border border-stone-700 hover:border-stone-500 text-stone-100 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm flex items-center gap-1.5"><PhoneCall size={14} /> Call shop</a>
            </div>
          </div>

          {/* Embedded Google Map — no API key needed, uses the public /maps?...&output=embed pattern */}
          <div className="bg-stone-900 border border-stone-800 rounded-sm overflow-hidden h-64">
            <iframe title="Shop location map" src={mapEmbedUrl(shop.latitude, shop.longitude)} className="w-full h-full border-0" loading="lazy" />
          </div>
        </div>

        {/* Right column: fitter card + a short trust note */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-stone-900 border border-stone-800 rounded-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-orange-950 p-2 rounded-sm"><Wrench size={18} className="text-orange-600" /></span>
              <span className="font-mono text-xs tracking-widest text-stone-500 uppercase">Assigned fitter</span>
            </div>
            <h3 className="text-stone-100 font-bold text-lg">{shop.mechanic.full_name}</h3>
            <p className="text-stone-400 text-sm mt-1">{shop.mechanic.specialization}</p>
            <p className="text-stone-500 text-xs font-mono mt-1">{shop.mechanic.years_experience} yrs experience</p>
            <div className="flex items-center justify-between mt-4">
              <StatusPill ok={shop.mechanic.is_on_duty} onLabel="AVAILABLE" offLabel="BUSY" size="md" />
              <a href={telHref(shop.mechanic.phone_number)} className="text-xs font-bold uppercase tracking-wide text-orange-600 flex items-center gap-1.5"><PhoneCall size={13} /> Call fitter</a>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-sm p-5">
            <p className="text-stone-400 text-xs leading-relaxed flex items-start gap-2"><ShieldCheck size={16} className="shrink-0 text-green-600 mt-0.5" /> Visit in person or place an order below — the assigned fitter handles installation on-site once you arrive.</p>
          </div>
        </div>
      </div>

      {/* This shop's products, reusing the exact same ProductCard component and grid layout as the home catalog */}
      <div className="mt-10">
        <SectionLabel eyebrow={`${shopProducts.length} parts`} title="Parts from this shop" />
        {shopProducts.length === 0 ? (
          <p className="text-stone-500 text-sm">This shop hasn't listed any parts yet.</p>
        ) : (
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {shopProducts.map((p) => <ProductCard key={p.product_id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// EmptyState: a small reusable "nothing here" screen used whenever a detail
// view is asked to show something that no longer exists (e.g. a shop or
// product id that isn't in state anymore). Takes a callback for the back
// button and the message to display.
function EmptyState({ onBack, label }) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
      <AlertCircle size={32} className="mx-auto text-stone-700 mb-3" />
      <p className="text-stone-400 text-sm mb-4">{label}</p>
      <button onClick={onBack} className="text-orange-600 text-xs font-mono uppercase">Go back</button>
    </div>
  );
}

// SignInRequired: shown wherever a guest tries to do something that needs an
// account (checkout, reviews, notifications, dashboards).
function SignInRequired({ label = 'Sign in to continue' }) {
  const { navigate } = useApp();
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20 text-center">
      <User size={32} className="mx-auto text-stone-700 mb-3" />
      <p className="text-stone-300 text-sm mb-1">{label}</p>
      <p className="text-stone-500 text-xs mb-5">Guests can browse the catalogue as a rider. Sign in or create an account to continue.</p>
      <button onClick={() => navigate('account')} className="bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-xs uppercase tracking-wide px-5 py-2.5 rounded-sm">
        Sign in / Register
      </button>
    </div>
  );
}

// AccessDenied: an authenticated user tried to open a dashboard that belongs
// to a different role.
function AccessDenied({ requiredRole }) {
  const { auth, navigate } = useApp();
  const ownRole = auth?.user?.role;
  const ownView = ownRole ? ROLE_VIEW[ownRole] : null;
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20 text-center">
      <AlertCircle size={32} className="mx-auto text-red-500 mb-3" />
      <p className="text-stone-200 text-sm mb-1">Access denied</p>
      <p className="text-stone-500 text-xs mb-5">This area is restricted to {requiredRole} accounts. You are signed in as {ROLE_LABELS[ownRole] || 'a guest'}.</p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => navigate('home')} className="border border-stone-700 hover:border-orange-600 text-stone-100 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">Back to catalog</button>
        {ownView && <button onClick={() => navigate(ownView)} className="bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">My dashboard</button>}
      </div>
    </div>
  );
}

// AccessGuard: the route-level gate used by MainContent. It checks the
// authenticated account's role — never a client-side toggle.
function AccessGuard({ allowedRoles, children }) {
  const { auth } = useApp();
  if (!auth?.user) return <SignInRequired label="Sign in to access this area" />;
  if (allowedRoles && !allowedRoles.includes(auth.user.role)) {
    return <AccessDenied requiredRole={allowedRoles.map((r) => ROLE_LABELS[r] || r).join(' or ')} />;
  }
  return children;
}

/* ============================================================
   PRODUCT DETAIL VIEW
   ============================================================ */

// ProductDetailView: the full single-product page — big icon "image",
// name, description, compatible-model tags, price, stock count, a quantity
// stepper, Add to cart, and an embedded mini shop+fitter card with its own
// directions/call buttons. Reads which product to show from
// selectedProductId in context.
function ProductDetailView() {
  const { products, shops, selectedProductId, navigate, addToCart, showToast, auth } = useApp();
  const product = products.find((p) => p.product_id === selectedProductId); // look up the product to display
  const [qty, setQty] = useState(1); // how many units the person currently wants to add
  const [reviews, setReviews] = useState([]); // reviews fetched for this product
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  // Reset the quantity stepper back to 1 every time a *different* product is opened.
  useEffect(() => setQty(1), [selectedProductId]);
  // Fetch this product's reviews whenever a different product is opened.
  useEffect(() => {
    if (!product) return undefined;
    let active = true;
    api.getReviews({ product: product.product_id })
      .then((data) => { if (active) setReviews(unwrap(data)); })
      .catch(() => { /* reviews are non-critical; keep the page usable */ });
    return () => { active = false; };
  }, [product?.product_id]);

  if (!product) return <EmptyState onBack={() => navigate('home')} label="Part not found" />; // guard against a bad/stale id
  const shop = shops.find((s) => s.shop_id === product.shop_id); // this product's parent shop
  const open = isShopOpenNow(shop); // that shop's live open/closed status
  const category = CATEGORIES.find((c) => c.category_id === product.category_id); // this product's category
  const averageRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + Number(r.rating), 0) / reviews.length).toFixed(1)
    : null;

  // submitReview: posts a rating + comment to /api/reviews/ and prepends the
  // saved review locally so it appears immediately.
  const submitReview = async () => {
    if (!auth?.user) {
      showToast('Sign in to post a review');
      navigate('account');
      return;
    }
    setReviewBusy(true);
    try {
      const created = await api.createReview({
        product: product.product_id,
        rating: Number(reviewRating),
        comment: reviewComment,
      });
      setReviews((prev) => [created, ...prev]);
      setReviewComment('');
      setReviewRating(5);
      showToast('Review posted');
    } catch (e) {
      showToast('Could not post review');
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link to the catalog */}
      <button onClick={() => navigate('home')} className="flex items-center gap-1.5 text-xs font-mono uppercase text-stone-400 hover:text-orange-500 mb-6"><ArrowLeft size={14} /> Back to catalog</button>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Left column: placeholder "image" panel (icon on a gradient, same idea as the product card thumbnail but bigger) */}
        <div className="lg:col-span-2">
          <div className="bg-gradient-to-br from-stone-800 to-stone-900 border border-stone-800 rounded-sm h-64 sm:h-80 flex items-center justify-center overflow-hidden">
            <img src={resolveImageUrl(product.image_url, product.category_id)} alt={category?.category_name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
        </div>

        {/* Right column: all of the product's text info + actions */}
        <div className="lg:col-span-3">
          <span className="font-mono text-xs tracking-widest text-orange-600 uppercase">{category?.category_name}</span>
          <h1 className="font-display text-3xl sm:text-4xl tracking-wide text-stone-100 mt-1">{product.part_name}</h1>
          <p className="text-stone-300 text-sm mt-3 leading-relaxed">{product.description}</p>

          {/* One small tag per compatible model, split from the comma-separated string */}
          <div className="flex flex-wrap gap-1.5 mt-4">
            {product.compatible_models.split(',').map((m) => (
              <span key={m} className="bg-stone-800 border border-stone-800 text-stone-300 text-xs font-mono px-2 py-1 rounded-sm">{m.trim()}</span>
            ))}
          </div>

          {/* Price + stock count */}
          <div className="flex items-center gap-4 mt-6">
            <span className="font-mono text-orange-600 font-bold text-3xl">{formatGHS(product.price)}</span>
            {/* Stock text turns red once 5 or fewer units remain, and reads "Out of stock" at zero */}
            <span className={`text-xs font-mono ${product.stock_quantity > 5 ? 'text-stone-500' : 'text-red-400'}`}>{product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock'}</span>
          </div>

          {/* Quantity stepper + Add to cart button */}
          <div className="flex items-center gap-3 mt-5">
            <div className="flex items-center border border-stone-700 rounded-sm">
              {/* Decrement, but never below 1 */}
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-2.5 text-stone-300 hover:text-stone-100"><Minus size={14} /></button>
              <span className="w-10 text-center text-sm text-stone-100 font-mono">{qty}</span>
              {/* Increment, but never above however many units are in stock */}
              <button onClick={() => setQty((q) => Math.min(product.stock_quantity, q + 1))} className="p-2.5 text-stone-300 hover:text-stone-100"><Plus size={14} /></button>
            </div>
            <button
              onClick={() => addToCart(product.product_id, qty)}
              disabled={product.stock_quantity === 0}
              className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-stone-700 disabled:text-stone-600 text-stone-950 font-bold text-sm uppercase tracking-wide py-3 rounded-sm flex items-center justify-center gap-2"
            >
              <ShoppingCart size={16} /> Add to cart
            </button>
          </div>

          {/* Embedded mini shop + fitter card, only rendered if the shop lookup actually succeeded */}
          {shop && (
            <div className="mt-8 bg-stone-900 border border-stone-800 rounded-sm p-4 space-y-4">
              {/* Clicking this whole block navigates to the full shop detail page */}
              <button onClick={() => navigate('shopDetail', { shopId: shop.shop_id })} className="w-full text-left flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Store size={15} className="text-orange-600" />
                    <span className="text-stone-100 font-bold text-sm">{shop.shop_name}</span>
                  </div>
                  <p className="text-stone-500 text-xs mt-1 flex items-center gap-1.5"><MapPin size={12} /> {shop.landmark_address}</p>
                  <p className="text-stone-500 text-xs mt-0.5 flex items-center gap-1.5"><Clock size={12} /> {formatHours(shop)}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusPill ok={open} onLabel="OPEN" offLabel="CLOSED" />
                  <ChevronRight size={16} className="text-stone-600" />
                </div>
              </button>
              <div className="h-px bg-stone-800" /> {/* thin divider line */}
              {/* Fitter mini row */}
              <div className="flex items-center gap-3">
                <span className="bg-orange-950 p-2 rounded-sm shrink-0"><Wrench size={15} className="text-orange-600" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-stone-100 text-sm font-semibold truncate">{shop.mechanic.full_name} · Fitter</p>
                  <p className="text-stone-500 text-xs truncate">{shop.mechanic.specialization}</p>
                </div>
                <StatusPill ok={shop.mechanic.is_on_duty} onLabel="AVAILABLE" offLabel="BUSY" />
              </div>
              {/* Directions + call-shop buttons, same links as the shop detail page */}
              <div className="flex gap-3">
                <a href={directionsUrl(shop.latitude, shop.longitude)} target="_blank" rel="noreferrer" className="flex-1 text-center border border-stone-700 hover:border-orange-600 text-stone-100 text-xs font-bold uppercase tracking-wide py-2 rounded-sm flex items-center justify-center gap-1.5"><Navigation size={13} /> Directions</a>
                <a href={telHref(shop.contact_phone)} className="flex-1 text-center border border-stone-700 hover:border-orange-600 text-stone-100 text-xs font-bold uppercase tracking-wide py-2 rounded-sm flex items-center justify-center gap-1.5"><PhoneCall size={13} /> Call shop</a>
              </div>
            </div>
          )}

          {auth?.user && auth.user.role === 'RIDER' && (
            <button onClick={async () => { const body = prompt('Your question to the seller:'); if (!body) return; try { const enq = await api.createEnquiry({ product: product.product_id, body }); showToast('Enquiry sent'); navigate('enquiries'); } catch (e) { showToast('Could not send enquiry'); } }} className="w-full border border-stone-700 hover:border-orange-600 text-stone-100 font-bold text-xs uppercase tracking-wide py-2.5 rounded-sm">
              Ask the seller
            </button>
          )}

          {/* Reviews & ratings — fetched from /api/reviews/?product=<id> */}
          <div className="mt-8 bg-stone-900 border border-stone-800 rounded-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs tracking-widest text-stone-500 uppercase">Reviews &amp; ratings</span>
              {averageRating && (
                <span className="flex items-center gap-1 text-orange-500 text-sm font-bold"><Star size={14} fill="currentColor" /> {averageRating} / 5</span>
              )}
            </div>
            {reviews.length === 0 ? (
              <p className="text-stone-500 text-xs mb-3">No reviews yet — be the first to rate this part.</p>
            ) : (
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto pr-1">
                {reviews.map((r) => (
                  <div key={r.id} className="border-b border-stone-800 last:border-0 pb-2">
                    <div className="flex items-center gap-1 text-orange-500">
                      {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={11} fill={i < r.rating ? 'currentColor' : 'none'} className={i < r.rating ? '' : 'text-stone-700'} />)}
                      <span className="text-stone-500 text-xs font-mono ml-2">{r.customer_name || 'Rider'}</span>
                    </div>
                    {r.comment && <p className="text-stone-400 text-xs mt-1">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
            {auth?.user ? (
              <div className="border-t border-stone-800 pt-3 space-y-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setReviewRating(n)} title={`${n} star${n > 1 ? 's' : ''}`} className="text-orange-500">
                      <Star size={18} fill={n <= reviewRating ? 'currentColor' : 'none'} className={n <= reviewRating ? '' : 'text-stone-700'} />
                    </button>
                  ))}
                </div>
                <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={2} placeholder="Share how this part fitted or performed…" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none resize-none" />
                <button onClick={submitReview} disabled={reviewBusy} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-stone-950 font-bold text-xs uppercase tracking-wide px-4 py-2 rounded-sm">
                  {reviewBusy ? 'Posting…' : 'Post review'}
                </button>
              </div>
            ) : (
              <div className="border-t border-stone-800 pt-3">
                <p className="text-stone-500 text-xs mb-2">Sign in to rate and review this part.</p>
                <button onClick={() => navigate('account')} className="border border-stone-700 hover:border-orange-600 text-stone-100 font-bold text-xs uppercase tracking-wide px-4 py-2 rounded-sm">
                  Sign in / Register
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CART VIEW
   ============================================================ */

// CartView: lists every item currently in the cart with quantity
// controls and a remove button, plus a subtotal and "Proceed to checkout"
// button. Shows a dedicated empty state when the cart has nothing in it.
function CartView() {
  const { cart, products, shops, updateCartQty, removeFromCart, cartTotal, navigate } = useApp();

  // Empty-cart branch: short-circuits the whole component and shows a
  // simple "browse parts" prompt instead of an empty list.
  if (cart.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <ShoppingCart size={36} className="mx-auto text-stone-700 mb-4" />
        <h2 className="font-display text-3xl text-stone-100 tracking-wide">Your cart is empty</h2>
        <p className="text-stone-400 text-sm mt-2 mb-6">Add a part to get rolling.</p>
        <button onClick={() => navigate('home')} className="bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-sm uppercase tracking-wide px-5 py-3 rounded-sm">Browse parts</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <SectionLabel eyebrow={`${cart.length} item${cart.length === 1 ? '' : 's'}`} title="Your cart" />
      <div className="space-y-3">
        {/* One row per cart entry */}
        {cart.map((item) => {
          const product = products.find((p) => p.product_id === item.productId); // resolve the cart entry's product data
          if (!product) return null; // skip silently if the product was somehow removed from state
          const shop = shops.find((s) => s.shop_id === product.shop_id); // resolve the product's shop, shown as a subtitle
          return (
            <div key={item.productId} className="bg-stone-900 border border-stone-800 rounded-sm p-4 flex items-center gap-4">
              {/* Small icon thumbnail, same idea as the product card image but smaller */}
              <div className="bg-gradient-to-br from-stone-800 to-stone-900 rounded-sm h-16 w-16 shrink-0 flex items-center justify-center">
                <CategoryIcon categoryId={product.category_id} size={26} className="text-orange-500" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-stone-100 font-semibold text-sm truncate">{product.part_name}</p>
                <p className="text-stone-500 text-xs truncate">{shop?.shop_name}</p>
                <p className="font-mono text-orange-600 text-sm font-bold mt-1">{formatGHS(product.price)}</p>
              </div>
              {/* Quantity stepper — updateCartQty(productId, 0-or-less) removes the line entirely (see App() below) */}
              <div className="flex items-center border border-stone-700 rounded-sm shrink-0">
                <button onClick={() => updateCartQty(item.productId, item.qty - 1)} className="p-2 text-stone-300 hover:text-stone-100"><Minus size={13} /></button>
                <span className="w-8 text-center text-sm text-stone-100 font-mono">{item.qty}</span>
                <button onClick={() => updateCartQty(item.productId, item.qty + 1)} className="p-2 text-stone-300 hover:text-stone-100"><Plus size={13} /></button>
              </div>
              {/* Explicit remove button (in addition to being able to decrement to zero) */}
              <button onClick={() => removeFromCart(item.productId)} className="p-2 text-stone-600 hover:text-red-400 shrink-0"><Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>

      {/* Subtotal + checkout / continue-shopping actions */}
      <div className="mt-6 bg-stone-900 border border-stone-800 rounded-sm p-5">
        <div className="flex items-center justify-between text-stone-300 text-sm mb-1">
          <span>Subtotal</span>
          <span className="font-mono">{formatGHS(cartTotal)}</span>
        </div>
        <p className="text-stone-600 text-xs mb-4">Delivery / pickup arranged directly with each shop after ordering.</p>
        <button onClick={() => navigate('checkout')} className="w-full bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-sm uppercase tracking-wide py-3 rounded-sm">Proceed to checkout</button>
        <button onClick={() => navigate('home')} className="w-full text-center text-stone-400 text-xs font-mono uppercase mt-3 hover:text-stone-100">Continue shopping</button>
      </div>
    </div>
  );
}

/* ============================================================
   CHECKOUT + CONFIRMATION
   ============================================================ */

// PAYMENT_METHODS: the three payment options offered at checkout. Used both
// to render the selector buttons and to look up the human-readable label
// for whichever method was chosen (e.g. on the confirmation screen).
const PAYMENT_METHODS = [
  { id: 'MTN_MOMO', label: 'MTN Mobile Money' },
  { id: 'TELECEL_CASH', label: 'Telecel Cash' },
  { id: 'CASH', label: 'Cash on pickup' },
];

// CheckoutView: the delivery-details + payment-method form. Validates every
// field, "processes payment" with a simulated delay, then stores the
// finished order in context and navigates to the confirmation screen.
function CheckoutView() {
  const { cart, products, cartTotal, navigate, setLastOrder, clearCart, showToast, refreshNotifications, auth } = useApp();
  // form: every field in the checkout form, held as one object so a single
  // setForm call can update just one field at a time (see `update` below).
  const [form, setForm] = useState({ name: '', phone: '', landmark: '', momoNumber: '', payment: 'MTN_MOMO' });
  const [errors, setErrors] = useState({}); // validation error messages, keyed by field name
  const [processing, setProcessing] = useState(false); // true while the simulated "processing payment" delay is running

  // Checkout requires a real account — guests may browse and fill a cart,
  // but placing an order is authenticated-only (enforced by the API too).
  if (!auth?.user) return <SignInRequired label="Sign in to place an order" />;

  // If checkout is somehow reached with an empty cart (e.g. back button
  // after a previous order), bail out to a friendly empty state instead of
  // showing a broken form.
  if (cart.length === 0) return <EmptyState onBack={() => navigate('home')} label="Your cart is empty" />;

  // update: small helper to set a single field on the form object without
  // repeating the `{ ...form, [k]: v }` spread everywhere.
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // validate: checks every required field and returns true only if there
  // are no errors. Also writes the actual error messages into state so the
  // form can display them next to each field.
  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Enter your full name';
    // Phone must be exactly a 10-digit Ghanaian local number starting with 0 (spaces are stripped first).
    if (!/^0\d{9}$/.test(form.phone.replace(/\s+/g, ''))) e.phone = 'Enter a valid 10-digit phone number';
    if (!form.landmark.trim()) e.landmark = 'Enter a delivery landmark or address';
    // Mobile money number is only required for the two MoMo/Telecel payment methods, not for cash.
    if (form.payment !== 'CASH' && !/^0\d{9}$/.test(form.momoNumber.replace(/\s+/g, ''))) e.momoNumber = 'Enter the mobile money number to charge';
    setErrors(e);
    return Object.keys(e).length === 0; // valid only if no error keys were added
  };

  // placeOrder: validates, then posts one order per shop to the Django API.
  // A cart can contain parts from several shops, and the backend models one
  // order per shop, so the cart is grouped by shop_id first. If the API is
  // unreachable the app falls back to the original simulated confirmation,
  // keeping the demo usable offline.
  const placeOrder = async () => {
    if (!validate()) return; // stop here if any field failed validation
    setProcessing(true); // show the spinner / disable the button

    const snapshotItems = cart.map((item) => ({
      ...item,
      product: products.find((p) => p.product_id === item.productId),
    }));

    try {
      // Group cart lines by shop.
      const groups = {};
      snapshotItems.forEach((item) => {
        if (!item.product) return;
        const shopId = item.product.shop_id;
        if (!groups[shopId]) groups[shopId] = [];
        groups[shopId].push({ product_id: item.product.product_id, quantity: item.qty });
      });

      const orders = [];
      for (const [shopId, items] of Object.entries(groups)) {
        const saved = await api.createOrder({
          shop_id: Number(shopId),
          payment_method: form.payment === 'CASH' ? 'CASH' : 'MOMO',
          contact_name: form.name,
          contact_phone: form.phone.replace(/\s+/g, ''),
          momo_number: form.momoNumber.replace(/\s+/g, ''),
          notes: form.landmark,
          items,
        });
        orders.push(mapApiOrder(saved));
      }

      setLastOrder({
        orderId: orders.map((o) => o.orderId).join(' · '),
        orders,
        items: snapshotItems,
        total: cartTotal,
        customer: form,
        placedAt: new Date(),
      });
      showToast('Order placed successfully');
      const n = await refreshNotifications();
      if (n === 0) showToast('Order placed, but notifications could not be loaded');
    } catch (e) {
      // Authentication/permission failures must NOT fall back to a local
      // order — the user needs to sign in again.
      if (/401|403|Authentication|permission/i.test(e.message || '')) {
        setProcessing(false);
        showToast('Please sign in again to place the order');
        navigate('account');
        return;
      }
      // Offline/demo fallback — same behaviour as the original mock checkout.
      console.warn('Order API failed, using local confirmation.', e.message);
      setLastOrder({
        orderId: `KS-${Math.floor(100000 + Math.random() * 900000)}`,
        items: snapshotItems,
        total: cartTotal,
        customer: form,
        placedAt: new Date(),
      });
      showToast('Order saved locally (API offline)');
    }
    setProcessing(false);
    clearCart(); // empty the cart now that the order has been placed
    const firstOrderId = orders[0]?.id;
    if (firstOrderId) navigate('orderDetail', { orderId: firstOrderId });
    else navigate('home');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <button onClick={() => navigate('cart')} className="flex items-center gap-1.5 text-xs font-mono uppercase text-stone-400 hover:text-orange-500 mb-6"><ArrowLeft size={14} /> Back to cart</button>
      <SectionLabel eyebrow="Last step" title="Checkout" />

      {/* NOTE: this is a <div>, not an HTML <form> — form submission is
          handled entirely by the "Place order" button's onClick below,
          which avoids the page-reload behavior a real <form> submit would
          otherwise trigger. */}
      <div className="bg-stone-900 border border-stone-800 rounded-sm p-5 space-y-4">
        {/* Full name field */}
        <div>
          <label className="text-xs font-mono uppercase text-stone-500 block mb-1">Full name</label>
          <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Kwesi Appiah" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
          {errors.name && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} /> {errors.name}</p>}
        </div>
        {/* Phone number field */}
        <div>
          <label className="text-xs font-mono uppercase text-stone-500 block mb-1">Phone number</label>
          <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="024 000 0000" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
          {errors.phone && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} /> {errors.phone}</p>}
        </div>
        {/* Delivery landmark field */}
        <div>
          <label className="text-xs font-mono uppercase text-stone-500 block mb-1">Delivery landmark / address</label>
          <input value={form.landmark} onChange={(e) => update('landmark', e.target.value)} placeholder="e.g. Near Kwabenya Total, opposite the school" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
          {errors.landmark && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} /> {errors.landmark}</p>}
        </div>

        {/* Payment method selector — three toggle buttons, one active at a time */}
        <div>
          <label className="text-xs font-mono uppercase text-stone-500 block mb-2">Payment method</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button key={m.id} onClick={() => update('payment', m.id)} className={`text-xs font-semibold px-3 py-2.5 rounded-sm border transition-colors ${form.payment === m.id ? 'bg-orange-600 border-orange-600 text-stone-950' : 'bg-stone-800 border-stone-800 text-stone-300 hover:border-stone-600'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile money number field — only rendered when a MoMo-type payment method is selected */}
        {form.payment !== 'CASH' && (
          <div>
            <label className="text-xs font-mono uppercase text-stone-500 block mb-1">{form.payment === 'MTN_MOMO' ? 'MTN MoMo number' : 'Telecel Cash number'}</label>
            <input value={form.momoNumber} onChange={(e) => update('momoNumber', e.target.value)} placeholder="024 000 0000" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            {errors.momoNumber && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} /> {errors.momoNumber}</p>}
            <p className="text-stone-600 text-xs mt-1.5">Demo checkout — this simulates a payment prompt and does not move real money.</p>
          </div>
        )}

        <div className="h-px bg-stone-800" /> {/* divider before the total */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-300">Total</span>
          <span className="font-mono text-orange-600 font-bold text-lg">{formatGHS(cartTotal)}</span>
        </div>

        {/* Place order button — swaps its own label/icon for a spinner while `processing` is true */}
        <button onClick={placeOrder} disabled={processing} className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-stone-950 font-bold text-sm uppercase tracking-wide py-3 rounded-sm flex items-center justify-center gap-2">
          {processing ? <><Loader2 size={16} className="animate-spin" /> Processing payment…</> : `Place order · ${formatGHS(cartTotal)}`}
        </button>
      </div>
    </div>
  );
}

// ConfirmationView: the "order placed" success screen. Reads the most
// recent order from lastOrder in context (set by placeOrder() above) and
// shows a line-item breakdown, delivery landmark, and payment method.
function ConfirmationView() {
  const { lastOrder, navigate } = useApp();
  // Guard against reaching this screen with no order on record (e.g.
  // navigating here directly without having checked out).
  if (!lastOrder) return <EmptyState onBack={() => navigate('home')} label="No recent order found" />;
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
      {/* Success icon */}
      <span className="inline-flex bg-green-950 p-4 rounded-full mb-5"><ClipboardCheck size={36} className="text-green-400" /></span>
      <h1 className="font-display text-4xl tracking-wide text-stone-100">Order placed</h1>
      <p className="text-stone-400 text-sm mt-2">Order <span className="font-mono text-orange-600">{lastOrder.orderId}</span> — we've notified each shop to prepare your parts.</p>

      {/* Order summary card */}
      <div className="bg-stone-900 border border-stone-800 rounded-sm p-5 mt-8 text-left space-y-3">
        {/* One line per item that was in the order (guarding against a product record that no longer exists) */}
        {lastOrder.items.map((item) => item.product && (
          <div key={item.productId} className="flex items-center justify-between text-sm">
            <span className="text-stone-300">{item.qty} × {item.product.part_name}</span>
            <span className="font-mono text-stone-400">{formatGHS(item.product.price * item.qty)}</span>
          </div>
        ))}
        <div className="h-px bg-stone-800" />
        <div className="flex items-center justify-between text-sm font-bold">
          <span className="text-stone-100">Total</span>
          <span className="font-mono text-orange-600">{formatGHS(lastOrder.total)}</span>
        </div>
        <div className="h-px bg-stone-800" />
        <p className="text-stone-500 text-xs">Delivering to: {lastOrder.customer.landmark}</p>
        {/* Looks up the human-readable label for whichever payment method id was stored */}
        <p className="text-stone-500 text-xs">Paying via: {PAYMENT_METHODS.find((m) => m.id === lastOrder.customer.payment)?.label}</p>
      </div>

      <button onClick={() => navigate('home')} className="bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-sm uppercase tracking-wide px-6 py-3 rounded-sm mt-8">Continue shopping</button>
    </div>
  );
}

/* ============================================================
   SELLER DASHBOARD
   ============================================================ */

// NewProductForm: the "add a new part" form embedded at the bottom of the
// seller dashboard. Starts collapsed as a single dashed button; clicking it
// reveals the actual input fields.
function NewProductForm({ shopId }) {
  const { addProduct, showToast } = useApp();
  // blank: the form's default/reset values, kept as a named constant so
  // `submit` and the cancel button can both reset to it without repeating
  // the object literal.
  const blank = { part_name: '', category_id: 1, compatible_models: '', description: '', price: '', stock_quantity: '' };
  const [form, setForm] = useState(blank); // the in-progress new-product form values
  const [open, setOpen] = useState(false); // whether the form fields are expanded (vs. just the collapsed button)
  const [imageFile, setImageFile] = useState(null); // selected image file
  const [imagePreview, setImagePreview] = useState(null); // preview URL
  const [saving, setSaving] = useState(false); // upload in progress

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Only image files (JPG, PNG, WEBP) are allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5 MB'); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  };

  // submit: minimal validation (name, price, and compatible models must be
  // non-empty), then hands the data off to addProduct() from context —
  // which is responsible for actually generating the new product_id — and
  // resets the form back to its collapsed, blank state.
  const submit = async () => {
    if (!form.part_name.trim() || !form.price || !form.compatible_models.trim()) return; // silently do nothing if required fields are missing
    setSaving(true);
    try {
      await addProduct({
        ...form,
        shop_id: shopId, // always attach the new part to the seller's own shop
        category_id: Number(form.category_id), // <select> values arrive as strings — convert back to a number
        price: Number(form.price),
        stock_quantity: Number(form.stock_quantity) || 0, // default to 0 if left blank rather than NaN
      }, imageFile);
      showToast('Part added to your listing');
      setForm(blank); // reset the form
      removeImage();
      setOpen(false); // collapse it again
    } finally {
      setSaving(false);
    }
  };

  // Collapsed state: just a dashed "List a new part" button.
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full border border-dashed border-stone-700 hover:border-orange-600 rounded-sm py-4 flex items-center justify-center gap-2 text-stone-400 hover:text-orange-500 text-sm font-semibold">
        <PlusCircle size={16} /> List a new part
      </button>
    );
  }

  // Expanded state: the actual form fields.
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-sm p-4 space-y-3">
      {/* Part name + category, side by side on larger screens */}
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={form.part_name} onChange={(e) => setForm((f) => ({ ...f, part_name: e.target.value }))} placeholder="Part name" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
        <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))} className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 outline-none">
          {/* Every category from the master CATEGORIES list becomes an option here */}
          {CATEGORIES.map((c) => <option key={c.category_id} value={c.category_id} className="bg-stone-950">{c.category_name}</option>)}
        </select>
      </div>
      {/* Compatible models field (free text, comma-separated) */}
      <input value={form.compatible_models} onChange={(e) => setForm((f) => ({ ...f, compatible_models: e.target.value }))} placeholder="Compatible models, e.g. Bajaj Boxer BM150, TVS HLX" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
      {/* Description textarea */}
      <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short description" rows={2} className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none resize-none" />
      {/* Price + stock quantity, side by side */}
      <div className="grid grid-cols-2 gap-3">
        <input type="number" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="Price (GH₵)" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
        <input type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))} placeholder="Stock quantity" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
      </div>
      {/* Image upload */}
      <div className="space-y-2">
        <label className="flex items-center justify-center gap-2 border border-dashed border-stone-700 hover:border-orange-600 rounded-sm py-3 cursor-pointer text-stone-400 hover:text-orange-500 text-sm font-semibold">
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          <Plus size={16} /> {imageFile ? 'Change image' : 'Upload item image'}
        </label>
        {imagePreview && (
          <div className="relative">
            <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-sm border border-stone-800" />
            <button onClick={removeImage} className="absolute top-2 right-2 bg-stone-950/80 text-stone-100 text-xs px-2 py-1 rounded-sm">Remove</button>
          </div>
        )}
        {!imageFile && <p className="text-stone-500 text-xs">Image is optional. JPG, PNG, WEBP up to 5 MB.</p>}
      </div>
      {/* Save / cancel buttons */}
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving} className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-stone-950 font-bold text-xs uppercase tracking-wide py-2.5 rounded-sm flex items-center justify-center gap-2">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : 'Save part'}
        </button>
        <button onClick={() => { setOpen(false); setForm(blank); removeImage(); }} className="px-4 border border-stone-700 text-stone-300 text-xs font-bold uppercase tracking-wide rounded-sm">Cancel</button>
      </div>
    </div>
  );
}

// SellerProductRow: one editable row in the seller dashboard's inventory
// list. Price and stock are locally-editable number inputs; the Save
// (floppy disk) icon only lights up once one of them has actually been
// changed from the saved value, and writes the change back to global state
// via updateProduct() from context.
function SellerProductRow({ product }) {
  const { updateProduct, removeProduct, showToast } = useApp();
  // Local draft copies of price/stock so typing doesn't write to global
  // state (and re-render every other component reading `products`) on
  // every keystroke — only committed when "Save" is clicked.
  const [price, setPrice] = useState(product.price);
  const [stock, setStock] = useState(product.stock_quantity);
  // dirty: true if either local draft value differs from what's actually
  // saved in state — used to enable/disable the Save button.
  const dirty = Number(price) !== product.price || Number(stock) !== product.stock_quantity;

  // save: writes the two local draft values back to the real product
  // record in global state, and pops a confirmation toast.
  const save = () => {
    updateProduct(product.product_id, { price: Number(price), stock_quantity: Number(stock) });
    showToast('Listing updated');
  };

  return (
    <div className="flex flex-wrap items-center gap-3 bg-stone-900 border border-stone-800 rounded-sm p-3">
      <CategoryIcon categoryId={product.category_id} size={22} className="text-orange-500 shrink-0" />
      {/* Name + compatible models, truncated to fit on one line each */}
      <div className="w-36 flex-1">
        <p className="text-stone-100 text-sm font-semibold truncate">{product.part_name}</p>
        <p className="text-stone-500 text-xs truncate">{product.compatible_models}</p>
      </div>
      {/* Editable price field */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-mono text-stone-500">GH₵</span>
        <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-20 bg-stone-800 border border-stone-800 rounded-sm px-2 py-1.5 text-xs text-stone-100 outline-none" />
      </div>
      {/* Editable stock field */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-mono text-stone-500">Stock</span>
        <input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} className="w-16 bg-stone-800 border border-stone-800 rounded-sm px-2 py-1.5 text-xs text-stone-100 outline-none" />
      </div>
      {/* Save button — visually and functionally disabled until something has actually changed */}
      <button onClick={save} disabled={!dirty} className="p-2 text-stone-500 hover:text-green-400 disabled:opacity-30 disabled:hover:text-stone-500"><Save size={15} /></button>
      {/* Delete button — removes this product from state entirely, no confirmation dialog */}
      <button onClick={() => setEditingProduct(product)} className="p-2 text-stone-500 hover:text-orange-400"><Pencil size={15} /></button>
      <button onClick={() => removeProduct(product.product_id)} className="p-2 text-stone-500 hover:text-red-400"><Trash2 size={15} /></button>
    </div>
  );
}

// CreateShopForm: lets a newly registered seller create their own shop.
function CreateShopForm() {
  const { auth, showToast, loadCatalogue, setCurrentShopId, navigate } = useApp();
  const [form, setForm] = useState({ shop_name: '', landmark_address: '', opening_time: '07:00', closing_time: '19:00', latitude: '', longitude: '' });
  const [saving, setSaving] = useState(false);
  const useLocation = () => {
    if (!navigator.geolocation) { showToast('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
    }, () => showToast('Could not get location'));
  };
  const submit = async () => {
    if (!form.shop_name.trim() || !form.landmark_address.trim()) { showToast('Shop name and address are required'); return; }
    setSaving(true);
    try {
      const created = await api.createShop({
        shop_name: form.shop_name,
        landmark_address: form.landmark_address,
        opening_time: form.opening_time,
        closing_time: form.closing_time,
        latitude: Number(form.latitude) || 0,
        longitude: Number(form.longitude) || 0,
      });
      showToast('Shop created');
      setCurrentShopId(created.id);
      await loadCatalogue();
    } catch (e) {
      showToast('Could not create shop');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display text-3xl tracking-wide text-stone-100 mb-4">Create your shop</h1>
      <div className="bg-stone-900 border border-stone-800 rounded-sm p-4 space-y-3">
        <input value={form.shop_name} onChange={(e) => setForm((f) => ({ ...f, shop_name: e.target.value }))} placeholder="Shop name" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
        <input value={form.landmark_address} onChange={(e) => setForm((f) => ({ ...f, landmark_address: e.target.value }))} placeholder="Landmark / address" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-mono text-stone-500">Opens <input type="time" value={form.opening_time} onChange={(e) => setForm((f) => ({ ...f, opening_time: e.target.value }))} className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 outline-none mt-1" /></label>
          <label className="text-xs font-mono text-stone-500">Closes <input type="time" value={form.closing_time} onChange={(e) => setForm((f) => ({ ...f, closing_time: e.target.value }))} className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 outline-none mt-1" /></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" step="0.000001" value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} placeholder="Latitude" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
          <input type="number" step="0.000001" value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} placeholder="Longitude" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
        </div>
        <button onClick={useLocation} className="text-xs font-mono uppercase text-orange-600 hover:text-orange-500">Use my location</button>
        <button onClick={submit} disabled={saving} className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-stone-950 font-bold text-xs uppercase tracking-wide py-2.5 rounded-sm flex items-center justify-center gap-2">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create shop'}
        </button>
      </div>
    </div>
  );
}

// ProductEditForm: edit an existing product's details and image.
function ProductEditForm({ product, shopId, onClose }) {
  const { updateProduct, showToast } = useApp();
  const [form, setForm] = useState({
    part_name: product.part_name,
    category_id: product.category_id,
    compatible_models: product.compatible_models,
    description: product.description,
    price: product.price,
    stock_quantity: product.stock_quantity,
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(product.image_url ? (product.image_url.startsWith('http') ? product.image_url : `/images/${product.image_url}`) : null);
  const [saving, setSaving] = useState(false);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Only image files (JPG, PNG, WEBP) are allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5 MB'); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    setSaving(true);
    try {
      await updateProduct(product.product_id, {
        part_name: form.part_name,
        category_id: Number(form.category_id),
        compatible_models: form.compatible_models,
        description: form.description,
        price: Number(form.price),
        stock_quantity: Number(form.stock_quantity) || 0,
      }, imageFile);
      showToast('Product updated');
      onClose();
    } catch (e) {
      showToast('Could not update product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-sm p-4 space-y-3 mb-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs tracking-widest text-stone-500 uppercase">Edit product</p>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-100"><X size={16} /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={form.part_name} onChange={(e) => setForm((f) => ({ ...f, part_name: e.target.value }))} placeholder="Part name" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
        <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))} className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 outline-none">
          {CATEGORIES.map((c) => <option key={c.category_id} value={c.category_id} className="bg-stone-950">{c.category_name}</option>)}
        </select>
      </div>
      <input value={form.compatible_models} onChange={(e) => setForm((f) => ({ ...f, compatible_models: e.target.value }))} placeholder="Compatible models" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
      <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short description" rows={2} className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none resize-none" />
      <div className="grid grid-cols-2 gap-3">
        <input type="number" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="Price (GH₵)" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
        <input type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))} placeholder="Stock quantity" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
      </div>
      <div className="space-y-2">
        <label className="flex items-center justify-center gap-2 border border-dashed border-stone-700 hover:border-orange-600 rounded-sm py-3 cursor-pointer text-stone-400 hover:text-orange-500 text-sm font-semibold">
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          <Plus size={16} /> {imageFile ? 'Change image' : 'Upload new image'}
        </label>
        {imagePreview && (
          <div className="relative">
            <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-sm border border-stone-800" />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving} className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-stone-950 font-bold text-xs uppercase tracking-wide py-2.5 rounded-sm flex items-center justify-center gap-2">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save changes'}
        </button>
        <button onClick={onClose} className="px-4 border border-stone-700 text-stone-300 text-xs font-bold uppercase tracking-wide rounded-sm">Cancel</button>
      </div>
    </div>
  );
}

// SellerDashboardView: the full "shop owner" screen — tied to the signed-in
// seller's own shop (admins may switch shops), with stat cards, a
// shop-open/closed override toggle, a fitter-duty toggle, the editable
// inventory list, and the add-new-part form.
function SellerDashboardView() {
  const { shops, products, currentShopId, setCurrentShopId, updateShop, showToast, auth, navigate } = useApp();
  // A seller can only see their own shop. Admins previewing the seller
  // dashboard may switch between shops.
  const availableShops = auth?.user?.role === 'SELLER'
    ? shops.filter((s) => s.owner_id === auth.user.id)
    : shops;
  const shop = availableShops.find((s) => s.shop_id === currentShopId) || availableShops[0] || shops[0];
  const myProducts = products.filter((p) => p.shop_id === shop.shop_id); // only this shop's own listings
  const lowStock = myProducts.filter((p) => p.stock_quantity <= 5).length; // count of parts at/under the low-stock threshold
  const [orders, setOrders] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [shopForm, setShopForm] = useState({
    shop_name: shop.shop_name,
    landmark_address: shop.landmark_address,
    opening_time: shop.opening_time,
    closing_time: shop.closing_time,
    latitude: shop.latitude,
    longitude: shop.longitude,
  });

  // Refresh the editable shop profile fields when the selected shop changes.
  useEffect(() => {
    setShopForm({
      shop_name: shop.shop_name,
      landmark_address: shop.landmark_address,
      opening_time: shop.opening_time,
      closing_time: shop.closing_time,
      latitude: shop.latitude,
      longitude: shop.longitude,
    });
  }, [shop.shop_id]);

  // saveShopProfile: persists the seller's shop details (name, landmark,
  // hours and GPS coordinates) to Django.
  const saveShopProfile = async () => {
    await updateShop(shop.shop_id, {
      ...shopForm,
      latitude: Number(shopForm.latitude),
      longitude: Number(shopForm.longitude),
    });
    showToast('Shop profile updated');
  };

  // Load this shop's incoming orders from the API whenever the dashboard is
  // opened or the selected shop changes.
  useEffect(() => {
    let active = true;
    api.getOrders({ shop: shop.shop_id })
      .then((data) => { if (active) setOrders(unwrap(data)); })
      .catch(() => { /* offline demo: leave the list empty */ });
    return () => { active = false; };
  }, [shop.shop_id]);

  // updateOrderStatus: moves an order through the fulfilment workflow and
  // reflects the new status locally.
  const updateOrderStatus = async (orderId, status) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    try {
      await api.updateOrderStatus(orderId, status);
      showToast(`Order #${orderId} marked ${status.toLowerCase()}`);
    } catch (e) {
      showToast('Could not update order status');
    }
  };

  // A newly registered seller has no shop yet. Let them create one.
  if (auth?.user?.role === 'SELLER' && availableShops.length === 0) {
    return <CreateShopForm />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      {/* Small account eyebrow — this dashboard is tied to the signed-in seller */}
      <div className="flex items-center gap-2 mb-1">
        <LayoutDashboard size={18} className="text-orange-600" />
        <span className="font-mono text-xs tracking-widest text-stone-500 uppercase">Seller dashboard · {auth?.user?.username}</span>
      </div>
      {/* Verification status banner */}
      {auth?.user?.role === 'SELLER' && auth.user.verification_status !== 'APPROVED' && (
        <div className="bg-orange-950 border border-orange-800 rounded-sm p-3 mb-4 text-sm">
          <p className="text-orange-600 font-bold">Seller account {auth.user.verification_status.toLowerCase()}</p>
          <p className="text-stone-300 text-xs mt-1">{auth.user.verification_status === 'PENDING' ? 'Your account is awaiting admin approval. You can create your shop but cannot publish products yet.' : (auth.user.rejection_reason || 'Your account was rejected.')}</p>
        </div>
      )}
      {/* Shop name heading. Admins can switch shops; sellers only see their own. */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="font-display text-3xl sm:text-4xl tracking-wide text-stone-100">{shop.shop_name}</h1>
        {availableShops.length > 1 && (
          <select value={shop.shop_id} onChange={(e) => setCurrentShopId(Number(e.target.value))} className="bg-stone-800 border border-stone-800 text-stone-100 text-xs font-mono rounded-sm px-3 py-2 outline-none">
            {availableShops.map((s) => <option key={s.shop_id} value={s.shop_id} className="bg-stone-950">{s.owner_name} ({s.shop_name})</option>)}
          </select>
        )}
      </div>

      {/* Editable shop profile — seller account management, location and hours */}
      <div className="bg-stone-900 border border-stone-800 rounded-sm p-4 mb-6">
        <p className="font-mono text-xs tracking-widest text-stone-500 uppercase mb-3">Shop profile &amp; location</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input value={shopForm.shop_name} onChange={(e) => setShopForm((f) => ({ ...f, shop_name: e.target.value }))} placeholder="Shop name" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
          <input value={shopForm.landmark_address} onChange={(e) => setShopForm((f) => ({ ...f, landmark_address: e.target.value }))} placeholder="Landmark / address" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-mono text-stone-500">Opens
              <input type="time" value={shopForm.opening_time} onChange={(e) => setShopForm((f) => ({ ...f, opening_time: e.target.value }))} className="mt-1 w-full bg-stone-800 border border-stone-800 rounded-sm px-2 py-2 text-sm text-stone-100 outline-none" />
            </label>
            <label className="text-xs font-mono text-stone-500">Closes
              <input type="time" value={shopForm.closing_time} onChange={(e) => setShopForm((f) => ({ ...f, closing_time: e.target.value }))} className="mt-1 w-full bg-stone-800 border border-stone-800 rounded-sm px-2 py-2 text-sm text-stone-100 outline-none" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-mono text-stone-500">Latitude
              <input type="number" step="0.000001" value={shopForm.latitude} onChange={(e) => setShopForm((f) => ({ ...f, latitude: e.target.value }))} className="mt-1 w-full bg-stone-800 border border-stone-800 rounded-sm px-2 py-2 text-sm text-stone-100 outline-none" />
            </label>
            <label className="text-xs font-mono text-stone-500">Longitude
              <input type="number" step="0.000001" value={shopForm.longitude} onChange={(e) => setShopForm((f) => ({ ...f, longitude: e.target.value }))} className="mt-1 w-full bg-stone-800 border border-stone-800 rounded-sm px-2 py-2 text-sm text-stone-100 outline-none" />
            </label>
          </div>
        </div>
        <button onClick={saveShopProfile} className="mt-3 bg-stone-800 hover:bg-stone-700 text-stone-100 font-bold text-xs uppercase tracking-wide px-4 py-2 rounded-sm">Save shop profile</button>
      </div>

      {/* Three stat cards: listing count, low-stock count, and a live open/closed toggle */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-stone-900 border border-stone-800 rounded-sm p-4">
          <p className="text-stone-500 text-xs font-mono uppercase mb-1">Listed parts</p>
          <p className="text-stone-100 text-2xl font-bold font-mono">{myProducts.length}</p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-sm p-4">
          <p className="text-stone-500 text-xs font-mono uppercase mb-1">Low stock (≤5)</p>
          {/* Number turns red once there's at least one low-stock item */}
          <p className={`text-2xl font-bold font-mono ${lowStock > 0 ? 'text-red-400' : 'text-stone-100'}`}>{lowStock}</p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-stone-500 text-xs font-mono uppercase mb-1">Shop status</p>
            <p className="text-stone-100 text-sm font-semibold">{isShopOpenNow(shop) ? 'Open now' : 'Closed'}</p>
          </div>
          {/* Force-closed / reopen toggle — flips is_open_override on the shop record, overriding the normal hours-based calculation entirely */}
          <button
            onClick={() => { updateShop(shop.shop_id, { is_open_override: !shop.is_open_override }); showToast(shop.is_open_override ? 'Shop marked closed' : 'Shop reopened'); }}
            className={`text-xs font-mono uppercase px-3 py-2 rounded-sm font-bold ${shop.is_open_override ? 'bg-red-950 text-red-400' : 'bg-green-950 text-green-400'}`}
          >
            {shop.is_open_override ? 'Force closed' : 'Reopen shop'}
          </button>
        </div>
      </div>

      {/* Fitter duty-status row */}
      <div className="bg-stone-900 border border-stone-800 rounded-sm p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-orange-950 p-2 rounded-sm"><Wrench size={16} className="text-orange-600" /></span>
          <div>
            <p className="text-stone-100 text-sm font-semibold">{shop.mechanic.full_name} · assigned fitter</p>
            <p className="text-stone-500 text-xs">{shop.mechanic.specialization}</p>
          </div>
        </div>
        {/* Toggles is_on_duty on the nested mechanic object — spreads the
            existing mechanic fields and flips just is_on_duty */}
        <button
          onClick={() => { updateShop(shop.shop_id, { mechanic: { ...shop.mechanic, is_on_duty: !shop.mechanic.is_on_duty } }); showToast('Fitter status updated'); }}
          className={`text-xs font-mono uppercase px-3 py-2 rounded-sm font-bold ${shop.mechanic.is_on_duty ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'}`}
        >
          Mark {shop.mechanic.is_on_duty ? 'busy' : 'available'}
        </button>
      </div>

      {/* Incoming orders + fulfilment workflow */}
      <SectionLabel eyebrow={`${orders.length} order${orders.length === 1 ? '' : 's'}`} title="Incoming orders" />
      <div className="space-y-2 mb-8">
        {orders.length === 0 && <p className="text-stone-500 text-sm">No orders for this shop yet.</p>}
        {orders.map((o) => (
          <div key={o.id} className="bg-stone-900 border border-stone-800 rounded-sm p-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-stone-100 text-sm font-semibold">Order #{o.id} · {o.customer_name}</p>
              <p className="text-stone-500 text-xs">{o.items?.map((i) => `${i.quantity}× ${i.product_name}`).join(', ')}</p>
              <p className="text-stone-600 text-xs font-mono mt-1">{new Date(o.created_at).toLocaleString()}</p>
            </div>
            <span className="font-mono text-orange-600 font-bold text-sm">{formatGHS(o.total)}</span>
            <button onClick={() => { console.log('SELLER Details clicked, orderId =', o.id, 'order =', o); navigate('orderDetail', { orderId: o.id }); }} className="text-xs font-mono uppercase text-stone-400 hover:text-orange-500">Details</button>
            <select
              value={o.status}
              onChange={(e) => updateOrderStatus(o.id, e.target.value)}
              className="bg-stone-800 border border-stone-700 text-stone-100 text-xs font-mono rounded-sm px-2 py-1.5 outline-none"
            >
              <option value="PENDING" className="bg-stone-950">Pending</option>
              <option value="CONFIRMED" className="bg-stone-950">Confirmed</option>
              <option value="READY" className="bg-stone-950">Ready for pickup</option>
              <option value="COMPLETED" className="bg-stone-950">Completed</option>
              <option value="CANCELLED" className="bg-stone-950">Cancelled</option>
            </select>
          </div>
        ))}
      </div>

      {editingProduct && (
        <ProductEditForm product={editingProduct} shopId={shop.shop_id} onClose={() => setEditingProduct(null)} />
      )}
      {/* Editable inventory list */}
      <SectionLabel eyebrow="Inventory" title="Your listings" />
      <div className="space-y-2 mb-4">
        {myProducts.map((p) => <SellerProductRow key={p.product_id} product={p} />)}
        {myProducts.length === 0 && <p className="text-stone-500 text-sm">No parts listed yet — add your first one below.</p>}
      </div>
      <NewProductForm shopId={shop.shop_id} />
    </div>
  );
}

/* ============================================================
   MECHANIC DASHBOARD
   ============================================================ */

// MechanicDashboardView: the simplest of the three dashboards — tied to the
// signed-in fitter's own shop, with a single toggle button that flips their
// on-duty status.
function MechanicDashboardView() {
  const { shops, currentShopId, setCurrentShopId, updateShop, showToast, auth, navigate } = useApp();
  // A mechanic only sees the shop they are attached to. Admins may preview all.
  const availableShops = auth?.user?.role === 'MECHANIC'
    ? shops.filter((s) => s.mechanic?.user_id === auth.user.id)
    : shops;
  const shop = availableShops.find((s) => s.shop_id === currentShopId) || availableShops[0] || shops[0];

  // A newly registered mechanic has no linked Mechanic row yet.
  if (auth?.user?.role === 'MECHANIC' && availableShops.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20 text-center">
        <Wrench size={32} className="mx-auto text-orange-600 mb-3" />
        <p className="text-stone-200 text-sm mb-1">No fitter profile linked to this account</p>
        <p className="text-stone-500 text-xs mb-5">Ask the shop owner to add you as their fitter, then sign in again.</p>
        <button onClick={() => navigate('home')} className="border border-stone-700 hover:border-orange-600 text-stone-100 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">Back to catalog</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-2 mb-1">
        <Wrench size={18} className="text-orange-600" />
        <span className="font-mono text-xs tracking-widest text-stone-500 uppercase">Fitter dashboard · {auth?.user?.username}</span>
      </div>
      {availableShops.length > 1 && (
        <select value={shop.shop_id} onChange={(e) => setCurrentShopId(Number(e.target.value))} className="bg-stone-800 border border-stone-800 text-stone-100 text-xs font-mono rounded-sm px-3 py-2 outline-none mb-6">
          {availableShops.map((s) => <option key={s.shop_id} value={s.shop_id} className="bg-stone-950">{s.mechanic.full_name} ({s.shop_name})</option>)}
        </select>
      )}

      <div className="bg-stone-900 border border-stone-800 rounded-sm p-6 text-center">
        <span className="inline-flex bg-orange-950 p-4 rounded-full mb-4"><Wrench size={30} className="text-orange-600" /></span>
        <h1 className="font-display text-3xl tracking-wide text-stone-100">{shop.mechanic.full_name}</h1>
        <p className="text-stone-400 text-sm mt-1">{shop.mechanic.specialization}</p>
        <p className="text-stone-600 text-xs font-mono mt-1">{shop.mechanic.years_experience} yrs experience · {shop.shop_name}</p>
        <div className="mt-5">
          <StatusPill ok={shop.mechanic.is_on_duty} onLabel="AVAILABLE FOR JOBS" offLabel="CURRENTLY BUSY" size="md" />
        </div>
        {/* The one action this whole screen offers: flip your own duty status */}
        <button
          onClick={() => { updateShop(shop.shop_id, { mechanic: { ...shop.mechanic, is_on_duty: !shop.mechanic.is_on_duty } }); showToast('Duty status updated'); }}
          className="mt-5 bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-xs uppercase tracking-wide px-5 py-2.5 rounded-sm"
        >
          Toggle duty status
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   ADMIN DASHBOARD
   ============================================================ */

// AdminDashboardView: a read-only, platform-wide overview — six summary
// stat cards plus a table listing every shop with its live status and
// assigned fitter. Nothing on this screen is editable; it's purely for
// visibility into the whole platform at a glance.
// AdminSellerApprovalsView: approve or deny pending seller accounts.
function AdminSellerApprovalsView() {
  const { showToast } = useApp();
  const [status, setStatus] = useState('PENDING');
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminSellers(status);
      setSellers(Array.isArray(data) ? data : (data?.results ?? []));
    } catch (e) {
      showToast('Could not load sellers');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [status]);
  const approve = async (id) => {
    try { await api.approveSeller(id); showToast('Seller approved'); load(); } catch (e) { showToast('Could not approve'); }
  };
  const reject = async (id) => {
    const reason = prompt('Rejection reason (required):');
    if (reason === null) return; // cancelled
    const trimmed = reason.trim();
    if (!trimmed) { showToast('A rejection reason is required'); return; }
    try { await api.rejectSeller(id, trimmed); showToast('Seller rejected'); load(); } catch (e) { showToast('Could not reject'); }
  };
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <SectionLabel eyebrow="Admin" title="Seller approvals" />
      <div className="flex gap-2 mb-4">
        {['PENDING','APPROVED','REJECTED'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`text-xs font-mono uppercase px-3 py-1.5 rounded-sm border ${status === s ? 'border-orange-600 text-orange-600' : 'border-stone-700 text-stone-400'}`}>{s}</button>
        ))}
      </div>
      {loading ? <p className="text-stone-400 text-sm">Loading…</p> : sellers.length === 0 ? <p className="text-stone-500 text-sm">No sellers.</p> : (
        <div className="space-y-2">
          {sellers.map((s) => (
            <div key={s.id} className="bg-stone-900 border border-stone-800 rounded-sm p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-stone-100 text-sm font-semibold">{s.username}</p>
                <p className="text-stone-500 text-xs">{s.first_name} {s.last_name} · {s.email} · {s.phone_number}</p>
                {s.rejection_reason && <p className="text-red-400 text-xs mt-1">{s.rejection_reason}</p>}
              </div>
              <div className="flex gap-2">
                {s.verification_status === 'PENDING' && (
                  <>
                    <button onClick={() => approve(s.id)} className="bg-green-600 hover:bg-green-500 text-stone-950 font-bold text-xs uppercase px-3 py-1.5 rounded-sm">Approve</button>
                    <button onClick={() => reject(s.id)} className="bg-red-600 hover:bg-red-500 text-stone-950 font-bold text-xs uppercase px-3 py-1.5 rounded-sm">Deny</button>
                  </>
                )}
                <span className={`text-xs font-mono uppercase px-2 py-1 rounded-sm ${s.verification_status === 'APPROVED' ? 'bg-green-950 text-green-400' : s.verification_status === 'REJECTED' ? 'bg-red-950 text-red-400' : 'bg-stone-800 text-stone-300'}`}>{s.verification_status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminDashboardView() {
  const { shops, products, stats, auth } = useApp();
  const [orders, setOrders] = useState([]);
  // Pre-compute every number the stat cards need.
  const openCount = shops.filter((s) => isShopOpenNow(s)).length;
  const onDutyCount = shops.filter((s) => s.mechanic.is_on_duty).length;
  const lowStockCount = products.filter((p) => p.stock_quantity <= 5).length;

  // Platform-wide order feed for the admin overview.
  useEffect(() => {
    let active = true;
    api.getOrders()
      .then((data) => { if (active) setOrders(unwrap(data)); })
      .catch(() => { /* offline demo: no order table */ });
    return () => { active = false; };
  }, []);

  // statCards: drives the stat-card grid below — one array entry per card, so
  // adding/removing a stat is a one-line change instead of touching JSX.
  // The last four cards come from /api/stats/ (users, orders, reviews, revenue).
  const statCards = [
    { label: 'Total shops', value: shops.length, icon: Store },
    { label: 'Open right now', value: openCount, icon: CheckCircle2 },
    { label: 'Fitters on duty', value: onDutyCount, icon: Wrench },
    { label: 'Listed parts', value: products.length, icon: Package },
    { label: 'Low stock parts', value: lowStockCount, icon: AlertCircle },
    { label: 'Categories', value: CATEGORIES.length, icon: FilterIcon },
    ...(stats ? [
      { label: 'Registered users', value: stats.users, icon: Users },
      { label: 'Orders placed', value: stats.orders, icon: ClipboardCheck },
      { label: 'Reviews', value: stats.reviews, icon: Star },
      { label: 'Revenue (GH₵)', value: Number(stats.revenue).toFixed(2), icon: TrendingUp },
    ] : []),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp size={18} className="text-orange-600" />
        <span className="font-mono text-xs tracking-widest text-stone-500 uppercase">Admin overview · {auth?.user?.username}</span>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="font-display text-3xl sm:text-4xl tracking-wide text-stone-100">Platform overview</h1>
        <a href={(import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api').replace(/\/api\/?$/, '/admin/')} target="_blank" rel="noreferrer" className="border border-stone-700 hover:border-orange-600 text-stone-100 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-sm">
          Manage users &amp; data (Django admin)
        </a>
        <button onClick={() => navigate('adminSellers')} className="border border-stone-700 hover:border-orange-600 text-stone-100 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-sm">
          Seller approvals
        </button>
        <button onClick={() => navigate('adminUsers')} className="border border-stone-700 hover:border-orange-600 text-stone-100 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-sm">
          Users
        </button>
        <button onClick={() => navigate('adminProducts')} className="border border-stone-700 hover:border-orange-600 text-stone-100 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-sm">
          Products
        </button>
        <button onClick={() => navigate('adminCategories')} className="border border-stone-700 hover:border-orange-600 text-stone-100 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-sm">
          Categories
        </button>
      </div>

      {/* Stat card grid — one card per entry in the `statCards` array above */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {statCards.map((s) => (
          <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-sm p-4">
            <s.icon size={16} className="text-orange-600 mb-2" /> {/* renders whichever icon component this stat specified */}
            <p className="text-stone-100 text-2xl font-bold font-mono">{s.value}</p>
            <p className="text-stone-500 text-xs uppercase font-mono mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Recent orders — platform-wide sales activity */}
      <SectionLabel eyebrow={`${orders.length} total`} title="Recent orders" />
      <div className="bg-stone-900 border border-stone-800 rounded-sm overflow-hidden mb-8">
        {orders.length === 0 ? (
          <p className="text-stone-500 text-sm p-4">No orders placed yet.</p>
        ) : (
          orders.slice(0, 10).map((o) => (
            <button key={o.id} onClick={() => navigate('orderDetail', { orderId: o.id })} className="w-full text-left flex flex-wrap items-center gap-3 px-4 py-3 border-b border-stone-800 last:border-0 text-sm hover:bg-stone-800 transition-colors">
              <span className="text-stone-100 font-mono w-16">#{o.id}</span>
              <span className="text-stone-300 flex-1 truncate">{o.customer_name} · {o.shop_name}</span>
              <span className="text-stone-500 text-xs font-mono">{new Date(o.created_at).toLocaleDateString()}</span>
              <span className={`text-xs font-mono uppercase px-2 py-1 rounded-sm ${o.status === 'CANCELLED' ? 'bg-red-950 text-red-400' : o.status === 'COMPLETED' ? 'bg-green-950 text-green-400' : 'bg-stone-800 text-stone-300'}`}>{o.status}</span>
              <span className="text-orange-600 font-mono font-bold">{formatGHS(o.total)}</span>
            </button>
          ))
        )}
      </div>

      {/* Full shop table */}
      <SectionLabel eyebrow="Directory" title="All shops" />
      <div className="bg-stone-900 border border-stone-800 rounded-sm overflow-hidden">
        {/* Column headings — hidden on mobile, where the grid below reflows to 2 columns instead of 12 */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-stone-800 text-xs font-mono uppercase text-stone-500">
          <span className="col-span-4">Shop</span>
          <span className="col-span-3">Owner</span>
          <span className="col-span-2">Status</span>
          <span className="col-span-3">Fitter</span>
        </div>
        {/* One row per shop */}
        {shops.map((s) => (
          <div key={s.shop_id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 px-4 py-3 border-b border-stone-800 last:border-0 text-sm items-center">
            <span className="col-span-2 sm:col-span-4 text-stone-100 font-medium truncate">{s.shop_name}</span>
            <span className="col-span-2 sm:col-span-3 text-stone-400 text-xs truncate">{s.owner_name}</span>
            <span className="col-span-1 sm:col-span-2"><StatusPill ok={isShopOpenNow(s)} onLabel="OPEN" offLabel="CLOSED" /></span>
            <span className="col-span-1 sm:col-span-3 text-stone-400 text-xs truncate">{s.mechanic.full_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   ACCOUNT VIEW (real registration + login)
   ============================================================ */

function AccountView() {
  const { auth, login, register, logout, updateProfile, navigate, showToast } = useApp();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    name: '', username: '', email: '', phone_number: '', role: 'RIDER', password: '',
  });
  const [profile, setProfile] = useState({ first_name: '', last_name: '', email: '', phone_number: '' });
  const [profileBusy, setProfileBusy] = useState(false);

  // Keep the editable profile fields in sync with the signed-in user.
  useEffect(() => {
    if (auth?.user) {
      setProfile({
        first_name: auth.user.first_name || '',
        last_name: auth.user.last_name || '',
        email: auth.user.email || '',
        phone_number: auth.user.phone_number || '',
      });
    }
  }, [auth?.user]);

  const saveProfile = async () => {
    setProfileBusy(true);
    try {
      await updateProfile(profile);
      showToast('Profile updated');
    } catch (e) {
      showToast('Could not update profile');
    } finally {
      setProfileBusy(false);
    }
  };

  const submitLogin = async () => {
    setError('');
    setBusy(true);
    try {
      await login(loginForm);
      showToast('Welcome back');
      navigate('home');
    } catch (e) {
      setError('Could not sign in. Check your username and password.');
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async () => {
    setError('');
    if (!registerForm.username.trim() || !registerForm.phone_number.trim() || registerForm.password.length < 6) {
      setError('Username, phone number and a 6+ character password are required.');
      return;
    }
    setBusy(true);
    try {
      await register(registerForm);
      showToast('Account created');
      navigate('home');
    } catch (e) {
      setError('Could not create account. That username or phone number may already be in use.');
    } finally {
      setBusy(false);
    }
  };

  if (auth?.user) {
    const dashboardView = auth.user.role === 'SELLER' ? 'seller' : auth.user.role === 'MECHANIC' ? 'mechanic' : auth.user.role === 'ADMIN' ? 'admin' : null;
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <SectionLabel eyebrow="Your account" title={auth.user.username} />
        <div className="bg-stone-900 border border-stone-800 rounded-sm p-6 space-y-3">
          <p className="text-stone-300 text-sm">Signed in as <span className="text-stone-100 font-semibold">{auth.user.first_name || auth.user.username}</span>.</p>
          <p className="text-stone-500 text-xs font-mono">Role: {auth.user.role} · Username: {auth.user.username}</p>

          {/* Editable profile — customer/seller account management */}
          <div className="grid sm:grid-cols-2 gap-3 pt-3">
            <input value={profile.first_name} onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))} placeholder="First name" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            <input value={profile.last_name} onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))} placeholder="Last name" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            <input value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            <input value={profile.phone_number} onChange={(e) => setProfile((p) => ({ ...p, phone_number: e.target.value }))} placeholder="Phone number" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
          </div>
          <button onClick={saveProfile} disabled={profileBusy} className="bg-stone-800 hover:bg-stone-700 disabled:opacity-60 text-stone-100 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">
            {profileBusy ? 'Saving…' : 'Save profile'}
          </button>

          <div className="flex flex-wrap gap-3 pt-3">
            {dashboardView && (
              <button onClick={() => navigate(dashboardView)} className="bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">
                Open dashboard
              </button>
            )}
            {auth.user.role === 'RIDER' && (
              <button onClick={() => navigate('myOrders')} className="bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">
                My orders
              </button>
            )}
            <button onClick={() => navigate('notifications')} className="border border-stone-700 hover:border-orange-600 text-stone-100 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">
              Notifications
            </button>
            <button onClick={async () => { await logout(); showToast('Signed out'); navigate('home'); }} className="border border-stone-700 hover:border-red-500 text-stone-300 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
      <SectionLabel eyebrow="Account" title={mode === 'login' ? 'Sign in' : 'Create account'} />
      <div className="flex gap-2 mb-5">
        <button onClick={() => setMode('login')} className={`flex-1 text-xs font-bold uppercase tracking-wide py-2.5 rounded-sm ${mode === 'login' ? 'bg-orange-600 text-stone-950' : 'bg-stone-800 text-stone-300'}`}>Sign in</button>
        <button onClick={() => setMode('register')} className={`flex-1 text-xs font-bold uppercase tracking-wide py-2.5 rounded-sm ${mode === 'register' ? 'bg-orange-600 text-stone-950' : 'bg-stone-800 text-stone-300'}`}>Register</button>
      </div>

      <div className="bg-stone-900 border border-stone-800 rounded-sm p-5 space-y-3">
        {mode === 'login' ? (
          <>
            <input value={loginForm.username} onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))} placeholder="Username" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            <input type="password" value={loginForm.password} onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            <p className="text-stone-600 text-xs">Demo accounts: rider_demo / seller usernames / admin_demo — password demo-password-123</p>
            <button onClick={submitLogin} disabled={busy} className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-stone-950 font-bold text-sm uppercase tracking-wide py-3 rounded-sm">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </>
        ) : (
          <>
            <input value={registerForm.name} onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            <input value={registerForm.username} onChange={(e) => setRegisterForm((f) => ({ ...f, username: e.target.value }))} placeholder="Username" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            <input value={registerForm.email} onChange={(e) => setRegisterForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email (optional)" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            <input value={registerForm.phone_number} onChange={(e) => setRegisterForm((f) => ({ ...f, phone_number: e.target.value }))} placeholder="Phone number, e.g. 0240000000" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            <select value={registerForm.role} onChange={(e) => setRegisterForm((f) => ({ ...f, role: e.target.value }))} className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 outline-none">
              <option value="RIDER" className="bg-stone-950">I am a rider / customer</option>
              <option value="SELLER" className="bg-stone-950">I own a spare parts shop</option>
              <option value="MECHANIC" className="bg-stone-950">I am a mechanic / fitter</option>
            </select>
            <input type="password" value={registerForm.password} onChange={(e) => setRegisterForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password (6+ characters)" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none focus:border-orange-600" />
            <button onClick={submitRegister} disabled={busy} className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-stone-950 font-bold text-sm uppercase tracking-wide py-3 rounded-sm">
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </>
        )}
        {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={12} /> {error}</p>}
      </div>
    </div>
  );
}

/* ============================================================
   NOTIFICATIONS VIEW
   ============================================================ */

function NotificationsView() {
  const { notifications, refreshNotifications, markNotificationRead, markAllRead } = useApp();
  const [loading, setLoading] = useState(true);
  // Always pull the latest list when this screen opens, so a freshly
  // placed order's notification shows up even if the post-order refresh
  // was missed (e.g. a slow/cold backend).
  useEffect(() => {
    let active = true;
    (async () => {
      await refreshNotifications();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <SectionLabel eyebrow="Activity" title="Notifications" />
        <div className="flex gap-2">
          <button onClick={refreshNotifications} className="text-xs font-mono uppercase text-stone-400 hover:text-orange-500">Refresh</button>
          <button onClick={markAllRead} className="text-xs font-mono uppercase text-orange-600 hover:text-orange-500">Mark all read</button>
        </div>
      </div>
      {loading ? (
        <p className="text-stone-500 text-sm">Loading notifications…</p>
      ) : notifications.length === 0 ? (
        <p className="text-stone-500 text-sm">No notifications yet. Place an order or update a listing to see activity here.</p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`bg-stone-900 border rounded-sm p-4 ${n.is_read ? 'border-stone-800' : 'border-orange-800'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-stone-100 text-sm font-semibold">{n.title}</p>
                  <p className="text-stone-400 text-xs mt-1">{n.message}</p>
                  <p className="text-stone-600 text-xs font-mono mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                {!n.is_read && (
                  <button onClick={() => markNotificationRead(n.id)} className="text-xs font-mono uppercase text-orange-600 hover:text-orange-500 shrink-0">Mark read</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   FOOTER
   ============================================================ */

// Footer: the site-wide footer — brand blurb, quick nav links, and an
// honest note that this is a demo build with simulated payments.
function Footer() {
  const { navigate } = useApp();
  return (
    <footer className="border-t border-stone-800 mt-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid sm:grid-cols-3 gap-8">
        {/* Column 1: brand mark + one-line description */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-orange-600 p-1.5 rounded-sm"><Bike size={16} className="text-stone-950" /></span>
            <span className="font-display text-lg tracking-wider text-stone-100">KWABENYA SPARES</span>
          </div>
          <p className="text-stone-500 text-xs leading-relaxed">Connecting Kwabenya's motorcycle spare parts shops, their fitters, and the riders who keep Accra moving.</p>
        </div>
        {/* Column 2: quick nav links, reusing the same navigate() calls as the header */}
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-stone-600 mb-2">Browse</p>
          <div className="flex flex-col gap-1.5 text-sm text-stone-300">
            <button onClick={() => navigate('home')} className="text-left hover:text-orange-500 w-fit">Catalog</button>
            <button onClick={() => navigate('shops')} className="text-left hover:text-orange-500 w-fit">All shops</button>
          </div>
        </div>
        {/* Column 3: honesty note about the demo/mock nature of the build */}
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-stone-600 mb-2">Demo build</p>
          <p className="text-stone-500 text-xs leading-relaxed">Catalogue, accounts, orders, reviews and notifications are backed by the Django REST API. MoMo / Telecel Cash checkout is simulated — no real money is charged.</p>
        </div>
      </div>
    </footer>
  );
}

/* ============================================================
   MAIN CONTENT SWITCH
   ============================================================ */

// OrderStatusBadge: small colored pill for an order's status.
function OrderStatusBadge({ status }) {
  const colors = {
    PENDING: 'bg-orange-950 text-orange-600 border-orange-800',
    CONFIRMED: 'bg-stone-800 text-stone-100 border-stone-700',
    READY: 'bg-green-950 text-green-400 border-green-800',
    COMPLETED: 'bg-green-950 text-green-400 border-green-800',
    CANCELLED: 'bg-stone-800 text-stone-400 border-stone-700',
  };
  return (
    <span className={`text-xs font-mono uppercase px-2 py-1 rounded-sm border ${colors[status] || 'bg-stone-800 text-stone-300 border-stone-700'}`}>
      {status}
    </span>
  );
}

// MyOrdersView: customer's order history. Clicking an order opens OrderDetailView.
function MyOrdersView() {
  const { auth, navigate } = useApp();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let active = true;
    api.getOrders()
      .then((data) => { if (active) setOrders(unwrap(data)); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  if (loading) return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-stone-400 text-sm">Loading orders…</div>;
  if (error) return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-red-400 text-sm">{error}</div>;
  if (orders.length === 0) return <EmptyState onBack={() => navigate('home')} label="You have no orders yet" />;
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <SectionLabel eyebrow="Account" title="My orders" />
      <div className="space-y-3 mt-6">
        {orders.map((o) => (
          <button key={o.id} onClick={() => navigate('orderDetail', { orderId: o.id })} className="w-full text-left bg-stone-900 border border-stone-800 rounded-sm p-4 hover:border-orange-600 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-orange-600 font-bold">#{o.id}</span>
              <OrderStatusBadge status={o.status} />
            </div>
            <p className="text-stone-400 text-xs mt-1">{new Date(o.created_at).toLocaleString()}</p>
            <p className="text-stone-100 text-sm mt-2">{o.items?.length || 0} item(s) · {formatGHS(o.total)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// OrderDetailView: shared full-order view. Role-based sections: customer sees
// basics; shop owner and admin also see contact info and a status control.
function OrderDetailView() {
  const { selectedOrderId, auth, navigate, showToast, refreshNotifications } = useApp();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [statusBusy, setStatusBusy] = useState(false);
  const canManage = auth?.user && (auth.user.role === 'ADMIN' || (auth.user.role === 'SELLER' && order?.shop?.owner === auth.user.id));

  useEffect(() => {
    if (!selectedOrderId) {
      setLoading(false);
      setError('No order selected.');
      return;
    }
    let active = true;
    setTimedOut(false);
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      if (active) { setTimedOut(true); setLoading(false); }
    }, 15000);
    api.getOrder(selectedOrderId)
      .then((data) => { if (active) setOrder(data); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) { clearTimeout(timer); setLoading(false); } });
    return () => { active = false; clearTimeout(timer); };
  }, [selectedOrderId, retryKey]);

  const updateStatus = async (newStatus) => {
    if (!order) return;
    setStatusBusy(true);
    try {
      const updated = await api.updateOrderStatus(order.id, newStatus);
      setOrder(updated);
      showToast(`Order #${order.id} marked ${newStatus}`);
      refreshNotifications();
    } catch (e) {
      showToast('Could not update order status');
    } finally {
      setStatusBusy(false);
    }
  };

  const backView = auth?.user?.role === 'SELLER' ? 'seller' : auth?.user?.role === 'ADMIN' ? 'admin' : 'myOrders';

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-stone-400 text-sm">Loading order…</p>
      {timedOut && (
        <div className="mt-4">
          <p className="text-stone-500 text-xs mb-3">Taking longer than expected.</p>
          <button onClick={() => { setRetryKey((k) => k + 1); }} className="border border-stone-700 hover:border-orange-600 text-stone-100 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">
            Retry
          </button>
        </div>
      )}
    </div>
  );
  if (error || !order) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-red-400 text-sm mb-3">{error || 'Order not found.'}</p>
      <button onClick={() => { setRetryKey((k) => k + 1); }} className="border border-stone-700 hover:border-orange-600 text-stone-100 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">
        Retry
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <button onClick={() => navigate(backView)} className="flex items-center gap-1.5 text-xs font-mono uppercase text-stone-400 hover:text-orange-500 mb-4">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="font-display text-3xl sm:text-4xl tracking-wide text-stone-100">Order #{order.id}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* Items */}
      <div className="bg-stone-900 border border-stone-800 rounded-sm p-4 mb-4">
        <p className="font-mono text-xs tracking-widest text-stone-500 uppercase mb-3">Items</p>
        <div className="space-y-3">
          {(order.items || []).map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-stone-800 to-stone-900 rounded-sm h-12 w-12 shrink-0 flex items-center justify-center overflow-hidden">
                <img src={resolveImageUrl(item.image_url)} alt={item.product_name || 'Product'} className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-stone-100 text-sm font-semibold truncate">{item.product_name || 'Product unavailable'}</p>
                <p className="text-stone-500 text-xs">{item.quantity} × {formatGHS(item.unit_price)}</p>
              </div>
              <span className="font-mono text-orange-600 font-bold text-sm">{formatGHS(item.unit_price * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="h-px bg-stone-800 my-3" />
        <div className="flex items-center justify-between text-sm font-bold">
          <span className="text-stone-100">Total</span>
          <span className="font-mono text-orange-600">{formatGHS(order.total)}</span>
        </div>
      </div>

      {/* Delivery & payment */}
      <div className="bg-stone-900 border border-stone-800 rounded-sm p-4 mb-4">
        <p className="font-mono text-xs tracking-widest text-stone-500 uppercase mb-3">Delivery & payment</p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-stone-500 text-xs font-mono uppercase">Contact</span><p className="text-stone-100">{order.contact_name || order.customer_name}</p></div>
          <div><span className="text-stone-500 text-xs font-mono uppercase">Phone</span><p className="text-stone-100">{order.contact_phone}</p></div>
          <div><span className="text-stone-500 text-xs font-mono uppercase">Landmark</span><p className="text-stone-100">{order.notes || '—'}</p></div>
          <div><span className="text-stone-500 text-xs font-mono uppercase">Payment</span><p className="text-stone-100">{order.payment_method}</p></div>
          <div><span className="text-stone-500 text-xs font-mono uppercase">Date</span><p className="text-stone-100">{new Date(order.created_at).toLocaleString()}</p></div>
          <div><span className="text-stone-500 text-xs font-mono uppercase">Shop</span><p className="text-stone-100">{order.shop_name}</p></div>
        </div>
      </div>

      {auth?.user?.role === 'RIDER' && (
        <button onClick={async () => { const body = prompt('Your question about this order:'); if (!body) return; try { await api.createEnquiry({ order: order.id, body }); showToast('Enquiry sent'); navigate('enquiries'); } catch (e) { showToast('Could not send enquiry'); } }} className="w-full border border-stone-700 hover:border-orange-600 text-stone-100 font-bold text-xs uppercase tracking-wide py-2.5 rounded-sm mb-4">
          Ask about this order
        </button>
      )}

      {/* Role-based: contact info + status control for shop owner / admin */}
      {canManage && (
        <div className="bg-stone-900 border border-stone-800 rounded-sm p-4">
          <p className="font-mono text-xs tracking-widest text-stone-500 uppercase mb-3">Fulfilment (shop owner / admin)</p>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs font-mono text-stone-500">Status</label>
            <select
              value={order.status}
              disabled={statusBusy}
              onChange={(e) => updateStatus(e.target.value)}
              className="bg-stone-800 border border-stone-700 text-stone-100 text-xs font-mono rounded-sm px-3 py-2 outline-none"
            >
              {['PENDING','CONFIRMED','READY','COMPLETED','CANCELLED'].map((s) => (
                <option key={s} value={s} className="bg-stone-950">{s}</option>
              ))}
            </select>
            {statusBusy && <span className="text-stone-500 text-xs">Updating…</span>}
          </div>
          <p className="text-stone-500 text-xs mt-2">Customer: {order.customer_name} · {order.contact_phone}</p>
        </div>
      )}
    </div>
  );
}

// EnquiriesView: customer/seller enquiry threads.
function EnquiriesView() {
  const { auth, showToast } = useApp();
  const [enquiries, setEnquiries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getEnquiries();
      setEnquiries(Array.isArray(data) ? data : (data?.results ?? []));
    } catch (e) {
      showToast('Could not load enquiries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openThread = async (id) => {
    try {
      const data = await api.getEnquiry(id);
      setSelected(data);
      await api.markEnquiryRead(id).catch(() => {});
    } catch (e) {
      showToast('Could not open enquiry');
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      const msg = await api.replyEnquiry(selected.id, reply.trim());
      setSelected({ ...selected, messages: [...(selected.messages || []), msg] });
      setReply('');
      load();
    } catch (e) {
      showToast('Could not send reply');
    } finally {
      setSending(false);
    }
  };

  const closeThread = async () => {
    if (!selected) return;
    try { await api.closeEnquiry(selected.id); setSelected({ ...selected, status: 'CLOSED' }); load(); } catch (e) { showToast('Could not close'); }
  };

  if (selected) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-xs font-mono uppercase text-stone-400 hover:text-orange-500 mb-4"><ArrowLeft size={14} /> Back</button>
        <SectionLabel eyebrow="Enquiry" title={selected.subject || 'Enquiry'} />
        <p className="text-stone-500 text-xs mt-1">{selected.product_name ? `Product: ${selected.product_name}` : (selected.order ? `Order #${selected.order}` : '')}</p>
        <div className="bg-stone-900 border border-stone-800 rounded-sm p-4 mt-4 space-y-3 max-h-96 overflow-y-auto">
          {(selected.messages || []).map((m) => (
            <div key={m.id} className={`p-3 rounded-sm ${m.sender === auth?.user?.id ? 'bg-stone-800 ml-8' : 'bg-stone-950 mr-8'}`}>
              <p className="text-stone-100 text-sm">{m.body}</p>
              <p className="text-stone-500 text-xs mt-1">{m.sender_name} · {new Date(m.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
        {selected.status === 'OPEN' && (
          <div className="mt-4 space-y-2">
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Type your reply…" className="w-full bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none resize-none" />
            <div className="flex gap-2">
              <button onClick={sendReply} disabled={sending || !reply.trim()} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-stone-950 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">{sending ? 'Sending…' : 'Send reply'}</button>
              <button onClick={closeThread} className="border border-stone-700 text-stone-300 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-sm">Close enquiry</button>
            </div>
          </div>
        )}
        {selected.status === 'CLOSED' && <p className="text-stone-500 text-xs mt-4">This enquiry is closed.</p>}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <SectionLabel eyebrow="Messages" title="Enquiries" />
      {loading ? <p className="text-stone-400 text-sm mt-4">Loading…</p> : enquiries.length === 0 ? <p className="text-stone-500 text-sm mt-4">No enquiries yet.</p> : (
        <div className="space-y-2 mt-6">
          {enquiries.map((e) => (
            <button key={e.id} onClick={() => openThread(e.id)} className="w-full text-left bg-stone-900 border border-stone-800 rounded-sm p-4 hover:border-orange-600 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <span className="text-stone-100 text-sm font-semibold">{e.subject || 'Enquiry'}</span>
                <span className={`text-xs font-mono uppercase px-2 py-1 rounded-sm ${e.status === 'OPEN' ? 'bg-orange-950 text-orange-600' : 'bg-stone-800 text-stone-400'}`}>{e.status}</span>
              </div>
              <p className="text-stone-500 text-xs mt-1">{e.product_name || (e.order ? `Order #${e.order}` : '')} · {e.customer_name} → {e.seller_name}</p>
              <p className="text-stone-400 text-xs mt-1 truncate">{e.messages?.[e.messages.length - 1]?.body || ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// AdminUsersView: list/search/suspend/activate/delete users.
function AdminUsersView() {
  const { showToast } = useApp();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminUsers({ q, role, status });
      setUsers(data.results || []);
    } catch (e) { showToast('Could not load users'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [q, role, status]);
  const suspend = async (id) => { try { await api.suspendUser(id); showToast('Suspended'); load(); } catch (e) { showToast('Failed'); } };
  const activate = async (id) => { try { await api.activateUser(id); showToast('Activated'); load(); } catch (e) { showToast('Failed'); } };
  const remove = async (id) => { if (!confirm('Delete this user?')) return; try { await api.deleteUser(id); showToast('Deleted'); load(); } catch (e) { showToast('Failed'); } };
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <SectionLabel eyebrow="Admin" title="Users" />
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 outline-none">
          <option value="">All roles</option>
          <option value="RIDER">Rider</option>
          <option value="SELLER">Seller</option>
          <option value="MECHANIC">Mechanic</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 outline-none">
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      {loading ? <p className="text-stone-400 text-sm">Loading…</p> : users.length === 0 ? <p className="text-stone-500 text-sm">No users.</p> : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="bg-stone-900 border border-stone-800 rounded-sm p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-stone-100 text-sm font-semibold">{u.username} <span className="text-stone-500 text-xs">({u.role})</span></p>
                <p className="text-stone-500 text-xs">{u.email || '—'} · {u.phone_number}</p>
              </div>
              <div className="flex gap-2">
                {u.is_active ? (
                  <button onClick={() => suspend(u.id)} className="text-xs font-mono uppercase text-red-400 hover:text-red-300">Suspend</button>
                ) : (
                  <button onClick={() => activate(u.id)} className="text-xs font-mono uppercase text-green-400 hover:text-green-300">Activate</button>
                )}
                <button onClick={() => remove(u.id)} className="text-xs font-mono uppercase text-stone-400 hover:text-red-400">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// AdminProductsView: list/hide/unhide/remove products.
function AdminProductsView() {
  const { showToast } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminProducts({ q, status });
      setProducts(data.results || []);
    } catch (e) { showToast('Could not load products'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [q, status]);
  const hide = async (id) => { const reason = prompt('Reason for hiding:'); if (!reason) return; try { await api.hideProduct(id, reason); showToast('Hidden'); load(); } catch (e) { showToast('Failed'); } };
  const unhide = async (id) => { try { await api.unhideProduct(id); showToast('Restored'); load(); } catch (e) { showToast('Failed'); } };
  const remove = async (id) => { const reason = prompt('Reason for removing:'); if (!reason) return; try { await api.removeProductAdmin(id, reason); showToast('Removed'); load(); } catch (e) { showToast('Failed'); } };
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <SectionLabel eyebrow="Admin" title="Products" />
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 outline-none">
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="hidden">Hidden</option>
          <option value="removed">Removed</option>
        </select>
      </div>
      {loading ? <p className="text-stone-400 text-sm">Loading…</p> : products.length === 0 ? <p className="text-stone-500 text-sm">No products.</p> : (
        <div className="space-y-2">
          {products.map((p) => (
            <div key={p.id} className="bg-stone-900 border border-stone-800 rounded-sm p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-stone-100 text-sm font-semibold">{p.part_name}</p>
                <p className="text-stone-500 text-xs">{p.shop?.shop_name} · {p.is_hidden ? 'Hidden' : p.is_removed ? 'Removed' : 'Active'}</p>
                {p.moderation_reason && <p className="text-red-400 text-xs mt-1">{p.moderation_reason}</p>}
              </div>
              <div className="flex gap-2">
                {p.is_hidden && !p.is_removed && <button onClick={() => unhide(p.id)} className="text-xs font-mono uppercase text-green-400 hover:text-green-300">Unhide</button>}
                {!p.is_hidden && !p.is_removed && <button onClick={() => hide(p.id)} className="text-xs font-mono uppercase text-orange-400 hover:text-orange-300">Hide</button>}
                {!p.is_removed && <button onClick={() => remove(p.id)} className="text-xs font-mono uppercase text-red-400 hover:text-red-300">Remove</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// AdminCategoriesView: create/edit/delete categories.
function AdminCategoriesView() {
  const { showToast } = useApp();
  const [name, setName] = useState('');
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getCategories();
      setCats(Array.isArray(data) ? data : (data?.results ?? []));
    } catch (e) { showToast('Could not load categories'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!name.trim()) return;
    try { await api.createCategory(name.trim()); showToast('Category created'); setName(''); load(); } catch (e) { showToast('Failed (maybe duplicate)'); }
  };
  const rename = async (id, current) => {
    const newName = prompt('New name:', current);
    if (!newName || newName.trim() === current) return;
    try { await api.updateCategory(id, newName.trim()); showToast('Updated'); load(); } catch (e) { showToast('Failed (maybe duplicate)'); }
  };
  const remove = async (id) => {
    if (!confirm('Delete this category?')) return;
    try { await api.deleteCategory(id); showToast('Deleted'); load(); } catch (e) { showToast('Cannot delete (has products?)'); }
  };
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <SectionLabel eyebrow="Admin" title="Categories" />
      <div className="flex gap-2 mb-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" className="flex-1 bg-stone-800 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder-stone-600 outline-none" />
        <button onClick={create} className="bg-orange-600 hover:bg-orange-500 text-stone-950 font-bold text-xs uppercase tracking-wide px-4 py-2.5 rounded-sm">Add</button>
      </div>
      {loading ? <p className="text-stone-400 text-sm">Loading…</p> : (
        <div className="space-y-2">
          {cats.map((c) => (
            <div key={c.id} className="bg-stone-900 border border-stone-800 rounded-sm p-3 flex items-center justify-between gap-3">
              <span className="text-stone-100 text-sm">{c.category_name}</span>
              <div className="flex gap-2">
                <button onClick={() => rename(c.id, c.category_name)} className="text-xs font-mono uppercase text-stone-400 hover:text-orange-500">Edit</button>
                <button onClick={() => remove(c.id)} className="text-xs font-mono uppercase text-red-400 hover:text-red-300">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// MainContent: the app's "router" — reads the current `view` string out of
// context and renders whichever top-level view component matches it. Falls
// back to HomeView for any unrecognized value (shouldn't normally happen,
// since `view` is only ever set by navigate() calls using these exact names).
function MainContent() {
  const { view } = useApp();
  switch (view) {
    case 'home': return <HomeView />;
    case 'shops': return <ShopsView />;
    case 'shopDetail': return <ShopDetailView />;
    case 'productDetail': return <ProductDetailView />;
    case 'cart': return <CartView />;
    case 'checkout': return <CheckoutView />;
    case 'confirmation': return <ConfirmationView />;
    case 'seller': return <AccessGuard allowedRoles={['SELLER']}><SellerDashboardView /></AccessGuard>;
    case 'mechanic': return <AccessGuard allowedRoles={['MECHANIC']}><MechanicDashboardView /></AccessGuard>;
    case 'admin': return <AccessGuard allowedRoles={['ADMIN']}><AdminDashboardView /></AccessGuard>;
    case 'adminSellers': return <AccessGuard allowedRoles={['ADMIN']}><AdminSellerApprovalsView /></AccessGuard>;
    case 'adminUsers': return <AccessGuard allowedRoles={['ADMIN']}><AdminUsersView /></AccessGuard>;
    case 'adminProducts': return <AccessGuard allowedRoles={['ADMIN']}><AdminProductsView /></AccessGuard>;
    case 'adminCategories': return <AccessGuard allowedRoles={['ADMIN']}><AdminCategoriesView /></AccessGuard>;
    case 'enquiries': return <AccessGuard><EnquiriesView /></AccessGuard>;
    case 'account': return <AccountView />;
    case 'myOrders': return <AccessGuard><MyOrdersView /></AccessGuard>;
    case 'orderDetail': return <AccessGuard><OrderDetailView /></AccessGuard>;
    case 'notifications': return <AccessGuard><NotificationsView /></AccessGuard>;
    default: return <HomeView />;
  }
}

/* ============================================================
   APP ROOT
   ============================================================ */

// App: the top-level component and default export of this file. Owns every
// piece of state the whole platform needs, defines all of the functions
// that mutate that state, bundles it all into one context value, and
// renders the actual page structure (Header, ticker, MainContent, Footer,
// Toast) inside the AppCtx.Provider so every descendant component can read
// and update it via useApp().
export default function App() {
  // --- DATA STATE --------------------------------------------------------
  const [shops, setShops] = useState(SHOPS_INIT); // every shop (mutable copy of the mock data — seller actions edit this)
  const [products, setProducts] = useState(PRODUCTS_INIT); // every product (mutable copy — seller add/edit/delete act on this)
  // API connection + real authenticated session. The app falls back to the
  // mock catalogue when the backend is unreachable, so the demo still runs.
  const [apiOnline, setApiOnline] = useState(false);
  const [auth, setAuth] = useState(() => {
    try {
      const raw = localStorage.getItem('kwabenya_auth');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  // False while a restored token is being checked against /auth/me/. Admin
  // stats and notifications wait for this so a tampered localStorage role
  // never fires privileged requests before the server corrects it.
  const [sessionReady, setSessionReady] = useState(() => !auth?.token);
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState(null);
  // Light/dark theme, persisted. Defaults to the original dark look.
  const [theme, setTheme] = useState(() => localStorage.getItem('kwabenya_theme') || 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('kwabenya_theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // --- CART STATE ----------------------------------------------------------
  const [cart, setCart] = useState([]); // array of { productId, qty } — the shopping cart

  // --- NAVIGATION STATE ------------------------------------------------
  const [view, setView] = useState('home'); // which top-level screen MainContent should render
  const [selectedShopId, setSelectedShopId] = useState(null); // which shop ShopDetailView should show
  const [selectedProductId, setSelectedProductId] = useState(null); // which product ProductDetailView should show
  const [selectedOrderId, setSelectedOrderId] = useState(null); // which order OrderDetailView should show
  // Restore an order-detail view from the URL on first load (refresh support).
  useEffect(() => {
    const m = window.location.pathname.match(/^\/orders\/(\d+)$/);
    if (m) { setView('orderDetail'); setSelectedOrderId(Number(m[1])); }
  }, []);
  // Keep the URL in sync when an order detail is opened.
  useEffect(() => {
    if (view === 'orderDetail' && selectedOrderId) {
      const url = `/orders/${selectedOrderId}`;
      if (window.location.pathname !== url) window.history.pushState({}, '', url);
    }
  }, [view, selectedOrderId]);
  // Handle browser back/forward.
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/orders\/(\d+)$/);
      if (m) { setView('orderDetail'); setSelectedOrderId(Number(m[1])); }
      else { setView('home'); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // --- SESSION / ROLE STATE ----------------------------------------------
  // The signed-in account's role is the single source of truth for access
  // control. Guests have no role and can only browse as a rider.
  // `currentShopId` is which shop the seller/mechanic dashboards focus on;
  // each dashboard filters this to the shop owned by / assigned to the
  // signed-in account, and the API enforces the same rule.
  const [currentShopId, setCurrentShopId] = useState(1);

  // --- SEARCH & FILTER STATE ------------------------------------------
  const [searchQuery, setSearchQuery] = useState(''); // the committed (not draft) search text, applied in HomeView
  const [filters, setFilters] = useState({ categoryIds: [], shopId: 'all', minPrice: '', maxPrice: '', sort: 'relevance' }); // catalog filter/sort state

  // --- TOAST STATE ---------------------------------------------------------
  const [toast, setToast] = useState(null); // current toast message, or null
  const [lastOrder, setLastOrder] = useState(null); // the most recently placed order, read by ConfirmationView
  const toastTimer = useRef(null); // holds the pending setTimeout id so a new toast can cancel an older one's timer

  // showToast: sets the message shown by <Toast/> and schedules it to
  // clear itself after 2.2 seconds. If a toast is already showing when a
  // new one arrives, the old timer is cancelled first so the new message
  // gets its own full 2.2 seconds rather than being cut short.
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };
  // Cleanup effect: if the App component itself ever unmounts while a
  // toast timer is still pending, cancel it so it doesn't try to update
  // state on an unmounted component.
  useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

  // --- API DATA LOADING ------------------------------------------------
  // Pull the live catalogue from Django. If the backend is down (or CORS
  // blocks it), the mock data already in state stays visible, so the app
  // never shows a blank screen.
  const loadCatalogue = async () => {
    try {
      const [shopData, productData] = await Promise.all([
        api.getShops(),
        api.getProducts(),
      ]);
      const liveShops = unwrap(shopData).map(mapApiShop);
      const liveProducts = unwrap(productData).map(mapApiProduct);
      if (liveShops.length) setShops(liveShops);
      if (liveProducts.length) setProducts(liveProducts);
      setApiOnline(true);
    } catch (e) {
      // Deliberately silent: the demo catalogue is the fallback.
      console.warn('Kwabenya API unavailable, using local demo data.', e.message);
      setApiOnline(false);
    }
  };

  const refreshNotifications = async () => {
    // Guests have no token and no notifications to fetch.
    if (!getToken()) {
      setNotifications([]);
      return 0;
    }
    try {
      const data = await api.getNotifications();
      const list = unwrap(data);
      console.log('refreshNotifications: loaded', list.length, 'notifications');
      setNotifications(list);
      return list.length;
    } catch (e) {
      console.warn('Could not load notifications.', e.message);
      return 0;
    }
  };

  const refreshStats = async (roleOverride) => {
    // /api/stats/ is admin-only; skip the request for everyone else.
    const effectiveRole = roleOverride || auth?.user?.role;
    if (effectiveRole !== 'ADMIN') {
      setStats(null);
      return;
    }
    try {
      setStats(await api.getStats());
    } catch (e) {
      console.warn('Could not load platform stats.', e.message);
    }
  };

  const applySession = (session) => {
    setToken(session.token);
    const next = { token: session.token, user: session.user };
    setAuth(next);
    localStorage.setItem('kwabenya_auth', JSON.stringify(next));
    setSessionReady(true);
  };

  const login = async (credentials) => {
    const session = await api.login(credentials);
    applySession(session);
    return session;
  };

  const register = async (data) => {
    const session = await api.register(data);
    applySession(session);
    return session;
  };

  const logout = async () => {
    try { await api.logout(); } catch { /* token may already be gone */ }
    setToken('');
    setAuth(null);
    localStorage.removeItem('kwabenya_auth');
    setNotifications([]);
    setStats(null);
    setSessionReady(true);
    clearCart();
    if (typeof window !== 'undefined') window.__logout = logout;
  };

  // updateProfile: saves first/last name, email or phone for the signed-in user.
  const updateProfile = async (patch) => {
    const updated = await api.updateMe(patch);
    const next = { ...auth, user: { ...auth.user, ...updated } };
    setAuth(next);
    localStorage.setItem('kwabenya_auth', JSON.stringify(next));
    return updated;
  };

  const markNotificationRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try { await api.markNotificationRead(id); } catch (e) { console.warn(e.message); }
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try { await api.markAllNotificationsRead(); } catch (e) { console.warn(e.message); }
  };

  // Keep the API client's token in sync with the restored auth session.
  // Login/logout update both, but a page reload only restores `auth`.
  useEffect(() => {
    if (auth?.token) setToken(auth.token);
  }, []);

  // Re-validate a restored session against the API so a stale token (or a
  // hand-edited localStorage role) cannot unlock a dashboard. Network errors
  // are ignored so the demo still works offline; a real 401 clears the session.
  useEffect(() => {
    if (!auth?.token) {
      setSessionReady(true);
      return undefined;
    }
    let active = true;
    api.me()
      .then((user) => {
        if (!active || getToken() !== auth.token) return;
        const next = { token: auth.token, user };
        setAuth(next);
        localStorage.setItem('kwabenya_auth', JSON.stringify(next));
        setSessionReady(true);
      })
      .catch((e) => {
        if (!active || getToken() !== auth.token) return;
        if (/401/.test(e.message || '')) {
          setToken('');
          setAuth(null);
          localStorage.removeItem('kwabenya_auth');
          setNotifications([]);
          setStats(null);
        }
        // Network errors keep the local demo session usable offline.
        setSessionReady(true);
      });
    return () => { active = false; };
  }, []);

  // Load the catalogue once on mount.
  useEffect(() => {
    loadCatalogue();
  }, []);
  // Notifications wait until the restored session has been validated.
  useEffect(() => {
    if (sessionReady && auth?.token) refreshNotifications();
  }, [auth?.token, sessionReady]);
  // Admin stats are private, so only fetch them for a validated ADMIN session.
  useEffect(() => {
    if (!sessionReady) return;
    if (auth?.user?.role === 'ADMIN') refreshStats();
    else setStats(null);
  }, [auth?.user?.role, sessionReady]);

  // navigate: the single function every "go to another screen" action in
  // the app calls. Updates the view name and (optionally) which shop/product
  // id that view should focus on, then scrolls back to the top of the page
  // — important because without it, going from the bottom of a long catalog
  // to a product detail page would land scrolled halfway down the new page.
  const navigate = (v, params = {}) => {
    setView(v);
    if (params.shopId !== undefined) setSelectedShopId(params.shopId);
    if (params.productId !== undefined) setSelectedProductId(params.productId);
    if (params.orderId !== undefined) setSelectedOrderId(params.orderId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // addToCart: adds `qty` units of `productId` to the cart. If that product
  // is already in the cart, increases its quantity instead of creating a
  // duplicate line. Either way, the quantity is capped at the product's
  // current stock_quantity so the cart can never hold more than what's
  // actually available.
  const addToCart = (productId, qty = 1) => {
    const product = products.find((p) => p.product_id === productId);
    const maxQty = product ? product.stock_quantity : 99; // fallback cap if the product somehow isn't found
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) {
        // Bump the existing line's quantity, clamped to maxQty.
        return prev.map((i) => (i.productId === productId ? { ...i, qty: Math.min(i.qty + qty, maxQty) } : i));
      }
      // No existing line for this product yet — add a new one.
      return [...prev, { productId, qty: Math.min(qty, maxQty) }];
    });
    showToast('Added to cart');
  };

  // updateCartQty: sets a cart line's quantity directly (used by the +/-
  // steppers in CartView). A quantity of 0 or less removes the line
  // entirely rather than leaving a zero-quantity row in the cart.
  const updateCartQty = (productId, qty) => {
    if (qty <= 0) { setCart((prev) => prev.filter((i) => i.productId !== productId)); return; }
    setCart((prev) => prev.map((i) => (i.productId === productId ? { ...i, qty } : i)));
  };
  // removeFromCart: deletes one line from the cart outright (the trash-can button).
  const removeFromCart = (productId) => setCart((prev) => prev.filter((i) => i.productId !== productId));
  // clearCart: empties the entire cart (called right after an order is placed).
  const clearCart = () => setCart([]);

  // cartCount: total number of units across every cart line (what the
  // header's cart badge displays). Memoized so it only recalculates when
  // the cart itself actually changes.
  const cartCount = useMemo(() => cart.reduce((sum, i) => sum + i.qty, 0), [cart]);
  // cartTotal: the cart's total price in GH₵, looking up each line's
  // current product price (so if a seller changes a price, the cart
  // reflects it live rather than freezing the price at add-to-cart time).
  // Recalculates whenever the cart OR the products list changes.
  const cartTotal = useMemo(() => cart.reduce((sum, i) => {
    const p = products.find((pr) => pr.product_id === i.productId);
    return sum + (p ? p.price * i.qty : 0); // skip silently if the product no longer exists
  }, 0), [cart, products]);

  // --- SELLER-DASHBOARD MUTATIONS -----------------------------------
  // Every mutation updates local state immediately (so the UI feels instant)
  // and then persists to Django. If the API call fails the local change is
  // kept, which keeps the demo usable offline.

  const addProduct = async (data, imageFile = null) => {
    const tempId = nextId();
    setProducts((prev) => [...prev, { ...data, product_id: tempId, image_url: imageFile ? URL.createObjectURL(imageFile) : '' }]);
    try {
      const created = await api.createProduct({
        shop_id: data.shop_id,
        category_id: data.category_id,
        part_name: data.part_name,
        description: data.description || '',
        compatible_models: data.compatible_models || '',
        price: data.price,
        stock_quantity: data.stock_quantity,
      }, imageFile);
      const mapped = mapApiProduct(created);
      setProducts((prev) => prev.map((p) => (p.product_id === tempId ? mapped : p)));
      setApiOnline(true);
    } catch (e) {
      console.warn('Could not save product to API; kept locally.', e.message);
    }
  };

  const updateProduct = async (id, patch, imageFile = null) => {
    setProducts((prev) => prev.map((p) => (p.product_id === id ? { ...p, ...patch } : p)));
    try {
      await api.updateProduct(id, patch, imageFile);
      setApiOnline(true);
    } catch (e) {
      console.warn('Could not update product on API.', e.message);
    }
  };

  const removeProduct = async (id) => {
    setProducts((prev) => prev.filter((p) => p.product_id !== id));
    try {
      await api.deleteProduct(id);
      setApiOnline(true);
    } catch (e) {
      console.warn('Could not delete product on API.', e.message);
    }
  };

  const updateShop = async (id, patch) => {
    const existing = shops.find((s) => s.shop_id === id);
    setShops((prev) => prev.map((s) => (s.shop_id === id ? { ...s, ...patch } : s)));
    try {
      const { mechanic, ...shopFields } = patch;
      if (mechanic && existing?.mechanic?.mechanic_id) {
        await api.toggleMechanicDuty(existing.mechanic.mechanic_id);
      }
      if (Object.keys(shopFields).length) {
        await api.updateShop(id, shopFields);
      }
      setApiOnline(true);
    } catch (e) {
      console.warn('Could not update shop on API.', e.message);
    }
  };

  // Don't paint a dashboard until a restored token has been checked by the
  // API — this prevents a hand-edited localStorage role from flashing admin UI.
  if (auth?.token && !sessionReady) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <p className="font-mono text-xs tracking-widest text-stone-500 uppercase">Checking your session…</p>
      </div>
    );
  }

  // ctx: the single object handed to AppCtx.Provider below. Every value and
  // function any component in the app needs lives here — this is the
  // entire "public API" that useApp() exposes.
  const ctx = {
    shops, products, cart, view, selectedShopId, selectedProductId, selectedOrderId, setSelectedOrderId,
    currentShopId, setCurrentShopId, searchQuery, setSearchQuery, filters, setFilters,
    toast, showToast, lastOrder, setLastOrder,
    navigate, addToCart, updateCartQty, removeFromCart, clearCart, cartCount, cartTotal,
    addProduct, updateProduct, removeProduct, updateShop,
    // live-backend state and actions
    apiOnline, auth, login, register, logout, updateProfile, loadCatalogue,
    notifications, refreshNotifications, markNotificationRead, markAllRead,
    stats, refreshStats, theme, toggleTheme,
  };

  return (
    <AppCtx.Provider value={ctx}>
      {/* Global styles for the whole app: web font imports, the custom
          .font-display / .font-mono type classes used throughout (since
          Tailwind's arbitrary-value font-family syntax isn't available in
          this environment — see the project README for why), the route
          ticker's marquee animation, the toast's fade-in animation, and a
          custom text-selection color. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        * { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
        .font-mono, code { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        .font-display { font-family: 'Bebas Neue', ui-sans-serif, sans-serif; }
        @keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .ticker-track { display: inline-block; animation: ticker-scroll 32s linear infinite; }
        .ticker-track:hover { animation-play-state: paused; }
        @keyframes fadeIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .toast-in { animation: fadeIn 0.15s ease-out; }
        ::selection { background: #E8600C; color: #1C1B1A; }
        /* Mobile: prevent iOS auto-zoom on inputs */
        input, textarea, select { font-size: 16px !important; }
        /* Mobile: use dynamic viewport height so address bar doesn't cut content */
        .min-h-screen { min-height: 100dvh; }
        /* Safe areas for notched phones */
        header { padding-top: env(safe-area-inset-top); }
        footer { padding-bottom: env(safe-area-inset-bottom); }
        /* Prevent horizontal scroll without breaking position:sticky on the header */
        html, body, #root, .min-h-screen { overflow-x: clip; }
        /* Keep anchor/scroll-to-section targets from hiding under the sticky header */
        html { scroll-padding-top: 64px; }
        /* Fluid images */
        img { max-width: 100%; height: auto; }
        /* Touch targets: minimum 44x44px */
        button, a, input, textarea, select { min-height: 44px; }
        button { min-width: 44px; }
        /* Light-mode overrides for the otherwise dark Tailwind palette. */
        .light { color-scheme: light; }
        /* Page background: barely off-white so white cards still stand out */
        .light .bg-stone-950 { background-color: #fafafa; }
        /* Cards, header, sections: pure white */
        .light .bg-stone-900 { background-color: #ffffff; }
        /* Inputs, secondary surfaces, icon badges: soft neutral */
        .light .bg-stone-800 { background-color: #f3f3f3; }
        .light .bg-stone-700 { background-color: #e8e8e8; }
        .light .bg-orange-950 { background-color: #fff7ed; }
        .light .bg-green-950 { background-color: #f0fdf4; }
        /* Text: soft near-black for body, muted grays for secondary */
        .light .text-stone-100, .light .text-stone-200 { color: #1f2937; }
        .light .text-stone-300 { color: #4b5563; }
        .light .text-stone-400 { color: #6b7280; }
        .light .text-stone-500 { color: #9ca3af; }
        .light .text-stone-600 { color: #6b7280; }
        .light .text-green-400 { color: #16a34a; }
        .light .text-red-400 { color: #dc2626; }
        /* Soft borders instead of stark contrast */
        .light .border-stone-800 { border-color: #eeeeee; }
        .light .border-stone-700 { border-color: #e5e5e5; }
        .light .hover\\:bg-stone-700:hover { background-color: #e8e8e8; }
        .light .hover\\:bg-stone-800:hover { background-color: #f3f3f3; }
        .light .hover\\:border-orange-600:hover { border-color: #ea580c; }
        .light .focus\\:border-orange-600:focus { border-color: #ea580c; }
        .light .disabled\\:bg-stone-700:disabled { background-color: #e8e8e8; }
        /* Hero / product-card gradients */
        .light .bg-gradient-to-b.from-stone-900.to-stone-950 { background-image: linear-gradient(to bottom, #f5f5f4, #fafafa); }
        .light .bg-gradient-to-br.from-stone-800.to-stone-900 { background-image: linear-gradient(to bottom right, #e8e8e8, #f5f5f4); }
        /* Blend product images with white backgrounds into cards */
        .light img.object-cover { mix-blend-mode: multiply; }
      `}</style>
      {/* The actual page: header, decorative ticker, whichever view is
          currently active, footer, and the (possibly invisible) toast. */}
      <div className={`min-h-screen bg-stone-950 ${theme === 'light' ? 'light' : 'dark'}`}>
        <Header />
        <RouteTicker />
        <MainContent />
        <Footer />
        <Toast />
      </div>
    </AppCtx.Provider>
  );
}
