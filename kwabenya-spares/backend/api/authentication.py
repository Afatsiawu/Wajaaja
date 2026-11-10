from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import PermissionDenied


class ActiveTokenAuthentication(TokenAuthentication):
    """Token auth that rejects suspended (inactive) accounts on every request."""

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if not user.is_active:
            raise PermissionDenied("Your account has been suspended.")
        return user, token