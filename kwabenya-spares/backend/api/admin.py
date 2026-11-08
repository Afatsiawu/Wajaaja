"""
Registers every model with Django's built-in admin site, so
http://localhost:8000/admin/ gives a working (if plain) UI for viewing and
editing every table without writing any custom admin templates.
"""
from django.contrib import admin
# UserAdmin: Django's own admin configuration for its built-in User model —
# subclassed below instead of built from scratch, so login/password-change
# screens in the admin keep working correctly for the custom User model too.
from django.contrib.auth.admin import UserAdmin
from .models import (
    User, Shop, Mechanic, Category, Product,
    Order, OrderItem, Review, Notification, CartItem,
)


# @admin.register(User) is equivalent to calling admin.site.register(User,
# CustomUserAdmin) after the class definition — just a more compact syntax.
@admin.register(User)
class CustomUserAdmin(UserAdmin):
    # Django's default UserAdmin doesn't know about phone_number/role
    # (since those fields don't exist on the base User model it was built
    # for) — this appends one more fieldset section containing them, so
    # they're editable on the user's admin detail page.
    fieldsets = UserAdmin.fieldsets + ((None, {"fields": ("phone_number", "role")}),)
    # Which columns show up in the user list table in the admin.
    list_display = ("username", "email", "phone_number", "role", "is_staff")


@admin.register(Shop)
class ShopAdmin(admin.ModelAdmin):
    list_display = ("shop_name", "owner", "landmark_address", "is_open_override")
    # Enables the admin's search box, matching against these two fields.
    search_fields = ("shop_name", "landmark_address")


@admin.register(Mechanic)
class MechanicAdmin(admin.ModelAdmin):
    list_display = ("full_name", "shop", "specialization", "is_on_duty")
    # Adds a sidebar filter that lets you narrow the list to only
    # on-duty or only off-duty mechanics.
    list_filter = ("is_on_duty",)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("category_name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("part_name", "shop", "category", "price", "stock_quantity")
    # Sidebar filters by category and by shop.
    list_filter = ("category", "shop")
    # Search box matches against part name and the compatible-models text.
    search_fields = ("part_name", "compatible_models")


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("unit_price",)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "shop", "status", "total", "payment_method", "created_at")
    list_filter = ("status", "payment_method", "shop")
    search_fields = ("customer__username", "shop__shop_name", "contact_name", "contact_phone")
    inlines = [OrderItemInline]


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ("order", "product", "quantity", "unit_price")


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("product", "customer", "rating", "created_at")
    list_filter = ("rating",)
    search_fields = ("product__part_name", "customer__username", "comment")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "is_read", "created_at")
    list_filter = ("is_read",)
    search_fields = ("title", "message", "user__username")


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ("user", "product", "quantity", "created_at")
