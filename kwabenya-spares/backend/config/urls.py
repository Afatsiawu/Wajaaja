"""
The project-wide URL configuration — the very first place Django looks
when a request comes in, before it gets routed further into any app.
"""
from django.contrib import admin
# path: declares one URL pattern. include: hands off everything under a
# given prefix to another urls.py module (here, the api app's own routes).
from django.http import JsonResponse
from django.urls import path, include, re_path

def health_check(request):
    return JsonResponse({"status": "ok"})

urlpatterns = [
    # Render health check (also accepts /health/).
    re_path(r"^health/?$", health_check),
    # Django's built-in admin site, at /admin/.
    path("admin/", admin.site.urls),
    # Every route defined in api/urls.py (which itself lists shops/,
    # mechanics/, categories/, products/) gets mounted under /api/, so the
    # final URLs are /api/shops/, /api/products/, and so on.
    path("api/", include("api.urls")),
]
