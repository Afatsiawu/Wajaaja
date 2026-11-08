"""Role-based permission helpers used by the API views."""
from rest_framework import permissions


def is_admin(user):
    if not user or not user.is_authenticated:
        return False
    return user.role == "admin" or user.is_superuser


def is_vendor(user):
    if not user or not user.is_authenticated:
        return False
    return user.role == "vendor"


def is_rider(user):
    if not user or not user.is_authenticated:
        return False
    return user.role == "rider"


class IsAdminRole(permissions.BasePermission):
    message = "Only platform admins can do that."

    def has_permission(self, request, view):
        return is_admin(request.user)


class IsVendorOrAdmin(permissions.BasePermission):
    message = "Only vendors or admins can do that."

    def has_permission(self, request, view):
        return is_admin(request.user) or is_vendor(request.user)


class IsRiderOrAdmin(permissions.BasePermission):
    message = "Only riders or admins can do that."

    def has_permission(self, request, view):
        return is_admin(request.user) or is_rider(request.user)
