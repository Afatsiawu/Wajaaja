"""
Serializers convert between Django model instances (Python objects) and
JSON (what the frontend actually sends/receives over the API). Each one
below corresponds to one model in models.py.
"""
# serializers: Django REST Framework's toolkit for building these converters.
from rest_framework import serializers
# The five models being serialized, imported from this same app.
from .models import (
    User, Shop, Mechanic, Category, Product,
    Order, OrderItem, Review, Notification, CartItem,
)


class CategorySerializer(serializers.ModelSerializer):
    # ModelSerializer auto-generates fields from the model, so this class
    # just needs to say which model and which fields to expose.
    class Meta:
        model = Category
        fields = ["id", "category_name"]  # expose the auto id plus the one real column


class MechanicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mechanic
        # Every column on the Mechanic model, exposed as-is — no computed
        # or nested fields needed here (ShopSerializer nests THIS
        # serializer instead, see below).
        fields = ["id", "shop", "user", "full_name", "phone_number", "specialization", "is_on_duty", "years_experience"]


class ShopSerializer(serializers.ModelSerializer):
    # owner is optional on input because the view sets it to the signed-in
    # seller automatically (admins can still pass an explicit owner id).
    owner = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)
    # mechanics: nests the FULL mechanic record(s) for this shop directly
    # inside the shop's JSON, instead of forcing the frontend to make a
    # second request. many=True because it's a reverse ForeignKey relation
    # (one shop -> its mechanics queryset); read_only=True because you
    # create/edit mechanics through their own endpoint, not through the shop's.
    mechanics = MechanicSerializer(many=True, read_only=True)
    # is_open_now: not a real database column — SerializerMethodField calls
    # get_is_open_now() below at serialization time and includes its
    # return value as if it were a normal field. This is what lets the
    # frontend's OPEN/CLOSED badge come straight from the API response.
    is_open_now = serializers.SerializerMethodField()
    # owner_name / owner_phone: pull values from the related User object
    # (source="owner.get_full_name" / "owner.phone_number") so the frontend
    # gets the owner's name and phone directly on the shop object, without
    # having to separately fetch the User.
    owner_name = serializers.CharField(source="owner.get_full_name", read_only=True)
    owner_phone = serializers.CharField(source="owner.phone_number", read_only=True)

    class Meta:
        model = Shop
        fields = [
            "id", "owner", "owner_name", "owner_phone", "shop_name", "landmark_address",
            "latitude", "longitude", "opening_time", "closing_time",
            "is_open_override", "is_open_now", "mechanics", "created_at",
        ]

    # get_is_open_now: DRF automatically calls this because the field above
    # is named `is_open_now` (DRF looks for get_<field_name>). Just calls
    # the model's own is_open_now() method defined in models.py.
    def get_is_open_now(self, obj):
        return obj.is_open_now()


class ShopMiniSerializer(serializers.ModelSerializer):
    """Lightweight shop representation nested inside a product."""
    # Same computed-status trick as ShopSerializer above, but this
    # serializer intentionally leaves out mechanics/owner details — a
    # product listing only needs enough shop info to show the mini
    # shop+status card, not the shop's full profile.
    is_open_now = serializers.SerializerMethodField()

    class Meta:
        model = Shop
        fields = ["id", "shop_name", "landmark_address", "latitude", "longitude", "is_open_now"]

    def get_is_open_now(self, obj):
        return obj.is_open_now()


class ProductSerializer(serializers.ModelSerializer):
    # shop: on READ, returns the full nested ShopMiniSerializer object (so
    # the frontend gets shop name/landmark/status without a second request).
    shop = ShopMiniSerializer(read_only=True)
    # shop_id: on WRITE (creating/updating a product), the frontend instead
    # sends a plain shop id number — this field accepts that id, looks up
    # the matching Shop, and writes it into the `shop` relation
    # (source="shop"). write_only=True keeps it out of the JSON responses,
    # where the nested `shop` object above is used instead.
    shop_id = serializers.PrimaryKeyRelatedField(queryset=Shop.objects.all(), source="shop", write_only=True)
    # category: same nested-on-read pattern as shop, using the plain CategorySerializer.
    category = CategorySerializer(read_only=True)
    # category_id: same write-only-id-on-write pattern as shop_id, but
    # allow_null=True/required=False since a product's category is
    # optional (mirrors category = ForeignKey(..., null=True) in models.py).
    category_id = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), source="category", write_only=True, allow_null=True, required=False)

    class Meta:
        model = Product
        fields = [
            "id", "shop", "shop_id", "category", "category_id", "part_name", "description",
            "compatible_models", "price", "stock_quantity", "image_url", "created_at",
        ]


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        # Deliberately excludes password/is_staff/etc — only the fields
        # that are safe and useful to expose over the API.
        fields = ["id", "username", "first_name", "last_name", "email", "phone_number", "role"]


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "image_url", "quantity", "unit_price"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    shop_name = serializers.CharField(source="shop.shop_name", read_only=True)
    customer_name = serializers.CharField(source="customer.username", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "customer", "customer_name", "shop", "shop_name", "status",
            "payment_method", "total", "contact_name", "contact_phone",
            "momo_number", "notes", "items", "created_at",
        ]
        read_only_fields = ["customer", "total", "status"]


class OrderCreateItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class OrderCreateSerializer(serializers.Serializer):
    shop_id = serializers.IntegerField()
    payment_method = serializers.ChoiceField(choices=Order.Payment.choices, default=Order.Payment.CASH)
    contact_name = serializers.CharField(max_length=100, allow_blank=True, required=False)
    contact_phone = serializers.CharField(max_length=15, allow_blank=True, required=False)
    momo_number = serializers.CharField(max_length=15, allow_blank=True, required=False)
    notes = serializers.CharField(allow_blank=True, required=False)
    items = OrderCreateItemSerializer(many=True)


class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.username", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "product", "customer", "customer_name", "rating", "comment", "created_at"]
        read_only_fields = ["customer"]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "message", "is_read", "order", "created_at"]


class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.part_name", read_only=True)
    price = serializers.DecimalField(source="product.price", max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = CartItem
        fields = ["id", "product", "product_name", "price", "quantity", "created_at"]
        read_only_fields = ["user"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    # Self-registration is limited to the three public roles. Admin accounts
    # are created by platform staff (Django admin / seed command) only.
    role = serializers.ChoiceField(
        choices=[
            (User.Role.RIDER, "Rider"),
            (User.Role.SELLER, "Seller"),
            (User.Role.MECHANIC, "Mechanic"),
        ],
        default=User.Role.RIDER,
    )

    class Meta:
        model = User
        fields = ["username", "email", "phone_number", "role", "password", "name"]

    def create(self, validated_data):
        name = validated_data.pop("name", "")
        password = validated_data.pop("password")
        user = User(**validated_data)
        if name:
            parts = name.split(" ", 1)
            user.first_name = parts[0]
            user.last_name = parts[1] if len(parts) > 1 else ""
        user.set_password(password)
        user.save()
        return user
