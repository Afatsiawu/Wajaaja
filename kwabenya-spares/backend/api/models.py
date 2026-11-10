"""
Models mirror the PostgreSQL schema from the design spec 1:1 in structure
and relationships. Django gives each table its own auto-incrementing `id`
primary key rather than the explicit `*_id SERIAL PRIMARY KEY` from the
raw SQL, but every other column and foreign key relationship matches.

Table-by-table mapping to the spec's raw SQL:
  users      -> User (below)
  shops      -> Shop
  mechanics  -> Mechanic
  categories -> Category
  products   -> Product
"""
# AbstractUser: Django's built-in user model (username, password, email,
# first/last name, is_staff, etc.) — we subclass it below instead of
# building a user table from scratch, so login/auth machinery keeps working.
from django.contrib.auth.models import AbstractUser
from django.core.validators import MaxValueValidator, MinValueValidator
# models: Django's ORM toolkit — every field type (CharField, ForeignKey,
# DecimalField, etc.) and the base Model class come from here.
from django.db import models


class User(AbstractUser):
    """Extends Django's built-in auth user with the platform's role + phone."""

    # Role: an enum-like set of choices, equivalent to the SQL schema's
    # `CREATE TYPE user_role AS ENUM ('RIDER','SELLER','MECHANIC','ADMIN')`.
    # Each line is (stored value, human-readable label).
    class Role(models.TextChoices):
        RIDER = "RIDER", "Rider"
        SELLER = "SELLER", "Seller"
        MECHANIC = "MECHANIC", "Mechanic"
        ADMIN = "ADMIN", "Admin"

    # phone_number: matches the schema's `phone_number VARCHAR(15) UNIQUE NOT NULL`.
    phone_number = models.CharField(max_length=15, unique=True)
    # role: matches the schema's `role user_role NOT NULL DEFAULT 'RIDER'`.
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.RIDER)

    # Verification status for seller accounts (pending until an admin approves).
    class VerificationStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    verification_status = models.CharField(
        max_length=10, choices=VerificationStatus.choices, default=VerificationStatus.APPROVED
    )
    rejection_reason = models.TextField(blank=True, default="")

    # __str__: what shows up in the Django admin list view and in debug
    # output — e.g. "kwame_owusu (SELLER)". Falls back to username since
    # this base User model doesn't actually have a `full_name` field (that
    # lives on AbstractUser as first_name/last_name instead); the
    # hasattr() check is defensive in case a subclass ever adds one.
    def __str__(self):
        return f"{self.full_name if hasattr(self, 'full_name') else self.username} ({self.role})"


class Shop(models.Model):
    """Kwabenya shop / seller profile. owner is 1-to-1 with a SELLER user."""

    # owner: matches the schema's `owner_id INT UNIQUE REFERENCES users(user_id)`.
    # OneToOneField + on_delete=CASCADE means deleting the owner user also
    # deletes their shop (and, by further cascade, that shop's products).
    owner = models.OneToOneField(User, on_delete=models.CASCADE, related_name="shop")
    # shop_name: matches `shop_name VARCHAR(150) NOT NULL`.
    shop_name = models.CharField(max_length=150)
    # landmark_address: matches `landmark_address TEXT NOT NULL`, with the
    # same example landmark text as the schema's own SQL comment.
    landmark_address = models.TextField(help_text='e.g. "Near Kwabenya Roundabout, opposite Shell Fuel Station"')
    # latitude/longitude: matches `DECIMAL(9,6)` — 9 total digits, 6 after
    # the decimal point, enough precision for exact map pin placement.
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    # opening_time/closing_time: matches `TIME NOT NULL` columns.
    opening_time = models.TimeField()
    closing_time = models.TimeField()
    # is_open_override: matches `BOOLEAN DEFAULT TRUE` — the manual
    # force-open/force-closed switch described in the frontend's seller
    # dashboard.
    is_open_override = models.BooleanField(default=True)
    # created_at: matches `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` — Django
    # sets this automatically the moment the row is first created.
    created_at = models.DateTimeField(auto_now_add=True)

    # __str__: shows the shop name wherever Django needs to display this
    # object as text (admin dropdowns, debug shells, etc).
    def __str__(self):
        return self.shop_name

    def is_open_now(self, now=None):
        """Computed OPEN/CLOSED status used by the storefront badge."""
        # Imported locally (rather than at the top of the file) since it's
        # only needed inside this one method.
        import datetime

        # Manual override takes priority over the clock: if the owner has
        # force-closed the shop, it's closed no matter what time it is.
        if not self.is_open_override:
            return False
        # Default to the real current time if the caller didn't pass one in
        # (mainly useful for tests, which can pass a fixed `now`).
        now = now or datetime.datetime.now()
        current_time = now.time()
        if self.opening_time <= self.closing_time:
            # Normal case: opening time is earlier in the day than closing
            # time (e.g. 7:00 AM -> 7:00 PM) — simple range check.
            return self.opening_time <= current_time <= self.closing_time
        # Handles shops whose closing time rolls past midnight.
        return current_time >= self.opening_time or current_time <= self.closing_time


class Mechanic(models.Model):
    """Assigned shop mechanic / fitter."""

    # shop: matches `shop_id INT REFERENCES shops(shop_id) ON DELETE CASCADE`
    # — deleting a shop deletes its mechanic row too.
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="mechanics")
    # user: matches `user_id INT UNIQUE REFERENCES users(user_id)` — links
    # this mechanic profile to their own login account (role=MECHANIC).
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="mechanic_profile")
    # full_name/phone_number: matches the schema's own VARCHAR columns.
    full_name = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=15)
    # specialization: matches `VARCHAR(255)`, free text (e.g. "Engine
    # overhaul, Brake systems") rather than a fixed set of choices.
    specialization = models.CharField(max_length=255, help_text="e.g. 'Engine overhaul, Brake systems'")
    # is_on_duty: matches `BOOLEAN DEFAULT TRUE` — the Available/Busy toggle.
    is_on_duty = models.BooleanField(default=True)
    # years_experience: matches `INT DEFAULT 2`.
    years_experience = models.PositiveIntegerField(default=2)

    # __str__: shows "Fitter Name — Shop Name" for easy identification in
    # the admin (since a mechanic's own name alone could be ambiguous
    # across shops).
    def __str__(self):
        return f"{self.full_name} — {self.shop.shop_name}"


class Category(models.Model):
    """Spare-parts category (Engine Components, Braking System, etc)."""

    # category_name: matches `category_name VARCHAR(100) NOT NULL`.
    category_name = models.CharField(max_length=100)

    class Meta:
        # Without this, Django's admin would pluralize "Category" as
        # "Categorys" — this fixes that to the correct "Categories".
        verbose_name_plural = "categories"

    def __str__(self):
        return self.category_name


class Product(models.Model):
    """One spare-part listing, belonging to exactly one shop."""

    # shop: matches `shop_id INT REFERENCES shops(shop_id) ON DELETE CASCADE`.
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="products")
    # category: matches `category_id INT REFERENCES categories(category_id)`.
    # SET_NULL (rather than CASCADE) means deleting a category leaves the
    # product itself intact, just with category set to null, instead of
    # deleting every product that was ever tagged with that category.
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name="products")
    # part_name: matches `part_name VARCHAR(200) NOT NULL`.
    part_name = models.CharField(max_length=200)
    # description: matches `description TEXT` (nullable in the schema, so
    # blank=True here lets Django admin/forms treat an empty string as valid).
    description = models.TextField(blank=True)
    # compatible_models: matches `compatible_models VARCHAR(255) NOT NULL`,
    # a free-text comma-separated list like "Bajaj Boxer BM150, TVS HLX".
    compatible_models = models.CharField(max_length=255, help_text="e.g. 'Bajaj Boxer BM150, Haojue HJ125, TVS HLX'")
    # price: matches `price DECIMAL(10,2) NOT NULL` — up to 10 digits total, 2 after the decimal point.
    price = models.DecimalField(max_digits=10, decimal_places=2)
    # stock_quantity: matches `stock_quantity INT NOT NULL DEFAULT 1`.
    stock_quantity = models.PositiveIntegerField(default=1)
    # image_url: matches `image_url VARCHAR(255)` — optional, since there
    # are no real product photos yet (the frontend uses category icons instead).
    image_url = models.CharField(max_length=255, blank=True)
    image_public_id = models.CharField(max_length=255, blank=True, default="")
    is_hidden = models.BooleanField(default=False)
    moderation_reason = models.TextField(blank=True, default="")
    is_removed = models.BooleanField(default=False)
    # created_at: matches `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`.
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.part_name


class Order(models.Model):
    """A customer order placed against one shop."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        CONFIRMED = "CONFIRMED", "Confirmed"
        READY = "READY", "Ready for pickup"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class Payment(models.TextChoices):
        MOMO = "MOMO", "Mobile money"
        CASH = "CASH", "Cash on pickup"

    customer = models.ForeignKey(User, on_delete=models.CASCADE, related_name="orders")
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="orders")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    payment_method = models.CharField(max_length=8, choices=Payment.choices, default=Payment.CASH)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    contact_name = models.CharField(max_length=100, blank=True)
    contact_phone = models.CharField(max_length=15, blank=True)
    momo_number = models.CharField(max_length=15, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Order #{self.pk} - {self.shop.shop_name}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    # Nullable so a deleted product doesn't delete the order; name/price/image
    # are snapshotted below so the historical record stays intact.
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name="order_items")
    product_name = models.CharField(max_length=150, default="")
    image_url = models.CharField(max_length=255, blank=True, default="")
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.quantity} x {self.product_name or (self.product.part_name if self.product else 'deleted product')}"


class Enquiry(models.Model):
    STATUS_CHOICES = [("OPEN", "Open"), ("CLOSED", "Closed")]

    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name="enquiries")
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True, related_name="enquiries")
    customer = models.ForeignKey(User, on_delete=models.CASCADE, related_name="enquiries_as_customer")
    seller = models.ForeignKey(User, on_delete=models.CASCADE, related_name="enquiries_as_seller")
    subject = models.CharField(max_length=200, blank=True, default="")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="OPEN")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Enquiry #{self.id} ({self.status})"


class Message(models.Model):
    enquiry = models.ForeignKey(Enquiry, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_messages")
    body = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Message #{self.id} by {self.sender.username}"


class Review(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="reviews")
    customer = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("product", "customer")

    def __str__(self):
        return f"{self.product.part_name} - {self.rating}/5"


class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=150)
    message = models.TextField(blank=True)
    is_read = models.BooleanField(default=False)
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True, related_name="notifications")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class CartItem(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="cart_items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="cart_items")
    quantity = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "product")

    def __str__(self):
        return f"{self.user.username}: {self.quantity} x {self.product.part_name}"
