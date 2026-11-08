# Motify — Backend (Django REST Framework)

Django + DRF backend for the Motify frontend in `../frontend/`.

## Run it locally

```bash
cd backend
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo_data     # demo users/shops/products
python manage.py runserver 127.0.0.1:8000
```

The site is served at `http://127.0.0.1:8000/` and the API at
`http://127.0.0.1:8000/api/`. Django admin: `http://127.0.0.1:8000/admin/`.

Demo accounts (password `demo1234`): `rider1`, `vendor1`, `admin1`.

## Environment

SQLite is used by default (`db.sqlite3`). For Postgres, set `DB_ENGINE=postgres`
and the `DB_*` variables from `.env.example` (or `DATABASE_URL`).

## Resetting demo data

```bash
python manage.py seed_demo_data
```
