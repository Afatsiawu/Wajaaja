"""
Views define what happens when the frontend actually calls the API. Each
ViewSet below auto-generates the full set of REST endpoints (list, retrieve,
create, update, delete) for one model, wired up via api/urls.py.
"""
# Q: lets filter conditions be combined with OR (Django's .filter() only
# does AND by default) — used for the multi-field search below.
from django.db.models import Q
# viewsets: the base classes that auto-generate list/retrieve/create/
# update/delete behavior from a queryset + serializer.
from rest_framework import viewsets
# action: decorator for adding a custom endpoint (here, toggle_duty) on top
# of a ViewSet's normal auto-generated ones.
from rest_framework.decorators import action
# Response: DRF's HTTP response wrapper, used to return the custom
# toggle_duty endpoint's result as JSON.
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.exceptions import PermissionDenied, ValidationError, APIException


class PayloadTooLarge(APIException):
    status_code = 413
    default_detail = "File too large."
    default_code = "payload_too_large"

from .models import Shop, Mechanic, Category, Product
from .serializers import ShopSerializer, MechanicSerializer, CategorySerializer, ProductSerializer
from .permissions import (
    IsAdminOrReadOnly, IsSellerOrAdmin, IsSellerOwnerOrAdmin,
    CanManageMechanic, IsReviewOwnerOrAdmin, IsAdminRole, is_admin,
)


class CategoryViewSet(viewsets.ModelViewSet):
    # queryset: the base set of rows this viewset works with — every category, unfiltered.
    queryset = Category.objects.all()
    # serializer_class: which serializer converts Category rows to/from JSON.
    serializer_class = CategorySerializer
    # Categories are platform-managed: public read, admin-only write.
    permission_classes = [IsAdminOrReadOnly]


class ShopViewSet(viewsets.ModelViewSet):
    """
    GET /api/shops/                 -> all shops
    GET /api/shops/?open=true       -> only shops currently open
    GET /api/shops/?q=roundabout    -> search by name or landmark
    """
    # select_related("owner"): fetches the owner User in the SAME database
    # query as the shop (a SQL JOIN), instead of one extra query per shop
    # when the serializer reads owner_name/owner_phone.
    # prefetch_related("mechanics"): similarly avoids one extra query per
    # shop when the serializer reads the nested mechanics list — both are
    # performance optimizations, not behavior changes.
    queryset = Shop.objects.select_related("owner").prefetch_related("mechanics").all()
    serializer_class = ShopSerializer
    # Public read; only a signed-in seller/admin may write, and a seller can
    # only edit the shop they own (enforced by the object-level check).
    permission_classes = [IsSellerOrAdmin, IsSellerOwnerOrAdmin]

    def perform_create(self, serializer):
        # A seller always owns the shop they create. Admins may assign an owner.
        owner = serializer.validated_data.get("owner")
        if not is_admin(self.request.user) or not owner:
            owner = self.request.user
        serializer.save(owner=owner)

    def perform_update(self, serializer):
        # A seller cannot hand their shop over to another account.
        if is_admin(self.request.user):
            serializer.save()
        else:
            serializer.save(owner=self.request.user)

    # get_queryset: overridden (instead of just using the static queryset
    # above) so the list endpoint can respond to the ?q= and ?open=
    # query-string parameters described in the docstring above.
    def get_queryset(self):
        qs = super().get_queryset()  # start from the base queryset (with the select_related/prefetch_related already applied)
        user = self.request.user
        if not (user.is_authenticated and (user.is_staff or getattr(user, "role", None) in ("SELLER", "ADMIN"))):
            qs = qs.filter(owner__verification_status="APPROVED")
        q = self.request.query_params.get("q")  # read ?q=... from the URL, if present
        if q:
            # Case-insensitive match against EITHER the shop name OR the
            # landmark address (Q objects combined with | mean "OR").
            qs = qs.filter(Q(shop_name__icontains=q) | Q(landmark_address__icontains=q))
        if self.request.query_params.get("open") == "true":
            # is_open_now() is a Python method, not a database column, so
            # it can't be filtered with .filter() — instead this evaluates
            # the whole queryset into a plain Python list and filters with
            # a list comprehension. Fine at this dataset's scale (a
            # handful of shops); a much bigger shop count would want a
            # database-level equivalent instead.
            qs = [shop for shop in qs if shop.is_open_now()]
        return qs


class MechanicViewSet(viewsets.ModelViewSet):
    queryset = Mechanic.objects.select_related("shop").all()  # join the shop in the same query, same reasoning as ShopViewSet above
    serializer_class = MechanicSerializer
    # Sellers manage their own shop's mechanics; a mechanic may toggle their
    # own duty status; admins can manage any.
    permission_classes = [CanManageMechanic]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not (user.is_authenticated and (user.is_staff or getattr(user, "role", None) in ("SELLER", "ADMIN"))):
            qs = qs.filter(shop__owner__verification_status="APPROVED")
        return qs

    def perform_create(self, serializer):
        if not is_admin(self.request.user):
            if getattr(self.request.user, "role", None) != "SELLER":
                raise PermissionDenied("Only sellers and admins can add mechanics.")
            shop = serializer.validated_data.get("shop")
            if not shop or shop.owner_id != self.request.user.id:
                raise PermissionDenied("You can only add mechanics to your own shop.")
        serializer.save()

    def perform_update(self, serializer):
        if is_admin(self.request.user):
            serializer.save()
            return
        if getattr(self.request.user, "role", None) == "MECHANIC":
            # A mechanic may only change their own duty flag through this API.
            if any(field != "is_on_duty" for field in serializer.validated_data):
                raise PermissionDenied("Mechanics can only change their duty status.")
        else:
            # Sellers cannot move a mechanic to another shop or reassign the
            # linked user account.
            if "user" in serializer.validated_data:
                raise PermissionDenied("Only admins can reassign mechanic accounts.")
            shop = serializer.validated_data.get("shop")
            if shop and shop.owner_id != self.request.user.id:
                raise PermissionDenied("You can only manage mechanics in your own shop.")
        serializer.save()

    # toggle_duty: a custom endpoint at PATCH /api/mechanics/<id>/toggle_duty/
    # (the URL suffix comes from the method name). detail=True means it
    # operates on one specific mechanic (via the <id> in the URL), not the
    # whole list.
    @action(detail=True, methods=["patch"])
    def toggle_duty(self, request, pk=None):
        mechanic = self.get_object()  # looks up the Mechanic matching <id>, or 404s automatically
        mechanic.is_on_duty = not mechanic.is_on_duty  # flip the boolean
        mechanic.save(update_fields=["is_on_duty"])  # write just this one field back to the database
        return Response(MechanicSerializer(mechanic).data)  # respond with the updated mechanic as JSON


class ProductViewSet(viewsets.ModelViewSet):
    """
    GET /api/products/?q=piston                  -> search name/description/compatible models/shop
    GET /api/products/?category=3                -> filter by category id
    GET /api/products/?shop=2                     -> filter by shop id
    GET /api/products/?min_price=50&max_price=300 -> price range
    GET /api/products/?sort=price_asc|price_desc|name
    """
    # select_related on BOTH shop and category, since ProductSerializer
    # reads fields from both of those related objects for every product.
    queryset = Product.objects.select_related("shop", "category").all()
    serializer_class = ProductSerializer
    # Public read; sellers/admins can write, and sellers only for their shop.
    permission_classes = [IsSellerOrAdmin, IsSellerOwnerOrAdmin]

    def perform_create(self, serializer):
        if not is_admin(self.request.user):
            if getattr(self.request.user, "verification_status", "APPROVED") != "APPROVED":
                raise PermissionDenied("Your seller account is pending approval. You cannot publish products yet.")
            shop = serializer.validated_data.get("shop")
            if not shop or shop.owner_id != self.request.user.id:
                raise PermissionDenied("You can only list products for your own shop.")

        image = self.request.FILES.get("image")
        image_url = serializer.validated_data.get("image_url", "") or ""
        image_public_id = ""
        if image:
            if image.size > 5 * 1024 * 1024:
                raise PayloadTooLarge({"image": "Image too large (max 5 MB)."})
            if not (image.content_type or "").startswith("image/"):
                raise ValidationError({"image": "Only image files (JPG, PNG, WEBP) are allowed."})
            from django.conf import settings as dj_settings
            if not (dj_settings.CLOUDINARY_CLOUD_NAME and dj_settings.CLOUDINARY_API_KEY and dj_settings.CLOUDINARY_API_SECRET):
                raise ValidationError({"image": "Image upload is not configured on the server."})
            import cloudinary.uploader
            result = cloudinary.uploader.upload(image, folder="kwabenya-spares/products")
            image_url = result.get("secure_url", "")
            image_public_id = result.get("public_id", "")

        serializer.save(image_url=image_url, image_public_id=image_public_id)

    def perform_destroy(self, instance):
        if instance.image_public_id:
            try:
                import cloudinary.uploader
                cloudinary.uploader.destroy(instance.image_public_id)
            except Exception:
                pass
        instance.delete()

    def perform_update(self, serializer):
        # Sellers cannot move a listing into another seller's shop.
        if not is_admin(self.request.user):
            shop = serializer.validated_data.get("shop")
            if shop and shop.owner_id != self.request.user.id:
                raise PermissionDenied("You can only list products for your own shop.")

        image = self.request.FILES.get("image")
        image_url = serializer.validated_data.get("image_url", serializer.instance.image_url)
        image_public_id = serializer.instance.image_public_id
        if image:
            if image.size > 5 * 1024 * 1024:
                raise PayloadTooLarge({"image": "Image too large (max 5 MB)."})
            if not (image.content_type or "").startswith("image/"):
                raise ValidationError({"image": "Only image files (JPG, PNG, WEBP) are allowed."})
            from django.conf import settings as dj_settings
            if not (dj_settings.CLOUDINARY_CLOUD_NAME and dj_settings.CLOUDINARY_API_KEY and dj_settings.CLOUDINARY_API_SECRET):
                raise ValidationError({"image": "Image upload is not configured on the server."})
            import cloudinary.uploader
            result = cloudinary.uploader.upload(image, folder="kwabenya-spares/products")
            image_url = result.get("secure_url", "")
            image_public_id = result.get("public_id", "")
            # Delete the old image only after the new upload succeeded.
            old_public_id = serializer.instance.image_public_id
            if old_public_id and old_public_id != image_public_id:
                try:
                    cloudinary.uploader.destroy(old_public_id)
                except Exception:
                    pass

        serializer.save(image_url=image_url, image_public_id=image_public_id)

    # get_queryset: builds up the filtered/sorted queryset step by step
    # from whichever query-string parameters are actually present —
    # mirrors the filtering logic in the frontend's HomeView useMemo block
    # almost exactly, just expressed as Django ORM calls instead of JS
    # array methods.
    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not (user.is_authenticated and (user.is_staff or getattr(user, "role", None) in ("SELLER", "ADMIN"))):
            qs = qs.filter(shop__owner__verification_status="APPROVED")
        params = self.request.query_params  # shorthand for the rest of this method

        # --- text search across four fields at once ---
        q = params.get("q")
        if q:
            qs = qs.filter(
                Q(part_name__icontains=q)
                | Q(description__icontains=q)
                | Q(compatible_models__icontains=q)
                | Q(shop__shop_name__icontains=q)  # shop__shop_name reaches across the foreign key to the related Shop's name
            )

        # --- exact-match filters ---
        category = params.get("category")
        if category:
            qs = qs.filter(category_id=category)

        shop = params.get("shop")
        if shop:
            qs = qs.filter(shop_id=shop)

        # --- price range (each bound applied only if present) ---
        min_price = params.get("min_price")
        if min_price:
            qs = qs.filter(price__gte=min_price)  # gte = "greater than or equal to"

        max_price = params.get("max_price")
        if max_price:
            qs = qs.filter(price__lte=max_price)  # lte = "less than or equal to"

        # --- sort order ---
        sort = params.get("sort")
        if sort == "price_asc":
            qs = qs.order_by("price")
        elif sort == "price_desc":
            qs = qs.order_by("-price")  # leading "-" means descending
        elif sort == "name":
            qs = qs.order_by("part_name")
        # (no sort param, or an unrecognized value, leaves the default ordering as-is)

        return qs


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from rest_framework.views import APIView
from django.db.models import Sum, Count

from .models import User, Order, OrderItem, Review, Notification, CartItem
from .serializers import (
    OrderSerializer, OrderCreateSerializer, ReviewSerializer,
    NotificationSerializer, CartItemSerializer, RegisterSerializer, UserSerializer,
)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data}, status=201)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username") or request.data.get("phone_number")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if not user:
            return Response({"detail": "Invalid credentials."}, status=400)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class LogoutView(APIView):
    def post(self, request):
        if request.user.is_authenticated:
            Token.objects.filter(user=request.user).delete()
        return Response({"detail": "Logged out."})


class MeView(APIView):
    def get(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Not authenticated."}, status=401)
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        """Let a signed-in user update their own profile fields."""
        if not request.user.is_authenticated:
            return Response({"detail": "Not authenticated."}, status=401)
        allowed = {"first_name", "last_name", "email", "phone_number"}
        data = {k: v for k, v in request.data.items() if k in allowed}
        serializer = UserSerializer(request.user, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------
class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    queryset = Order.objects.select_related("customer", "shop").prefetch_related("items__product")
    # Orders are private: you must be signed in to place or view them.
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and not is_admin(user):
            # Sellers see orders placed at their own shop (plus any they
            # placed themselves); mechanics see their shop's orders; riders
            # only see their own.
            if user.role == User.Role.SELLER and hasattr(user, "shop"):
                qs = qs.filter(Q(shop=user.shop) | Q(customer=user))
            elif user.role == User.Role.MECHANIC and hasattr(user, "mechanic_profile"):
                qs = qs.filter(shop=user.mechanic_profile.shop)
            else:
                qs = qs.filter(customer=user)
        shop = self.request.query_params.get("shop")
        if shop:
            qs = qs.filter(shop_id=shop)
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        shop = Shop.objects.filter(pk=data["shop_id"]).first()
        if not shop:
            return Response({"detail": "Shop not found."}, status=400)
        # The signed-in account is always the customer for the order.
        customer = request.user

        items = []
        total = 0
        for item in data["items"]:
            product = Product.objects.filter(pk=item["product_id"], shop=shop).first()
            if not product:
                return Response({"detail": f"Product {item['product_id']} not found in this shop."}, status=400)
            if product.stock_quantity < item["quantity"]:
                return Response({"detail": f"Not enough stock for {product.part_name}."}, status=400)
            items.append((product, item["quantity"]))
            total += product.price * item["quantity"]

        order = Order.objects.create(
            customer=customer, shop=shop, total=total,
            payment_method=data.get("payment_method", Order.Payment.CASH),
            contact_name=data.get("contact_name", ""),
            contact_phone=data.get("contact_phone", ""),
            momo_number=data.get("momo_number", ""),
            notes=data.get("notes", ""),
        )
        for product, qty in items:
            OrderItem.objects.create(
                order=order, product=product, quantity=qty, unit_price=product.price,
                product_name=product.part_name, image_url=product.image_url or "",
            )
            product.stock_quantity -= qty
            product.save(update_fields=["stock_quantity"])

        Notification.objects.create(
            user=customer, order=order, title="Order placed",
            message=f"Your order #{order.pk} at {shop.shop_name} has been received.",
        )
        if shop.owner_id:
            Notification.objects.create(
                user=shop.owner, order=order, title="New order",
                message=f"New order #{order.pk} from {customer.username}.",
            )
        return Response(OrderSerializer(order).data, status=201)

    # Generic PUT/PATCH would let a customer rewrite total/status/shop. Force
    # all order changes through the explicit status workflow below.
    def update(self, request, *args, **kwargs):
        raise PermissionDenied("Use the update_status action to change an order.")

    def partial_update(self, request, *args, **kwargs):
        raise PermissionDenied("Use the update_status action to change an order.")

    def destroy(self, request, *args, **kwargs):
        if not is_admin(request.user):
            raise PermissionDenied("Only an admin can delete orders.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["patch"])
    def update_status(self, request, pk=None):
        order = self.get_object()
        # Only the shop owner or an admin may move an order through fulfilment.
        if not (is_admin(request.user) or (getattr(request.user, "role", None) == "SELLER" and order.shop.owner_id == request.user.id)):
            raise PermissionDenied("Only the shop owner or an admin can update order status.")
        status_value = request.data.get("status")
        if status_value not in dict(Order.Status.choices):
            return Response({"detail": "Invalid status."}, status=400)
        order.status = status_value
        order.save(update_fields=["status"])
        Notification.objects.create(
            user=order.customer, order=order, title="Order updated",
            message=f"Order #{order.pk} is now {order.get_status_display()}.",
        )
        return Response(OrderSerializer(order).data)


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------
class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer
    queryset = Review.objects.select_related("customer", "product").all()
    # Reviews are public to read, but writing requires a signed-in account.
    permission_classes = [IsAuthenticatedOrReadOnly, IsReviewOwnerOrAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        product = self.request.query_params.get("product")
        if product:
            qs = qs.filter(product_id=product)
        shop = self.request.query_params.get("shop")
        if shop:
            qs = qs.filter(product__shop_id=shop)
        return qs

    def perform_create(self, serializer):
        serializer.save(customer=self.request.user)

    def create(self, request, *args, **kwargs):
        """One review per customer per product: posting again updates it."""
        customer = request.user
        product_id = request.data.get("product")
        existing = Review.objects.filter(product_id=product_id, customer=customer).first()
        if existing:
            serializer = self.get_serializer(existing, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=200)
        return super().create(request, *args, **kwargs)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    queryset = Notification.objects.all()
    # Notifications are private to the signed-in user.
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    @action(detail=True, methods=["patch"])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=["patch"])
    def mark_all_read(self, request):
        self.get_queryset().update(is_read=True)
        return Response({"detail": "All notifications marked as read."})


# ---------------------------------------------------------------------------
# Cart
# ---------------------------------------------------------------------------
class CartItemViewSet(viewsets.ModelViewSet):
    serializer_class = CartItemSerializer
    queryset = CartItem.objects.select_related("product").all()
    # A cart belongs to exactly one signed-in user.
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ---------------------------------------------------------------------------
# Admin stats
# ---------------------------------------------------------------------------
class StatsView(APIView):
    # Platform-wide numbers are for the admin dashboard only.
    permission_classes = [IsAdminRole]

    def get(self, request):
        revenue = Order.objects.exclude(status=Order.Status.CANCELLED).aggregate(total=Sum("total"))["total"] or 0
        return Response({
            "users": User.objects.count(),
            "shops": Shop.objects.count(),
            "products": Product.objects.count(),
            "orders": Order.objects.count(),
            "reviews": Review.objects.count(),
            "revenue": float(revenue),
            "orders_by_status": list(Order.objects.values("status").annotate(count=Count("id"))),
        })
# ---------------------------------------------------------------------------
# Seller verification (admin)
# ---------------------------------------------------------------------------
class AdminSellerListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        status_filter = request.query_params.get("status")
        qs = User.objects.filter(role=User.Role.SELLER)
        if status_filter:
            qs = qs.filter(verification_status=status_filter.upper())
        return Response(UserSerializer(qs.order_by("-date_joined"), many=True).data)


class AdminSellerApproveView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        seller = User.objects.filter(pk=pk, role=User.Role.SELLER).first()
        if not seller:
            return Response({"detail": "Seller not found."}, status=404)
        # Idempotent: no duplicate notification if already approved.
        if seller.verification_status == User.VerificationStatus.APPROVED:
            return Response(UserSerializer(seller).data)
        seller.verification_status = User.VerificationStatus.APPROVED
        seller.rejection_reason = ""
        seller.save(update_fields=["verification_status", "rejection_reason"])
        Notification.objects.create(
            user=seller, title="Seller account approved",
            message="Your seller account has been approved. You can now publish products.",
        )
        return Response(UserSerializer(seller).data)


class AdminSellerRejectView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        seller = User.objects.filter(pk=pk, role=User.Role.SELLER).first()
        if not seller:
            return Response({"detail": "Seller not found."}, status=404)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"detail": "A rejection reason is required."}, status=400)
        # Idempotent: no duplicate notification if already rejected with same reason.
        if seller.verification_status == User.VerificationStatus.REJECTED and seller.rejection_reason == reason:
            return Response(UserSerializer(seller).data)
        seller.verification_status = User.VerificationStatus.REJECTED
        seller.rejection_reason = reason
        seller.save(update_fields=["verification_status", "rejection_reason"])
        Notification.objects.create(
            user=seller, title="Seller account rejected",
            message=f"Your seller account was rejected. {reason}".strip(),
        )
        return Response(UserSerializer(seller).data)
