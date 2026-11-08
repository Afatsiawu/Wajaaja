"""
Serializers: convert Django model rows to/from the JSON shapes the frontend
already uses.

The mock data layer in the frontend used camelCase keys and string ids
(``shopId``, ``mechanicName``, ``lastUpdated``, ``s1``, ``p1``...). The
serializers below deliberately preserve those exact shapes, so linking the
UI to this API required no changes to how pages read their data.
"""
import re

from rest_framework import serializers

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


def epoch_ms(value):
    """Django datetime -> JavaScript millisecond timestamp (what the UI uses)."""
    if not value:
        return None
    return int(value.timestamp() * 1000)


class CommaSeparatedListField(serializers.Field):
    """Reads/writes the model's comma string as a JSON array of strings."""

    def to_representation(self, value):
        if not value:
            return []
        return [item.strip() for item in str(value).split(",") if item.strip()]

    def to_internal_value(self, data):
        if data is None:
            return ""
        if isinstance(data, str):
            return data
        if isinstance(data, (list, tuple)):
            return ", ".join(str(item).strip() for item in data if str(item).strip())
        raise serializers.ValidationError("Expected a list of bike model names.")


class CategoryNameField(serializers.Field):
    """Accepts a category *name* on write and returns the name on read."""

    def to_representation(self, value):
        return value.category_name if value else None

    def to_internal_value(self, data):
        if data in (None, ""):
            return None
        name = str(data).strip()
        category, _ = Category.objects.get_or_create(category_name=name)
        return category


class GarageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ["id", "make", "model", "year", "cc"]


class MechanicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mechanic
        fields = ["id", "full_name", "phone_number", "specialization", "is_on_duty", "years_experience"]


class ShopSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="shop_name")
    ownerName = serializers.SerializerMethodField()
    ownerPhone = serializers.CharField(source="owner.phone_number", read_only=True)
    landmark = serializers.CharField(source="landmark_address", required=False, allow_blank=True)
    lat = serializers.DecimalField(source="latitude", max_digits=9, decimal_places=6, required=False)
    lng = serializers.DecimalField(source="longitude", max_digits=9, decimal_places=6, required=False)
    opening = serializers.TimeField(source="opening_time", format="%H:%M", required=False)
    closing = serializers.TimeField(source="closing_time", format="%H:%M", required=False)
    days = serializers.CharField(required=False, allow_blank=True)
    zone = serializers.CharField(required=False, allow_blank=True)
    verified = serializers.BooleanField(required=False)
    rating = serializers.DecimalField(max_digits=3, decimal_places=1, read_only=True)
    reviewCount = serializers.IntegerField(source="review_count", read_only=True)
    isOpenNow = serializers.SerializerMethodField()
    isOpenOverride = serializers.BooleanField(source="is_open_override", required=False)
    mechanics = MechanicSerializer(many=True, read_only=True)

    # Write-only fitter fields: the UI edits the shop's fitter inline.
    mechanicName = serializers.CharField(write_only=True, required=False, allow_blank=True)
    mechanicPhone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    mechanicSpec = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Shop
        fields = [
            "id", "name", "ownerName", "ownerPhone", "landmark", "lat", "lng",
            "opening", "closing", "days", "zone", "verified", "rating",
            "reviewCount", "isOpenNow", "isOpenOverride", "mechanics",
            "mechanicName", "mechanicPhone", "mechanicSpec",
        ]

    def get_ownerName(self, obj):
        return obj.owner.name

    def get_isOpenNow(self, obj):
        return obj.is_open_now()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        mechanic = instance.primary_mechanic
        data["mechanicName"] = mechanic.full_name if mechanic else ""
        data["mechanicPhone"] = mechanic.phone_number if mechanic else ""
        data["mechanicSpec"] = mechanic.specialization if mechanic else ""
        return data

    @staticmethod
    def _pop_mechanic_fields(validated_data):
        return {
            "full_name": validated_data.pop("mechanicName", None),
            "phone_number": validated_data.pop("mechanicPhone", None),
            "specialization": validated_data.pop("mechanicSpec", None),
        }

    @staticmethod
    def _save_mechanic(shop, mechanic_data):
        name = mechanic_data.get("full_name")
        phone = mechanic_data.get("phone_number")
        spec = mechanic_data.get("specialization")
        if name is None and phone is None and spec is None:
            return
        mechanic = shop.primary_mechanic
        if mechanic is None:
            mechanic = Mechanic(shop=shop)
        if name is not None:
            mechanic.full_name = name
        if phone is not None:
            mechanic.phone_number = phone
        if spec is not None:
            mechanic.specialization = spec
        mechanic.save()

    def create(self, validated_data):
        mechanic_data = self._pop_mechanic_fields(validated_data)
        shop = Shop.objects.create(**validated_data)
        self._save_mechanic(shop, mechanic_data)
        return shop

    def update(self, instance, validated_data):
        mechanic_data = self._pop_mechanic_fields(validated_data)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        self._save_mechanic(instance, mechanic_data)
        return instance


class ProductSerializer(serializers.ModelSerializer):
    shopId = serializers.PrimaryKeyRelatedField(source="shop", queryset=Shop.objects.all())
    title = serializers.CharField(source="part_name")
    category = CategoryNameField(required=False, allow_null=True)
    models = CommaSeparatedListField(source="compatible_models", required=False)
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    stock = serializers.IntegerField(source="stock_quantity", required=False)
    desc = serializers.CharField(source="description", required=False, allow_blank=True)
    available = serializers.BooleanField(required=False)
    imageUrl = serializers.CharField(source="image_url", required=False, allow_blank=True)
    lastUpdated = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "shopId", "title", "category", "models", "price", "stock",
            "desc", "available", "imageUrl", "lastUpdated",
        ]
        read_only_fields = ["id"]

    def get_lastUpdated(self, obj):
        return epoch_ms(obj.last_updated)

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def validate_stock(self, value):
        if value < 0:
            raise serializers.ValidationError("Stock cannot be negative.")
        return value


class ReservationSerializer(serializers.ModelSerializer):
    riderId = serializers.CharField(source="rider.username", read_only=True)
    riderName = serializers.CharField(source="rider.name", read_only=True)
    productId = serializers.PrimaryKeyRelatedField(source="product", queryset=Product.objects.all())
    shopId = serializers.PrimaryKeyRelatedField(source="shop", queryset=Shop.objects.all(), required=False)
    createdAt = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = ["id", "riderId", "riderName", "productId", "shopId", "qty", "total", "status", "notes", "createdAt"]
        read_only_fields = ["id"]

    def get_createdAt(self, obj):
        return epoch_ms(obj.created_at)

    def validate_qty(self, value):
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value


class ReviewSerializer(serializers.ModelSerializer):
    shopId = serializers.PrimaryKeyRelatedField(source="shop", queryset=Shop.objects.all())
    author = serializers.CharField(required=False, allow_blank=True)
    createdAt = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ["id", "shopId", "author", "rating", "text", "createdAt"]
        read_only_fields = ["id"]

    def get_createdAt(self, obj):
        return epoch_ms(obj.created_at)

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value


class ContactLogSerializer(serializers.ModelSerializer):
    shopId = serializers.PrimaryKeyRelatedField(source="shop", queryset=Shop.objects.all())
    productTitle = serializers.CharField(source="product_title", required=False, allow_blank=True)
    riderName = serializers.CharField(source="rider_name", required=False, allow_blank=True)
    when = serializers.SerializerMethodField()

    class Meta:
        model = ContactLog
        fields = ["id", "shopId", "type", "productTitle", "riderName", "when"]
        read_only_fields = ["id"]

    def get_when(self, obj):
        return epoch_ms(obj.created_at)


class UserSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="username", read_only=True)
    name = serializers.SerializerMethodField()
    phone = serializers.CharField(source="phone_number", required=False, allow_blank=True, allow_null=True)
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    role = serializers.CharField(read_only=True)
    shopId = serializers.SerializerMethodField()
    favorites = serializers.SerializerMethodField()
    garage = GarageSerializer(source="vehicles", many=True, read_only=True)
    suspended = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "name", "phone", "email", "role", "shopId", "favorites", "garage", "suspended"]

    def get_name(self, obj):
        return obj.name

    def get_shopId(self, obj):
        shop = getattr(obj, "shop", None)
        return shop.id if shop else None

    def get_favorites(self, obj):
        return list(obj.favorites.values_list("shop_id", flat=True))


class BikeModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = BikeModel
        fields = ["id", "name"]


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "category_name"]


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)


class DemoLoginSerializer(serializers.Serializer):
    userId = serializers.CharField()


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=6)
    role = serializers.ChoiceField(choices=[User.Role.RIDER, User.Role.VENDOR], default=User.Role.RIDER)

    def validate_phone(self, value):
        digits = re.sub(r"\D", "", value)
        if len(digits) < 9:
            raise serializers.ValidationError("Enter a valid phone number.")
        for existing in User.objects.exclude(phone_number__isnull=True).values_list("phone_number", flat=True):
            if re.sub(r"\D", "", existing) == digits:
                raise serializers.ValidationError("An account with this phone number already exists.")
        return value

    def validate_email(self, value):
        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def create(self, validated_data):
        from django.db import transaction

        with transaction.atomic():
            name = validated_data["name"].strip()
            first, *rest = name.split(" ", 1)
            email = validated_data.get("email") or None
            phone = validated_data["phone"].strip()

            base = (email.split("@")[0] if email else re.sub(r"\D", "", phone)) or "rider"
            base = re.sub(r"[^a-z0-9_]", "", base.lower()) or "rider"
            username = base
            counter = 1
            while User.objects.filter(username=username).exists():
                username = f"{base}{counter}"
                counter += 1

            user = User(
                username=username,
                first_name=first,
                last_name=rest[0] if rest else "",
                email=email,
                phone_number=phone,
                role=validated_data["role"],
            )
            user.set_password(validated_data["password"])
            user.save()
            return user


class ChangePasswordSerializer(serializers.Serializer):
    currentPassword = serializers.CharField(write_only=True)
    newPassword = serializers.CharField(write_only=True, min_length=6)
