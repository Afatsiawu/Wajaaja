"""
Django settings for the Kwabenya Spares backend.

All secrets and environment-specific values are read from environment
variables so the same codebase works locally, on Render/Railway, or
anywhere else — see backend/.env.example.
"""
import os
from pathlib import Path
from dotenv import load_dotenv  # reads a .env file's contents into real environment variables

# BASE_DIR: the backend/ folder itself — used below to locate the .env file
# relative to this settings.py, no matter where the project is checked out.
BASE_DIR = Path(__file__).resolve().parent.parent
# Loads backend/.env (if it exists) into the process's environment
# variables, so os.getenv() calls below can find them.
load_dotenv(BASE_DIR / ".env")

# SECRET_KEY: Django uses this for cryptographic signing (sessions, CSRF
# tokens, etc). Falls back to an obviously-fake dev value so the project
# still runs locally even before you've set up a .env file — but this
# fallback must never be used in a real deployment.
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-insecure-secret-key-change-me")
# DEBUG: shows detailed error pages when True — fine for local dev, must be
# False in production (set DJANGO_DEBUG=False in the real deployment's env vars).
DEBUG = os.getenv("DJANGO_DEBUG", "True") == "True"
if not DEBUG and SECRET_KEY == "dev-only-insecure-secret-key-change-me":
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set in production.")
# ALLOWED_HOSTS: which domain names Django will accept requests for — a
# basic security check against Host header attacks. Comma-separated in the
# env var, split into a real Python list here.
ALLOWED_HOSTS = os.getenv(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1,.onrender.com",
).split(",")

# INSTALLED_APPS: every Django app active in this project — the built-in
# ones Django ships with, the two third-party packages this project uses
# (rest_framework, corsheaders), and this project's own "api" app.
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",   # Django REST Framework — turns models into a JSON API
    "rest_framework.authtoken",  # token-based authentication for login/register
    "corsheaders",      # lets the frontend (on a different domain) call this API from the browser
    "api",              # this project's own app: models, serializers, views, urls
]

# MIDDLEWARE: code that runs on every single request/response, in this
# exact order, before/after your actual view code runs. CorsMiddleware is
# placed early so CORS headers get added before other checks might reject
# the request outright.
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# ROOT_URLCONF: which urls.py file is the entry point for every request —
# points at config/urls.py.
ROOT_URLCONF = "config.urls"

# TEMPLATES: configuration for Django's HTML template engine. This project
# doesn't render any of its own templates (it's a pure JSON API), but the
# Django admin site itself relies on this being configured to render its
# own pages, so it stays even though this project's own code never uses it directly.
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# WSGI_APPLICATION: points at the `application` object in config/wsgi.py —
# what a production web server actually runs.
WSGI_APPLICATION = "config.wsgi.application"

# AUTH_USER_MODEL: tells Django to use THIS project's custom User model
# (api.models.User, which adds phone_number + role) instead of its default
# built-in one. Must be set before the very first migration ever runs.
AUTH_USER_MODEL = "api.User"

# --- Database -----------------------------------------------------------
# Reads individual POSTGRES_* vars by default. If DATABASE_URL is set
# (common on Render/Railway/Heroku-style hosts) that takes precedence.
DB_ENGINE = os.getenv("DB_ENGINE", "postgres").lower()
DATABASE_URL = os.getenv("DATABASE_URL")
if DB_ENGINE == "sqlite":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
elif DATABASE_URL:
    # urlparse breaks a single connection-string URL (e.g.
    # postgres://user:pass@host:5432/dbname) apart into its pieces, which
    # is the format Django's DATABASES setting actually wants.
    import urllib.parse as urlparse

    url = urlparse.urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": url.path[1:],   # url.path is "/dbname" — [1:] strips the leading slash
            "USER": url.username,
            "PASSWORD": url.password,
            "HOST": url.hostname,
            "PORT": url.port or 5432,  # fall back to Postgres's standard port if none was specified
        }
    }
else:
    # Local-development fallback: individual POSTGRES_* environment
    # variables, each with a sensible local default so `python manage.py
    # migrate` works out of the box against a locally-running Postgres.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB", "kwabenya_spares"),
            "USER": os.getenv("POSTGRES_USER", "postgres"),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD", "postgres"),
            "HOST": os.getenv("POSTGRES_HOST", "localhost"),
            "PORT": os.getenv("POSTGRES_PORT", "5432"),
        }
    }

# AUTH_PASSWORD_VALIDATORS: Django's built-in password-strength rules,
# applied when users set/change passwords (e.g. via createsuperuser or the
# admin's password-change form).
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
# TIME_ZONE: Ghana's zone — makes Django's own timestamp handling (e.g.
# created_at fields) consistent with the frontend's assumption of local Accra time.
TIME_ZONE = "Africa/Accra"
USE_I18N = True
# USE_TZ: store all datetimes in the database as UTC internally (Django
# best practice), converting to/from TIME_ZONE only for display — avoids a
# whole class of daylight-saving/timezone bugs.
USE_TZ = True

# STATIC_URL: URL prefix for Django's own static files (mainly used by the
# admin site's CSS/JS) — not related to the frontend's assets, which are
# built and served entirely separately by Vite/Netlify.
STATIC_URL = "static/"
# STATIC_ROOT: where collectstatic gathers files for production serving.
STATIC_ROOT = BASE_DIR / "staticfiles"
# WhiteNoise serves those collected static files in production.
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
# DEFAULT_AUTO_FIELD: the default primary-key field type for any app that
# doesn't specify its own (api/apps.py already sets this explicitly too;
# this is the project-wide fallback).
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Proxy / HTTPS (Render sits behind a reverse proxy) -----------------
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

# REST_FRAMEWORK: global configuration for Django REST Framework.
REST_FRAMEWORK = {
    # Every list endpoint (e.g. GET /api/products/) returns results in
    # pages instead of the entire table at once.
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,  # 20 items per page by default
    # Token auth powers /api/auth/login/ and /api/auth/register/. Session
    # auth stays enabled so the Django browsable API and admin remain usable.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    # AllowAny keeps the public catalogue readable without an account.
    # Authenticated-only behaviour is enforced inside the views that need it
    # (orders, cart, notifications).
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
}

# CORS_ALLOWED_ORIGINS: which frontend origins the browser is allowed to
# call this API from. Point this at your deployed Vercel site (and
# http://localhost:5173 for local frontend dev) so the browser is allowed
# to call this API. Comma-separated in the env var, split into a list here.
_cors = os.getenv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
# FRONTEND_URL: convenience single origin (e.g. https://your-app.vercel.app)
# that is always added to the allowed list.
_frontend_url = os.getenv("FRONTEND_URL", "").strip()
if _frontend_url and _frontend_url not in _cors:
    _cors.append(_frontend_url)
CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors if o.strip()]
# Allow any localhost port during development.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://localhost:\d+$",
    r"^http://127\.0\.0\.1:\d+$",
]
# Credentials (cookies) are supported; the frontend uses token auth in
# localStorage, but this keeps the option open.
CORS_ALLOW_CREDENTIALS = True