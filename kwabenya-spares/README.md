# Kwabenya Spares

Web-based e-commerce platform for motorcycle spare parts sellers in
Kwabenya, Accra — connecting shops, their assigned fitters, and riders.

**For a full breakdown of every file, function, and component — plus the
complete API reference — see [DOCUMENTATION.md](./DOCUMENTATION.md).**
Every file in this project is also commented line-by-line in the code itself.

## What's here

```
kwabenya-spares/
  src/                 React + Vite + Tailwind frontend (this is the part you preview above)
  backend/             Django REST Framework + PostgreSQL API matching the spec's schema
```

## Status, honestly

- **Frontend + backend are connected.** The React app loads the live
  catalogue from Django and falls back to the bundled demo data if the API
  is offline. Search, filters, cart, checkout, seller/fitter/admin
  dashboards, reviews, notifications, shop hours/locations and directions
  links are all wired up.
- **Capstone features implemented:** user registration and token
  authentication; rider, seller, mechanic and admin roles; shop profiles
  with GPS coordinates, landmarks and working hours; mechanic duty
  availability; product listing and categorisation; full search/filter/sort;
  shopping cart; order placement, order status workflow and inventory
  updates; product reviews and ratings; notifications; and an admin
  dashboard with platform stats, sales activity and shop oversight.
- **Payments — simulated.** The MoMo / Telecel Cash checkout flow validates
  input and creates a real order in the database, but no payment provider is
  connected. Wiring up Paystack or Hubtel is a follow-on step.
- **Demo accounts:** `rider_demo`, `admin_demo`, and any seeded seller
  username (e.g. `kwame_owusu`) with password `demo-password-123`.
- **Access control:** guests browse the catalogue as riders only — there is no
  role switcher. The role comes from the signed-in account and is re-validated
  against `GET /api/auth/me/` on every reload. Checkout, reviews, notifications
  and orders require a session; seller, mechanic and admin dashboards are
  role-gated in the UI and enforced again by the API. A seller can only manage
  their own shop/products/mechanics, and admin accounts cannot self-register.

## Run the frontend locally

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Deploy the frontend to Netlify

**Option A — drag and drop:** run `npm run build`, then drag the generated
`dist/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop).

**Option B — connect your Git repo:** push this folder to GitHub, then in
Netlify choose "Add new site" → "Import an existing project", select the
repo, and use:
- Build command: `npm run build`
- Publish directory: `dist`

`netlify.toml` already has these settings plus the redirect rule the app
needs, so Netlify should pick them up automatically either way.

## Running both together

```bash
# terminal 1 — API (SQLite mode, no Postgres needed)
cd backend
DB_ENGINE=sqlite python manage.py migrate
DB_ENGINE=sqlite python manage.py seed_demo_data
DB_ENGINE=sqlite python manage.py runserver 127.0.0.1:8001

# terminal 2 — frontend
npm run dev
```

The frontend defaults to `http://127.0.0.1:8001/api`. Override it with
`VITE_API_URL` in a `.env` file when deploying (see `src/services/api.js`).

## Why Netlify can't host the backend

Netlify serves static files and short-lived serverless functions. The
Django + PostgreSQL backend described in the spec needs a persistent
process and a real database connection, which Netlify's platform isn't
built for. Render or Railway are the closest equivalents to "Netlify, but
for this kind of backend" — both have generous free tiers and a Postgres
add-on. `backend/README.md` has the specifics.
