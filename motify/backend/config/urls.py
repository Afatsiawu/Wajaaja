"""
Project-wide URL configuration.

In development this also serves the static Motify site, so one command
(``python manage.py runserver``) gives you:

    http://127.0.0.1:8000/          -> the site (index.html)
    http://127.0.0.1:8000/api/      -> the JSON API
    http://127.0.0.1:8000/admin/    -> Django admin

In production, serve the frontend from Netlify/any static host and keep only
``admin/`` and ``api/`` here (the catch-all below is DEBUG-only).
"""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import RedirectView
from django.views.static import serve

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
]

if settings.DEBUG:
    urlpatterns += [
        path("", RedirectView.as_view(url="/index.html", permanent=False)),
        re_path(r"^(?P<path>.*)$", serve, {"document_root": settings.FRONTEND_DIR}),
    ]
