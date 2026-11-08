# Kwabenya Spares — Backend (Django REST Framework)

Implements the schema from the design spec: `users`, `shops`, `mechanics`,
`categories`, `products`, with the same relationships and constraints.

**See [../DOCUMENTATION.md](../DOCUMENTATION.md) for the full API
reference and a walkthrough of every file.** Every file here is also
commented line-by-line in the code itself.

## Run it locally

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env    # then edit .env with your local Postgres credentials

# No Postgres handy? Use the bundled SQLite database instead:
#   export DB_ENGINE=sqlite        (Windows PowerShell: $env:DB_ENGINE="sqlite")

# Create the Postgres database first if using Postgres, e.g.:
#   createdb kwabenya_spares

python manage.py migrate
python manage.py createsuperuser
python manage.py seed_demo_data     # optional: loads the same demo shops/products as the frontend mock
python manage.py runserver
```

The API is now at `http://localhost:8000/api/` and the Django admin at
`http://localhost:8000/admin/`.

Endpoints: `/api/shops/`, `/api/mechanics/`, `/api/categories/`, `/api/products/`
(standard REST — list/retrieve/create/update/delete), with query params:

- `/api/products/?q=piston&category=1&shop=2&min_price=50&max_price=300&sort=price_asc`
- `/api/shops/?open=true&q=roundabout`
- `PATCH /api/mechanics/<id>/toggle_duty/`

Capstone feature endpoints:

- `POST /api/auth/register/`, `POST /api/auth/login/`, `POST /api/auth/logout/`, `GET /api/auth/me/`
  (token authentication — send `Authorization: Token <key>`)
- `/api/orders/` — list/create orders; `PATCH /api/orders/<id>/update_status/`
- `/api/reviews/?product=<id>` — list/create product reviews and ratings
- `/api/notifications/` — user notifications; `PATCH .../mark_read/` and
  `PATCH /api/notifications/mark_all_read/`
- `/api/cart/` — optional server-side cart persistence
- `GET /api/stats/` — admin dashboard summary (users, shops, products, orders,
  reviews, revenue, orders by status)

### Access control

- **Public (read-only):** shops, products, categories, mechanics and reviews.
- **Authenticated:** orders, cart, notifications and `/api/auth/me/`. A rider
  only sees their own orders/cart/notifications; sellers and mechanics see the
  orders for their shop.
- **Seller:** create/update only their own shop, products and mechanics. They
  cannot move a listing/mechanic to another shop or hand over shop ownership.
- **Mechanic:** may only change their own duty status.
- **Admin:** category writes, `/api/stats/`, order deletion, and management of
  any shop/product/mechanic. Admin accounts cannot be created through the
  public registration endpoint — use Django admin or the seed command.
- Generic order `PUT/PATCH/DELETE` is blocked; status changes go through
  `PATCH /api/orders/<id>/update_status/` (shop owner or admin only).

Seed accounts (password `demo-password-123`): `rider_demo`, `admin_demo`, and
the six seller usernames such as `kwame_owusu`.

## Deploying it

**This cannot run on Netlify** — Netlify serves static sites and short-lived
serverless functions, not a persistent Django process with a Postgres
connection. Reasonable free/low-cost options: [Render](https://render.com)
(Web Service + a managed Postgres instance) or [Railway](https://railway.app).
Both: point them at the `backend/` folder, set the environment variables from
`.env.example`, use `gunicorn config.wsgi` as the start command, and run
`python manage.py migrate` after the first deploy.

Once it's deployed, put its URL in the frontend's `src/services/api.js` and
add your Netlify site's URL to `CORS_ALLOWED_ORIGINS`.
