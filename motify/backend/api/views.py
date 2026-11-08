"""
API views: the real endpoints behind every screen of the Motify frontend.

Design notes
------------
* Reads are public (browsing parts/shops works for guests).
* Writes require a token and are role-checked: riders reserve/review/save,
  vendors manage their own shop + stock + reservations, admins manage the
  platform.
* List endpoints return plain JSON arrays (no pagination) because the
  frontend loads the whole catalogue into its cache once per page.
"""
import re

from django.conf import settings
from django.contrib.auth import authenticate
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    BikeModel,
    Category,
    ContactLog,
    Favorite,
    Mechanic,
    Product,
    Reservation,
    Review,
    Shop,
    User,
    Vehicle,
)
from .permissions import IsAdminRole, IsVendorOrAdmin, is_admin, is_vendor
from .serializers import (
    BikeModelSerializer,
    CategorySerializer,
    ChangePasswordSerializer,
    ContactLogSerializer,
    DemoLoginSerializer,
    LoginSerializer,
    MechanicSerializer,
    ProductSerializer,
    RegisterSerializer,
    ReservationSerializer,
    ReviewSerializer,
    ShopSerializer,
    UserSerializer,
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def issue_token(user):
    token, _ = Token.objects.get_or_create(user=user)
    return token.key


def auth_payload(user):
    return {"token": issue_token(user), "user": UserSerializer(user).data}


def find_user(identifier):
    """Find a user by username, email or phone (with/without spaces)."""
    identifier = (identifier or "").strip()
    if not identifier:
        return None
    user = User.objects.filter(
        Q(username__iexact=identifier) | Q(email__iexact=identifier) | Q(phone_number=identifier)
    ).first()
    if user is not None:
        return user
    digits = re.sub(r"\D", "", identifier)
    if not digits:
        return None
    # Phone numbers are stored with spaces ("024 555 1010"), so compare the
    # digits only for the fallback lookup.
    for candidate in User.objects.exclude(phone_number__isnull=True):
        if re.sub(r"\D", "", candidate.phone_number) == digits:
            return candidate
    return None


# ---------------------------------------------------------------------------
# authentication
# ---------------------------------------------------------------------------
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = find_user(serializer.validated_data["identifier"])
        if user is None:
            return Response({"detail": "No account found with those details."}, status=status.HTTP_400_BAD_REQUEST)
        if user.suspended:
            return Response({"detail": "This account has been suspended. Contact support."}, status=status.HTTP_403_FORBIDDEN)
        authenticated = authenticate(request, username=user.username, password=serializer.validated_data["password"])
        if authenticated is None:
            return Response({"detail": "Incorrect password."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(auth_payload(authenticated))


class DemoLoginView(APIView):
    """One-click demo access used by the login page's quick-login buttons."""

    permission_classes = [AllowAny]

    def post(self, request):
        if not getattr(settings, "ALLOW_DEMO_LOGIN", False):
            return Response({"detail": "Demo login is disabled."}, status=status.HTTP_403_FORBIDDEN)
        serializer = DemoLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(username=serializer.validated_data["userId"]).first()
        if user is None:
            return Response({"detail": "Demo account not found. Run seed_demo_data first."}, status=status.HTTP_404_NOT_FOUND)
        return Response(auth_payload(user))


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(auth_payload(user), status=status.HTTP_201_CREATED)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not request.user.check_password(serializer.validated_data["currentPassword"]):
            return Response({"detail": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(serializer.validated_data["newPassword"])
        request.user.save(update_fields=["password"])
        Token.objects.filter(user=request.user).delete()
        return Response(auth_payload(request.user))


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        # Phase 1 prototype: no email delivery is wired up yet.
        return Response({"detail": "If that account exists, a reset link has been sent."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        return Response({"detail": "Password reset is handled by an admin in this prototype."})


class FavoritesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        shop_id = request.data.get("shopId")
        shop = Shop.objects.filter(pk=shop_id).first()
        if shop is None:
            return Response({"detail": "Shop not found."}, status=status.HTTP_404_NOT_FOUND)
        favorite = Favorite.objects.filter(user=request.user, shop=shop).first()
        if favorite:
            favorite.delete()
        else:
            Favorite.objects.create(user=request.user, shop=shop)
        return Response(UserSerializer(request.user).data)


class VehicleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_queryset(self):
        return Vehicle.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        vehicle = Vehicle.objects.create(
            user=request.user,
            make=request.data.get("make", ""),
            model=request.data.get("model", ""),
            year=request.data.get("year") or 2026,
            cc=request.data.get("cc") or 150,
        )
        return Response(UserSerializer(request.user).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        Vehicle.objects.filter(user=request.user, pk=kwargs.get("pk")).delete()
        return Response(UserSerializer(request.user).data)


# ---------------------------------------------------------------------------
# catalogue
# ---------------------------------------------------------------------------
class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsAdminRole()]


class BikeModelViewSet(viewsets.ModelViewSet):
    queryset = BikeModel.objects.all()
    serializer_class = BikeModelSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsAdminRole()]


class ShopViewSet(viewsets.ModelViewSet):
    """
    GET  /api/shops/                -> all shops
    GET  /api/shops/?open=true      -> only shops open right now
    GET  /api/shops/?q=roundabout   -> search name / landmark
    POST /api/shops/                -> vendor creates their shop
    POST /api/shops/<id>/approve/   -> admin verifies a vendor
    """
    serializer_class = ShopSerializer

    def get_queryset(self):
        qs = Shop.objects.select_related("owner").prefetch_related("mechanics").all()
        params = self.request.query_params
        q = params.get("q")
        if q:
            qs = qs.filter(Q(shop_name__icontains=q) | Q(landmark_address__icontains=q))
        zone = params.get("zone")
        if zone:
            qs = qs.filter(zone=zone)
        if params.get("verified") == "true":
            qs = qs.filter(verified=True)
        if params.get("open") == "true":
            qs = [shop for shop in qs if shop.is_open_now()]
        return qs

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        if self.action == "create":
            return [IsAuthenticated(), IsVendorOrAdmin()]
        if self.action == "approve":
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def _is_owner(self, shop):
        return shop.owner_id == self.request.user.id

    def create(self, request, *args, **kwargs):
        if Shop.objects.filter(owner=request.user).exists():
            return Response({"detail": "You already have a shop profile."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shop = serializer.save(owner=request.user)
        if not is_admin(request.user):
            request.user.role = User.Role.VENDOR
            request.user.save(update_fields=["role"])
        return Response(self.get_serializer(shop).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        shop = self.get_object()
        if not (is_admin(request.user) or self._is_owner(shop)):
            return Response({"detail": "You can only edit your own shop."}, status=status.HTTP_403_FORBIDDEN)
        data = request.data.copy()
        if not is_admin(request.user):
            data.pop("verified", None)
        serializer = self.get_serializer(shop, data=data, partial=kwargs.get("partial", False))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        shop = self.get_object()
        if not (is_admin(request.user) or self._is_owner(shop)):
            return Response({"detail": "You can only delete your own shop."}, status=status.HTTP_403_FORBIDDEN)
        shop.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        shop = self.get_object()
        shop.verified = True
        shop.save(update_fields=["verified"])
        return Response(self.get_serializer(shop).data)


class MechanicViewSet(viewsets.ModelViewSet):
    queryset = Mechanic.objects.select_related("shop").all()
    serializer_class = MechanicSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsVendorOrAdmin()]

    @action(detail=True, methods=["patch", "post"])
    def toggle_duty(self, request, pk=None):
        mechanic = self.get_object()
        if not (is_admin(request.user) or (is_vendor(request.user) and mechanic.shop.owner_id == request.user.id)):
            return Response({"detail": "You can only update your own shop's fitter."}, status=status.HTTP_403_FORBIDDEN)
        mechanic.is_on_duty = not mechanic.is_on_duty
        mechanic.save(update_fields=["is_on_duty"])
        return Response(MechanicSerializer(mechanic).data)


class ProductViewSet(viewsets.ModelViewSet):
    """
    GET /api/products/?q=piston&category=Engine&shop=s1&available=true
    GET /api/products/?min_price=50&max_price=300&sort=price_asc
    POST /api/products/<id>/toggle_availability/
    """
    serializer_class = ProductSerializer

    def get_queryset(self):
        qs = Product.objects.select_related("shop", "category").all()
        params = self.request.query_params

        q = params.get("q")
        if q:
            qs = qs.filter(
                Q(part_name__icontains=q)
                | Q(description__icontains=q)
                | Q(compatible_models__icontains=q)
                | Q(shop__shop_name__icontains=q)
            )

        category = params.get("category")
        if category:
            if str(category).isdigit():
                qs = qs.filter(category_id=category)
            else:
                qs = qs.filter(category__category_name__iexact=category)

        shop = params.get("shop")
        if shop:
            qs = qs.filter(shop_id=shop)

        available = params.get("available")
        if available in ("true", "false"):
            qs = qs.filter(available=available == "true")

        min_price = params.get("min_price")
        if min_price:
            qs = qs.filter(price__gte=min_price)
        max_price = params.get("max_price")
        if max_price:
            qs = qs.filter(price__lte=max_price)

        sort = params.get("sort")
        if sort == "price_asc":
            qs = qs.order_by("price")
        elif sort == "price_desc":
            qs = qs.order_by("-price")
        elif sort == "name":
            qs = qs.order_by("part_name")
        return qs

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        if self.action == "create":
            return [IsAuthenticated(), IsVendorOrAdmin()]
        return [IsAuthenticated()]

    def _owns_product(self, product):
        return product.shop.owner_id == self.request.user.id

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shop = serializer.validated_data["shop"]
        if not (is_admin(request.user) or shop.owner_id == request.user.id):
            return Response({"detail": "You can only list parts for your own shop."}, status=status.HTTP_403_FORBIDDEN)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        product = self.get_object()
        if not (is_admin(request.user) or self._owns_product(product)):
            return Response({"detail": "You can only edit your own shop's parts."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(product, data=request.data, partial=kwargs.get("partial", False))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        if not (is_admin(request.user) or self._owns_product(product)):
            return Response({"detail": "You can only delete your own shop's parts."}, status=status.HTTP_403_FORBIDDEN)
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def toggle_availability(self, request, pk=None):
        product = self.get_object()
        if not (is_admin(request.user) or self._owns_product(product)):
            return Response({"detail": "You can only edit your own shop's parts."}, status=status.HTTP_403_FORBIDDEN)
        product.available = not product.available
        product.save(update_fields=["available", "last_updated"])
        return Response(self.get_serializer(product).data)


# ---------------------------------------------------------------------------
# rider activity
# ---------------------------------------------------------------------------
class ReservationViewSet(viewsets.ModelViewSet):
    serializer_class = ReservationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Reservation.objects.select_related("rider", "product", "shop").all()
        if is_admin(user):
            pass
        elif is_vendor(user):
            qs = qs.filter(shop__owner=user)
        else:
            qs = qs.filter(rider=user)
        shop = self.request.query_params.get("shop")
        if shop:
            qs = qs.filter(shop_id=shop)
        rider = self.request.query_params.get("rider")
        if rider and is_admin(user):
            qs = qs.filter(rider__username=rider)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.validated_data["product"]
        qty = serializer.validated_data.get("qty", 1)
        reservation = serializer.save(
            rider=request.user,
            shop=product.shop,
            qty=qty,
            total=product.price * qty,
            status=Reservation.Status.PENDING,
        )
        return Response(ReservationSerializer(reservation).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        reservation = self.get_object()
        if not (is_admin(request.user) or reservation.shop.owner_id == request.user.id):
            return Response({"detail": "Only the shop can update a reservation."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(reservation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def set_status(self, request, pk=None):
        reservation = self.get_object()
        if not (is_admin(request.user) or reservation.shop.owner_id == request.user.id):
            return Response({"detail": "Only the shop can update a reservation."}, status=status.HTTP_403_FORBIDDEN)
        new_status = request.data.get("status")
        valid = {choice for choice, _ in Reservation.Status.choices}
        if new_status not in valid:
            return Response({"detail": "Unknown reservation status."}, status=status.HTTP_400_BAD_REQUEST)
        reservation.status = new_status
        reservation.save(update_fields=["status"])
        return Response(self.get_serializer(reservation).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        reservation = self.get_object()
        if not (is_admin(request.user) or reservation.rider_id == request.user.id):
            return Response({"detail": "You can only cancel your own reservation."}, status=status.HTTP_403_FORBIDDEN)
        reservation.status = Reservation.Status.CANCELLED
        reservation.save(update_fields=["status"])
        return Response(self.get_serializer(reservation).data)


class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer

    def get_queryset(self):
        qs = Review.objects.select_related("shop", "rider").all()
        shop = self.request.query_params.get("shop")
        if shop:
            qs = qs.filter(shop_id=shop)
        return qs

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review = serializer.save(rider=request.user, author=request.user.name)
        review.shop.recalculate_rating()
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        review = self.get_object()
        if not (is_admin(request.user) or review.rider_id == request.user.id):
            return Response({"detail": "You can only edit your own review."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(review, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        review.shop.recalculate_rating()
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        review = self.get_object()
        if not (is_admin(request.user) or review.rider_id == request.user.id):
            return Response({"detail": "You can only delete your own review."}, status=status.HTTP_403_FORBIDDEN)
        shop = review.shop
        review.delete()
        shop.recalculate_rating()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ContactLogViewSet(viewsets.ModelViewSet):
    """Call / WhatsApp / directions taps. Guests may log them too."""

    serializer_class = ContactLogSerializer

    def get_queryset(self):
        user = self.request.user
        qs = ContactLog.objects.select_related("shop").all()
        if is_admin(user):
            pass
        elif is_vendor(user):
            qs = qs.filter(shop__owner=user)
        else:
            return ContactLog.objects.none()
        shop = self.request.query_params.get("shop")
        if shop:
            qs = qs.filter(shop_id=shop)
        return qs

    def get_permissions(self):
        if self.action == "create":
            return [AllowAny()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rider_name = request.user.name if request.user.is_authenticated else request.data.get("riderName", "Guest")
        log = serializer.save(rider_name=rider_name)
        return Response(ContactLogSerializer(log).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# admin + platform stats
# ---------------------------------------------------------------------------
class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all().order_by("id")
    serializer_class = UserSerializer
    permission_classes = [IsAdminRole]
    # The frontend identifies users by their username ("rider1"), not the
    # database integer id, so detail routes use the username.
    lookup_field = "username"

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        return qs

    @action(detail=True, methods=["post"])
    def toggle_suspend(self, request, *args, **kwargs):
        user = self.get_object()
        if user.id == request.user.id:
            return Response({"detail": "You cannot suspend your own account."}, status=status.HTTP_400_BAD_REQUEST)
        user.suspended = not user.suspended
        user.save(update_fields=["suspended"])
        return Response(UserSerializer(user).data)

    @action(detail=True, methods=["post"])
    def reset_password(self, request, *args, **kwargs):
        user = self.get_object()
        # Prototype: no email delivery. Give the admin a temporary password
        # they can hand to the user, then force them to change it.
        temporary = "motify-temp-123"
        user.set_password(temporary)
        user.save(update_fields=["password"])
        return Response({"detail": f"Temporary password for {user.username}: {temporary}"})


class StatsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        shops = list(Shop.objects.all())
        reservations = list(Reservation.objects.select_related("shop").all())
        zones = {}
        for shop in shops:
            key = shop.zone or "Unassigned"
            zones.setdefault(key, {"vendors": 0, "reservations": 0})
            zones[key]["vendors"] += 1
        for reservation in reservations:
            key = reservation.shop.zone or "Unassigned"
            zones.setdefault(key, {"vendors": 0, "reservations": 0})
            zones[key]["reservations"] += 1
        return Response(
            {
                "vendorCount": len(shops),
                "partsCount": Product.objects.count(),
                "reservationCount": len(reservations),
                "pendingVerification": sum(1 for shop in shops if not shop.verified),
                "riderCount": User.objects.filter(role=User.Role.RIDER).count(),
                "zones": zones,
            }
        )
