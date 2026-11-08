"""
Database models for the Motify (Kwabenya Spares) platform.

The frontend prototype (motoparts-site-main) was originally powered by a
localStorage mock. These models are the real, server-side equivalent: every
entity the UI touches has a table here, and every id is a short string
("s1", "p1", "rider1", ...) so the URLs and object shapes the frontend
already uses keep working unchanged.

Tables:
  User        -> riders, vendors and admins (Django's auth user + extras)
  Shop        -> a vendor's shop / fitter profile
  Mechanic    -> the fitter assigned to a shop
  Category    -> spare-part categories
  BikeModel   -> compatible motorcycle models
  Product     -> one spare-part listing
  Reservation -> a rider's hold request against a product
  Review      -> a rider's rating of a shop
  ContactLog  -> call / WhatsApp / directions taps from riders
  Favorite    -> rider's saved shops
  Vehicle     -> rider's garage
"""
import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


def short_id(prefix):
    """Generate a short, URL-safe id such as ``s3f9a1c2b``."""
    return f"{prefix}{uuid.uuid4().hex[:8]}"


# Named defaults (not lambdas) so Django can serialize them into migrations.
def new_shop_id():
    return short_id("s")


def new_product_id():
    return short_id("p")


def new_reservation_id():
    return short_id("r")


def new_review_id():
    return short_id("review")


def new_contact_id():
    return short_id("c")


class User(AbstractUser):
    """Django auth user extended with the platform's role, phone and state."""

    class Role(models.TextChoices):
        RIDER = "rider", "Rider"
        VENDOR = "vendor", "Vendor"
        ADMIN = "admin", "Admin"

    # email is used as a login identifier, so it must be unique when present.
    email = models.EmailField(blank=True, null=True, unique=True)
    phone_number = models.CharField(max_length=20, unique=True, null=True, blank=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.RIDER)
    suspended = models.BooleanField(default=False)

    @property
    def name(self):
        return self.get_full_name().strip() or self.username

    def __str__(self):
        return f"{self.name} ({self.role})"


class Shop(models.Model):
    """A Kwabenya spare-parts shop, owned by exactly one vendor account."""

    id = models.CharField(primary_key=True, max_length=24, default=new_shop_id, editable=False)
    owner = models.OneToOneField(User, on_delete=models.CASCADE, related_name="shop")
    shop_name = models.CharField(max_length=150)
    landmark_address = models.TextField(blank=True, help_text='e.g. "Near Kwabenya Roundabout, opposite Shell Station"')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, default=5.6875)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, default=-0.2015)
    opening_time = models.TimeField(default="07:00")
    closing_time = models.TimeField(default="18:00")
    days = models.CharField(max_length=50, default="Mon-Sat", help_text="e.g. 'Mon-Sat' or 'Mon-Sun'")
    zone = models.CharField(max_length=100, blank=True, help_text="e.g. 'Atomic Junction end'")
    is_open_override = models.BooleanField(default=True)
    verified = models.BooleanField(default=False)
    rating = models.DecimalField(max_digits=3, decimal_places=1, default=0)
    review_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["shop_name"]

    def __str__(self):
        return self.shop_name

    @property
    def primary_mechanic(self):
        return self.mechanics.first()

    def is_open_now(self, now=None):
        """Computed OPEN/CLOSED status used by the storefront badge."""
        import datetime

        if not self.is_open_override:
            return False
        now = now or datetime.datetime.now()
        # The frontend's rule: "Mon-Sat" shops are closed all day Sunday.
        if self.days == "Mon-Sat" and now.weekday() == 6:
            return False
        current_time = now.time()
        if self.opening_time <= self.closing_time:
            return self.opening_time <= current_time <= self.closing_time
        # Shops whose closing time rolls past midnight.
        return current_time >= self.opening_time or current_time <= self.closing_time

    def recalculate_rating(self):
        """Recompute rating/review_count from this shop's reviews."""
        from django.db.models import Avg

        stats = self.reviews.aggregate(avg=Avg("rating"))
        count = self.reviews.count()
        self.review_count = count
        self.rating = round(stats["avg"] or 0, 1)
        self.save(update_fields=["rating", "review_count"])


class Mechanic(models.Model):
    """The shop's assigned fitter / mechanic."""

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="mechanics")
    # Optional login account for the mechanic. The storefront only needs the
    # name/phone/specialisation, so this may stay empty.
    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True, blank=True, related_name="mechanic_profile")
    full_name = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=20)
    specialization = models.CharField(max_length=255, blank=True)
    is_on_duty = models.BooleanField(default=True)
    years_experience = models.PositiveIntegerField(default=2)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.full_name} — {self.shop.shop_name}"


class Category(models.Model):
    """Spare-parts category (Engine, Brake System, ...)."""

    category_name = models.CharField(max_length=100, unique=True)

    class Meta:
        verbose_name_plural = "categories"
        ordering = ["category_name"]

    def __str__(self):
        return self.category_name


class BikeModel(models.Model):
    """A motorcycle model that parts can be compatible with."""

    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(models.Model):
    """One spare-part listing belonging to exactly one shop."""

    id = models.CharField(primary_key=True, max_length=24, default=new_product_id, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="products")
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name="products")
    part_name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    # Free-text comma-separated list, e.g. "Bajaj Boxer 150, TVS HLX 125".
    compatible_models = models.CharField(max_length=255, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock_quantity = models.PositiveIntegerField(default=1)
    available = models.BooleanField(default=True)
    image_url = models.URLField(max_length=255, blank=True)
    last_updated = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Oldest listing first, matching the order the prototype's mock data
        # returned (new parts are appended to the end of the catalogue).
        ordering = ["created_at", "id"]

    def __str__(self):
        return self.part_name


class Reservation(models.Model):
    """A rider's hold request; payment happens in person on pickup."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending confirmation"
        CONFIRMED = "confirmed", "Confirmed"
        READY = "ready_for_pickup", "Ready for pickup"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    id = models.CharField(primary_key=True, max_length=24, default=new_reservation_id, editable=False)
    rider = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reservations")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="reservations")
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="reservations")
    qty = models.PositiveIntegerField(default=1)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.id} — {self.product.part_name}"


class Review(models.Model):
    """A rider's rating and short review of a shop."""

    id = models.CharField(primary_key=True, max_length=24, default=new_review_id, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="reviews")
    rider = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviews")
    author = models.CharField(max_length=100)
    rating = models.PositiveSmallIntegerField(default=5)
    text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.author} — {self.rating}/5"


class ContactLog(models.Model):
    """A rider tapping Call / WhatsApp / Directions on a part."""

    class Kind(models.TextChoices):
        CALL = "call", "Call"
        WHATSAPP = "whatsapp", "WhatsApp"
        DIRECTIONS = "directions", "Directions"

    id = models.CharField(primary_key=True, max_length=24, default=new_contact_id, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="contact_logs")
    type = models.CharField(max_length=20, choices=Kind.choices, default=Kind.CALL)
    product_title = models.CharField(max_length=200, blank=True)
    rider_name = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.type} — {self.shop.shop_name}"


class Favorite(models.Model):
    """A rider's saved shop."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="favorites")
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="favorited_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "shop")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.name} saved {self.shop.shop_name}"


class Vehicle(models.Model):
    """A bike in a rider's garage."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="vehicles")
    make = models.CharField(max_length=60)
    model = models.CharField(max_length=100)
    year = models.PositiveIntegerField(default=2026)
    cc = models.PositiveIntegerField(default=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.model} ({self.year})"
