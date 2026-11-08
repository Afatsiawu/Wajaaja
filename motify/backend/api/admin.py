"""Django admin registrations for every Motify table."""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

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


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        (None, {"fields": ("phone_number", "role", "suspended")}),
    )
    list_display = ("username", "email", "phone_number", "role", "suspended", "is_staff")
    list_filter = ("role", "suspended", "is_staff")
    search_fields = ("username", "email", "phone_number", "first_name", "last_name")


@admin.register(Shop)
class ShopAdmin(admin.ModelAdmin):
    list_display = ("shop_name", "owner", "zone", "verified", "rating", "is_open_override")
    list_filter = ("verified", "zone")
    search_fields = ("shop_name", "landmark_address")


@admin.register(Mechanic)
class MechanicAdmin(admin.ModelAdmin):
    list_display = ("full_name", "shop", "specialization", "is_on_duty")
    list_filter = ("is_on_duty",)
    search_fields = ("full_name", "phone_number")


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("category_name",)


@admin.register(BikeModel)
class BikeModelAdmin(admin.ModelAdmin):
    list_display = ("name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("part_name", "shop", "category", "price", "stock_quantity", "available")
    list_filter = ("category", "shop", "available")
    search_fields = ("part_name", "compatible_models")


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ("id", "rider", "product", "shop", "qty", "total", "status", "created_at")
    list_filter = ("status", "shop")
    search_fields = ("id", "product__part_name", "rider__username")


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("author", "shop", "rating", "created_at")
    list_filter = ("rating", "shop")


@admin.register(ContactLog)
class ContactLogAdmin(admin.ModelAdmin):
    list_display = ("type", "shop", "product_title", "rider_name", "created_at")
    list_filter = ("type", "shop")


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "shop", "created_at")


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ("user", "make", "model", "year", "cc")
