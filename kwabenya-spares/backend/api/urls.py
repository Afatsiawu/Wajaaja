"""
Maps the ViewSets in views.py to actual URL paths, using DRF's router so
each ViewSet automatically gets the full standard set of REST routes
instead of writing each one out by hand.
"""
# DefaultRouter: generates the list/detail URL patterns (and a browsable
# API root page) for each ViewSet registered with it below.
from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    ShopViewSet, MechanicViewSet, CategoryViewSet, ProductViewSet,
    OrderViewSet, ReviewViewSet, NotificationViewSet, CartItemViewSet,
    RegisterView, LoginView, LogoutView, MeView, StatsView,
)

router = DefaultRouter()
# register(url_prefix, viewset) — each line below creates a full family of routes.
# e.g. router.register("shops", ShopViewSet) generates:
#   GET/POST   /shops/          (list all / create one)
#   GET/PUT/PATCH/DELETE /shops/<id>/   (retrieve/replace/update/delete one)
# plus any @action-decorated custom routes on that viewset (e.g. mechanics'
# toggle_duty/ sub-route, defined in views.py).
router.register("shops", ShopViewSet)
router.register("mechanics", MechanicViewSet)
router.register("categories", CategoryViewSet)
router.register("products", ProductViewSet)
router.register("orders", OrderViewSet, basename="order")
router.register("reviews", ReviewViewSet, basename="review")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("cart", CartItemViewSet, basename="cart")

# urlpatterns: the actual list Django's URL dispatcher reads. router.urls
# is already a ready-made list of path() entries, so nothing more needs to
# be added here — this whole file is included under "api/" in config/urls.py,
# which is what makes the final routes look like /api/shops/, /api/products/, etc.
urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("stats/", StatsView.as_view(), name="stats"),
] + router.urls
