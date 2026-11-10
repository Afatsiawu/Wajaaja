"""
Role-based access-control rules for the Kwabenya Spares API.

The catalogue is public (anyone can browse shops, products, categories and
mechanics). Everything that changes data is restricted by role:

  ADMIN   - full access to everything
  SELLER  - can manage only their own shop, its products and its mechanics
  MECHANIC- can toggle their own duty status
  RIDER   - can place orders, review products and manage their own account

These classes are combined with DRF's built-in IsAuthenticated /
IsAuthenticatedOrReadOnly in views.py.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission


def is_admin(user):
    """True for Django staff users or accounts with the ADMIN role."""
    return bool(
        user
        and user.is_authenticated
        and (user.is_staff or getattr(user, "role", None) == "ADMIN")
    )


class IsAdminOrReadOnly(BasePermission):
    """Anyone can read; only admins can create/update/delete."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return is_admin(request.user)


class IsSellerOrAdmin(BasePermission):
    """Anyone can read; sellers and admins can write."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        return is_admin(request.user) or getattr(request.user, "role", None) == "SELLER"


class IsSellerOwnerOrAdmin(BasePermission):
    """
    Object-level check: a seller may only modify records tied to their own
    shop. Admins can modify anything. Reads are always allowed.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if is_admin(request.user):
            return True

        # Shop itself
        if hasattr(obj, "owner_id"):
            return obj.owner_id == request.user.id
        # Product / Mechanic / Order -> reach through to the shop owner
        if hasattr(obj, "shop"):
            return obj.shop.owner_id == request.user.id
        return False


class CanManageMechanic(BasePermission):
    """Sellers manage mechanics in their shop; mechanics may toggle themselves."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        return is_admin(request.user) or getattr(request.user, "role", None) in ("SELLER", "MECHANIC")

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if is_admin(request.user):
            return True
        if getattr(request.user, "role", None) == "MECHANIC":
            return obj.user_id == request.user.id
        if getattr(request.user, "role", None) == "SELLER":
            return obj.shop.owner_id == request.user.id
        return False


class IsReviewOwnerOrAdmin(BasePermission):
    """Only the review's author (or an admin) can edit/delete it."""

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return is_admin(request.user) or obj.customer_id == request.user.id


class IsAdminRole(BasePermission):
    """Admin dashboard endpoints (platform stats) are admin-only."""

    def has_permission(self, request, view):
        return is_admin(request.user)


class IsEnquiryParticipant(BasePermission):
    """Only the enquiry's customer, seller, or an admin can access it."""

    def has_object_permission(self, request, view, obj):
        if is_admin(request.user):
            return True
        return obj.customer_id == request.user.id or obj.seller_id == request.user.id
