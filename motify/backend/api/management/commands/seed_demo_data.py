"""
Seed the database with the exact demo dataset the frontend prototype used
(4 shops, 12 parts, 4 reservations, 3 reviews, demo accounts).

Usage:
    python manage.py seed_demo_data

Safe to re-run: every row is keyed by its stable id ("s1", "p1", "rider1"...),
so the command updates instead of duplicating.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import (
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

DEMO_PASSWORD = "demo1234"

CATEGORIES = ["Engine", "Brake System", "Transmission", "Electrical", "Body Components", "Tyres/Wheels", "Accessories"]
MODELS = ["Bajaj Boxer 150", "TVS HLX 125", "Royal 125", "Haojue DK150", "Apsonic AP150"]

USERS = [
    dict(username="rider1", first="Kwame", last="Mensah", phone="024 555 1010", role=User.Role.RIDER),
    dict(username="rider2", first="Yaw", last="Antwi", phone="055 222 3030", role=User.Role.RIDER),
    dict(username="rider3", first="Ama", last="Konadu", phone="050 333 4040", role=User.Role.RIDER),
    dict(username="vendor1", first="Kofi", last="Adjei", phone="024 411 2290", role=User.Role.VENDOR),
    dict(username="vendor2", first="Efua", last="Asante", phone="020 773 4102", role=User.Role.VENDOR),
    dict(username="vendor3", first="Nana", last="Osei", phone="027 665 9012", role=User.Role.VENDOR),
    dict(username="vendor4", first="Abena", last="Frimpong", phone="026 501 7789", role=User.Role.VENDOR),
    dict(username="admin1", first="Platform", last="Admin", phone="030 000 0000", role=User.Role.ADMIN),
]

SHOPS = [
    dict(
        id="s1", owner="vendor1", name="Adjei Bike Spares", zone="Atomic Junction end",
        landmark="Near Kwabenya Roundabout, opposite Shell Station", lat=5.6875, lng=-0.2015,
        opening="07:00", closing="18:30", days="Mon-Sat", verified=True, rating=4.9, review_count=18,
        mechanic=dict(name="Yaw Boateng", phone="054 902 7731", spec="Engine & transmission"),
    ),
    dict(
        id="s2", owner="vendor2", name="Kwabenya Auto & Moto Parts", zone="Taifa border",
        landmark="Taifa-Kwabenya road, near GCB Bank", lat=5.6931, lng=-0.1988,
        opening="08:00", closing="19:00", days="Mon-Sat", verified=True, rating=4.7, review_count=12,
        mechanic=dict(name="Ibrahim Sule", phone="050 118 4423", spec="Electrical systems"),
    ),
    dict(
        id="s3", owner="vendor3", name="Roundabout Rider Depot", zone="Ashesi/Berekuso road axis",
        landmark="200m from Ashesi/Berekuso junction", lat=5.7502, lng=-0.2159,
        opening="07:30", closing="17:00", days="Mon-Sat", verified=False, rating=4.3, review_count=6,
        mechanic=dict(name="Mustapha Alhassan", phone="055 340 8871", spec="Brakes & tyres"),
    ),
    dict(
        id="s4", owner="vendor4", name="Okada Point Spares", zone="Atomic Junction end",
        landmark="Behind Kwabenya Police Station", lat=5.6858, lng=-0.2041,
        opening="06:30", closing="18:00", days="Mon-Sun", verified=True, rating=4.8, review_count=9,
        mechanic=dict(name="Yaw Boateng Jr.", phone="024 887 2210", spec="General fitting"),
    ),
]

PRODUCTS = [
    dict(id="p1", shop="s1", title="Front brake pad set", category="Brake System",
         models=["Bajaj Boxer 150", "TVS HLX 125"], price=85, stock=12,
         desc="OEM-spec sintered pads, direct fit. Sold as a pair.", days_ago=1),
    dict(id="p2", shop="s1", title="Drive chain, 428H, 120L", category="Transmission",
         models=["Bajaj Boxer 150", "Haojue DK150"], price=180, stock=6,
         desc="Heavy-duty O-ring chain, pre-stretched.", days_ago=2),
    dict(id="p3", shop="s1", title="CDI ignition unit", category="Electrical",
         models=["Bajaj Boxer 150"], price=150, stock=3,
         desc="Direct replacement CDI module, plug and play.", days_ago=4),
    dict(id="p4", shop="s2", title="Headlamp assembly", category="Electrical",
         models=["TVS HLX 125"], price=220, stock=4,
         desc="Complete headlamp housing with bulb socket.", days_ago=1),
    dict(id="p5", shop="s2", title="Rear shock absorber (pair)", category="Body Components",
         models=["TVS HLX 125", "Royal 125"], price=340, stock=5,
         desc="Adjustable preload, gas-charged.", days_ago=6),
    dict(id="p6", shop="s2", title="Spark plug (standard)", category="Engine",
         models=["TVS HLX 125", "Bajaj Boxer 150", "Royal 125"], price=20, stock=40,
         desc="Standard heat-range plug, sold individually.", days_ago=3),
    dict(id="p7", shop="s3", title="Rear tyre, 3.00-17", category="Tyres/Wheels",
         models=["Royal 125", "Bajaj Boxer 150"], price=260, stock=8,
         desc="6-ply rated, tube type, all-terrain tread.", days_ago=5),
    dict(id="p8", shop="s3", title="Brake shoe set (rear drum)", category="Brake System",
         models=["Royal 125"], price=65, stock=0,
         desc="Riveted lining, drum diameter 130mm.", days_ago=9, available=False),
    dict(id="p9", shop="s3", title="Handlebar grip set", category="Accessories",
         models=["Royal 125", "Apsonic AP150"], price=30, stock=20,
         desc="Anti-slip rubber, universal 7/8in fit.", days_ago=2),
    dict(id="p10", shop="s4", title="Engine oil, 20W-50 (1L)", category="Engine",
         models=["Bajaj Boxer 150", "TVS HLX 125", "Haojue DK150", "Royal 125", "Apsonic AP150"], price=45, stock=30,
         desc="Semi-synthetic, suitable for 4-stroke motorcycle engines.", days_ago=0),
    dict(id="p11", shop="s4", title="Clutch cable", category="Transmission",
         models=["Bajaj Boxer 150"], price=35, stock=15,
         desc="Direct-fit clutch cable, pre-lubricated.", days_ago=3),
    dict(id="p12", shop="s4", title="Side mirror pair", category="Accessories",
         models=["Bajaj Boxer 150", "TVS HLX 125", "Royal 125"], price=40, stock=18,
         desc="Universal mount, folding type.", days_ago=7),
]

RESERVATIONS = [
    dict(id="r1", rider="rider1", product="p1", shop="s1", qty=1, total=85, status="pending",
         notes="Need it before 5pm today.", hours_ago=1),
    dict(id="r2", rider="rider1", product="p10", shop="s4", qty=2, total=90, status="ready_for_pickup",
         notes="", hours_ago=24),
    dict(id="r3", rider="rider2", product="p4", shop="s2", qty=1, total=220, status="completed",
         notes="", hours_ago=72),
    dict(id="r4", rider="rider3", product="p2", shop="s1", qty=1, total=180, status="confirmed",
         notes="Calling ahead.", hours_ago=2),
]

REVIEWS = [
    dict(id="review1", shop="s1", rider="rider1", author="Kwame Mensah", rating=5,
         text="The brake pads matched my Boxer and the fitter helped me install them quickly.", hours_ago=24),
    dict(id="review2", shop="s1", rider="rider3", author="Ama Konadu", rating=5,
         text="Clear directions and the part was ready when I arrived.", hours_ago=72),
    dict(id="review3", shop="s2", rider="rider2", author="Yaw Antwi", rating=4,
         text="Good selection and helpful advice on the right plug for my bike.", hours_ago=120),
]

CONTACT_LOG = [
    dict(id="c1", shop="s1", type="call", product="Front brake pad set", rider="Kwame M.", minutes_ago=30),
    dict(id="c2", shop="s1", type="directions", product="CDI ignition unit", rider="Yaw A.", minutes_ago=83),
    dict(id="c3", shop="s1", type="call", product="Drive chain, 428H, 120L", rider="Ama K.", minutes_ago=150),
]


class Command(BaseCommand):
    help = "Seed the database with the Motify demo dataset"

    def handle(self, *args, **options):
        now = timezone.now()

        # --- users -------------------------------------------------------
        users = {}
        for row in USERS:
            user, _ = User.objects.update_or_create(
                username=row["username"],
                defaults=dict(
                    first_name=row["first"],
                    last_name=row["last"],
                    email=f"{row['username']}@motify.test",
                    phone_number=row["phone"],
                    role=row["role"],
                ),
            )
            user.set_password(DEMO_PASSWORD)
            user.is_staff = row["role"] == User.Role.ADMIN
            user.is_superuser = row["role"] == User.Role.ADMIN
            user.save()
            users[row["username"]] = user
        self.stdout.write(self.style.SUCCESS(f"Users: {len(users)}"))

        # --- categories + bike models -----------------------------------
        categories = {}
        for name in CATEGORIES:
            category, _ = Category.objects.get_or_create(category_name=name)
            categories[name] = category
        for name in MODELS:
            BikeModel.objects.get_or_create(name=name)
        self.stdout.write(self.style.SUCCESS(f"Categories: {len(categories)}, bike models: {len(MODELS)}"))

        # --- shops + fitters --------------------------------------------
        shops = {}
        for row in SHOPS:
            shop, _ = Shop.objects.update_or_create(
                pk=row["id"],
                defaults=dict(
                    owner=users[row["owner"]],
                    shop_name=row["name"],
                    landmark_address=row["landmark"],
                    latitude=row["lat"],
                    longitude=row["lng"],
                    opening_time=row["opening"],
                    closing_time=row["closing"],
                    days=row["days"],
                    zone=row["zone"],
                    verified=row["verified"],
                    rating=row["rating"],
                    review_count=row["review_count"],
                ),
            )
            shops[row["id"]] = shop
            mech = row["mechanic"]
            Mechanic.objects.update_or_create(
                shop=shop,
                full_name=mech["name"],
                defaults=dict(
                    phone_number=mech["phone"],
                    specialization=mech["spec"],
                    is_on_duty=True,
                ),
            )
        self.stdout.write(self.style.SUCCESS(f"Shops: {len(shops)}"))

        # --- products ----------------------------------------------------
        for row in PRODUCTS:
            product, _ = Product.objects.update_or_create(
                pk=row["id"],
                defaults=dict(
                    shop=shops[row["shop"]],
                    category=categories[row["category"]],
                    part_name=row["title"],
                    description=row["desc"],
                    compatible_models=", ".join(row["models"]),
                    price=row["price"],
                    stock_quantity=row["stock"],
                    available=row.get("available", True),
                ),
            )
            # auto_now ignores assigned values, so stamp freshness directly.
            Product.objects.filter(pk=product.pk).update(last_updated=now - timedelta(days=row["days_ago"]))
        self.stdout.write(self.style.SUCCESS(f"Products: {len(PRODUCTS)}"))

        # --- reservations ------------------------------------------------
        for row in RESERVATIONS:
            reservation, _ = Reservation.objects.update_or_create(
                pk=row["id"],
                defaults=dict(
                    rider=users[row["rider"]],
                    product=Product.objects.get(pk=row["product"]),
                    shop=shops[row["shop"]],
                    qty=row["qty"],
                    total=row["total"],
                    status=row["status"],
                    notes=row["notes"],
                ),
            )
            Reservation.objects.filter(pk=reservation.pk).update(
                created_at=now - timedelta(hours=row["hours_ago"])
            )
        self.stdout.write(self.style.SUCCESS(f"Reservations: {len(RESERVATIONS)}"))

        # --- reviews -----------------------------------------------------
        for row in REVIEWS:
            review, _ = Review.objects.update_or_create(
                pk=row["id"],
                defaults=dict(
                    shop=shops[row["shop"]],
                    rider=users[row["rider"]],
                    author=row["author"],
                    rating=row["rating"],
                    text=row["text"],
                ),
            )
            Review.objects.filter(pk=review.pk).update(created_at=now - timedelta(hours=row["hours_ago"]))

        # Keep the frontend's showcase rating numbers after seeding.
        for row in SHOPS:
            Shop.objects.filter(pk=row["id"]).update(rating=row["rating"], review_count=row["review_count"])
        self.stdout.write(self.style.SUCCESS(f"Reviews: {len(REVIEWS)}"))

        # --- contact log --------------------------------------------------
        for row in CONTACT_LOG:
            log, _ = ContactLog.objects.update_or_create(
                pk=row["id"],
                defaults=dict(
                    shop=shops[row["shop"]],
                    type=row["type"],
                    product_title=row["product"],
                    rider_name=row["rider"],
                ),
            )
            ContactLog.objects.filter(pk=log.pk).update(
                created_at=now - timedelta(minutes=row["minutes_ago"])
            )
        self.stdout.write(self.style.SUCCESS(f"Contact log entries: {len(CONTACT_LOG)}"))

        # --- favorites + garage -----------------------------------------
        Favorite.objects.get_or_create(user=users["rider1"], shop=shops["s1"])
        Favorite.objects.get_or_create(user=users["rider1"], shop=shops["s4"])
        Vehicle.objects.update_or_create(
            user=users["rider1"],
            model="Bajaj Boxer 150",
            defaults=dict(make="Bajaj", year=2021, cc=150),
        )

        self.stdout.write(self.style.SUCCESS("Done."))
        self.stdout.write(
            self.style.SUCCESS(
                f"Demo logins: rider1 / vendor1 / admin1 — password: {DEMO_PASSWORD}"
            )
        )
