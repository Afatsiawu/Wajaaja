# Motify

A multi-page web prototype for the Motify platform - a motorcycle
spare parts marketplace connecting riders, vendors, and shop fitters in Kwabenya, Accra.

Phase 1 scope: no online payment. Reservations are held online, then paid in cash
or mobile money directly to the vendor on pickup.

## Running it

The backend lives in `../backend/` and serves this site plus the API in development:

```bash
cd ../backend
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Then open `http://127.0.0.1:8000/index.html`.

Alternatively, serve this folder with any static file server; the frontend falls back
to `http://127.0.0.1:8000/api` for the API.

## Demo accounts

- `rider1` / `vendor1` / `admin1`, password `demo1234`
