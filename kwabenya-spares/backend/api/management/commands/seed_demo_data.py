"""
Seeds the database with the same demo shops / mechanics / products used in
the frontend's mock data, so the real API returns matching results once you
wire the frontend up to it.

Usage: python manage.py seed_demo_data
"""
from django.core.management.base import BaseCommand
from api.models import (
    User, Shop, Mechanic, Category, Product,
    Order, OrderItem, Review, Notification,
)

# CATEGORIES: the same 8 category names as CATEGORIES in the frontend's
# App.jsx — kept in this exact order so the two data sets line up.
CATEGORIES = [
    "Engine Components", "Braking System", "Electricals", "Tires & Rims",
    "Suspension", "Body & Frame", "Lighting", "Filters & Fluids",
]

# SHOPS: one dict per shop, matching SHOPS_INIT in the frontend field for
# field. Kept as a list of dicts (rather than Shop objects directly) so the
# data is easy to read/edit before it gets turned into real database rows
# in Command.handle() below.
#   username    — login username generated for this shop's owner account
#   shop_name / owner_name / phone / landmark / lat / lng / open_t / close_t
#               — same meaning as the matching SHOPS_INIT fields in App.jsx
#   mech        — a tuple of (full_name, phone, specialization, years_experience, is_on_duty)
#               for this shop's one assigned fitter
SHOPS = [
    dict(username="kwame_owusu", shop_name="Kwabenya Roundabout Motor Spares", owner_name="Kwame Owusu",
         phone="0244112287", landmark="Kwabenya Roundabout, opposite Shell filling station",
         lat=5.6792, lng=-0.2311, open_t="07:00", close_t="19:00",
         mech=("Yaw Boateng", "0205551190", "Engine Overhaul, Carburetor Tuning", 6, True)),
    dict(username="abena_sarpong", shop_name="Ayi Mensah Bike Parts & Fitting", owner_name="Abena Sarpong",
         phone="0542209981", landmark="Ayi Mensah junction, near the GIMPA road",
         lat=5.6647, lng=-0.2038, open_t="07:30", close_t="18:30",
         mech=("Kojo Mensah", "0267713345", "Brake & Clutch Calibration", 4, False)),
    dict(username="fred_armah", shop_name="Atomic Junction Cycle Center", owner_name="Fred Nii Armah",
         phone="0509034471", landmark="Atomic Junction, near the Total filling station",
         lat=5.6721, lng=-0.2199, open_t="06:30", close_t="20:00",
         mech=("Emmanuel Tetteh", "0592148802", "Electricals, Wiring & Battery Systems", 8, True)),
    dict(username="comfort_adjei", shop_name="Haatso-Kwabenya Road Spares", owner_name="Comfort Adjei",
         phone="0276621183", landmark="Haatso-Kwabenya road, opposite Blue Bird Estate",
         lat=5.6755, lng=-0.2265, open_t="08:00", close_t="18:00",
         mech=("Isaac Owusu-Ansah", "0243307762", "Tire & Rim Alignment, Suspension", 3, True)),
    dict(username="nii_lamptey", shop_name="Commandos Junction Parts Depot", owner_name="Nii Odartey Lamptey",
         phone="0551184420", landmark="Commandos junction, Kwabenya",
         lat=5.6811, lng=-0.2340, open_t="07:00", close_t="18:00",
         mech=("Prince Asante", "0208876621", "Engine Overhaul, Body & Frame Repair", 10, False)),
    dict(username="linda_asiedu", shop_name="Ogbojo Road Motor Spares", owner_name="Linda Asiedu",
         phone="0594421076", landmark="Ogbojo road, near the Kwabenya SDA church",
         lat=5.6698, lng=-0.2158, open_t="07:00", close_t="19:00",
         mech=("Solomon Tetteh", "0265509934", "Lighting & Electricals, Filters & Fluids", 5, True)),
]

# PRODUCTS: one tuple per part, in the same 6-field shape:
#   (shop_index, category_name, part_name, description, compatible_models, price, stock, image_url)
# shop_index is a position into the SHOPS list above (0 = first shop, etc)
# — resolved into a real Shop object inside Command.handle() below. Matches
# PRODUCTS_INIT in App.jsx product-for-product.
PRODUCTS = [
    (0, "Engine Components", "Piston Kit, Standard Bore", "Complete piston, rings and gudgeon pin set.", "Bajaj Boxer BM150, Bajaj Boxer CT100", 185, 12, "piston-kit-standard-bore.jfif"),
    (0, "Engine Components", "Carburetor Assembly", "Full carburetor assembly, jets pre-set.", "TVS HLX 125", 220, 7, "carburetor-assembly.jfif"),
    (0, "Filters & Fluids", "Air Filter Element", "Foam air filter, cleans and re-oils for reuse.", "TVS HLX 125", 28, 33, "air-filter-element.jfif"),
    (1, "Braking System", "Front Brake Disc Rotor 220mm", "Universal 220mm floating disc rotor.", "Bajaj Boxer, TVS HLX, Haojue HJ125", 95, 20, "front-brake-disc-rotor-220mm.jfif"),
    (1, "Braking System", "Brake Lever Set", "Forged alloy lever pair, direct bolt-on fit.", "Universal fit", 45, 30, "brake-lever-set.jfif"),
    (1, "Braking System", "Clutch Cable", "Braided steel clutch cable.", "Haojue DK150", 30, 40, "clutch-cable.jfif"),
    (2, "Electricals", "12V Motorcycle Battery", "Maintenance-free sealed 12V battery.", "Universal 12V systems", 260, 15, "12v-motorcycle-battery.jfif"),
    (2, "Electricals", "Wiring Harness, Full Loom", "Complete replacement wiring loom.", "Bajaj Boxer BM150", 150, 5, "wiring-harness-full-loom.jfif"),
    (2, "Electricals", "CDI Ignition Unit", "Capacitor discharge ignition module.", "TVS Star City", 175, 9, "cdi-ignition-unit.jfif"),
    (3, "Tires & Rims", "Tubeless Tyre 90/90-18 Rear", "Reinforced tread tubeless rear tyre.", "Universal fit", 210, 22, "tubeless-tyre-90-90-18-rear.jfif"),
    (3, "Tires & Rims", "Alloy Rim, Front 17\"", "Lightweight cast alloy front rim.", "Universal fit", 340, 6, "alloy-rim-front-17.jfif"),
    (3, "Suspension", "Front Fork Suspension Set", "Matched pair with fresh oil seals.", "Bajaj Boxer BM150, Haojue HJ125", 480, 4, "front-fork-suspension-set.jfif"),
    (3, "Suspension", "Rear Shock Absorber Pair", "Adjustable preload rear shocks.", "Universal fit", 260, 10, "rear-shock-absorber-pair.jfif"),
    (4, "Body & Frame", "Fuel Tank, Steel", "Powder-coated steel fuel tank.", "Bajaj Boxer BM150", 390, 3, "fuel-tank-steel.jfif"),
    (4, "Body & Frame", "Side Mirror Pair", "Folding side mirrors, standard thread.", "Universal fit", 40, 60, "side-mirror-pair.jfif"),
    (4, "Body & Frame", "Padded Seat Cover", "Weatherproof padded seat cover.", "Universal fit", 55, 25, "padded-seat-cover.jfif"),
    (5, "Lighting", "Turn Signal Indicator Set", "Set of four amber indicators.", "Universal fit", 48, 35, "turn-signal-indicator-set.jfif"),
    (5, "Filters & Fluids", "Engine Oil 20W-50, 1L", "Mineral engine oil.", "Universal fit", 38, 100, "engine-oil-20w-50-1l.jfif"),
    (5, "Filters & Fluids", "Oil Filter", "Genuine-spec oil filter.", "Haojue HJ125", 22, 45, "oil-filter.jfif"),
    (5, "Lighting", "LED Headlight Bulb H4", "Bright white LED headlight bulb.", "Universal fit", 65, 50, "led-headlight-bulb-h4.jfif"),
]


class Command(BaseCommand):
    # help: the description shown by `python manage.py help seed_demo_data`.
    help = "Seed the database with demo Kwabenya Spares data"

    # handle: the method Django actually calls when this command runs.
    # *args/**options catch any command-line arguments (this command
    # doesn't define any of its own, so both are unused here).
    def handle(self, *args, **options):
        # --- Step 1: categories ---------------------------------------
        cats = {}  # maps category name -> the real Category row, for quick lookup while creating products below
        for name in CATEGORIES:
            # get_or_create: creates the row only if a category with this
            # name doesn't already exist — makes the whole command safely
            # re-runnable without creating duplicates.
            cat, _ = Category.objects.get_or_create(category_name=name)
            cats[name] = cat
        self.stdout.write(self.style.SUCCESS(f"Categories: {len(cats)}"))  # progress message, printed in green in the terminal

        # --- Step 2: shops, owner accounts, and mechanics ----------------
        shops = []  # will hold the real Shop rows in the same order as the SHOPS list, so PRODUCTS' shop_index can look them up positionally
        for s in SHOPS:
            # Split "Kwame Owusu" into first="Kwame", rest=["Owusu"] for
            # Django's separate first_name/last_name fields.
            first, *rest = s["owner_name"].split(" ")
            owner, _ = User.objects.get_or_create(
                username=s["username"],
                defaults=dict(first_name=first, last_name=" ".join(rest), phone_number=s["phone"], role=User.Role.SELLER),
            )
            # set_password hashes the password properly (User.objects.create
            # would otherwise store it in plain text) — every demo account
            # shares the same known password so you can log into the admin as any of them.
            owner.set_password("demo-password-123")
            owner.save()

            # update_or_create: creates the shop if it doesn't exist yet,
            # or updates these fields if it does (e.g. re-running the
            # command after changing a shop's hours in this file above).
            shop, _ = Shop.objects.update_or_create(
                owner=owner,
                defaults=dict(
                    shop_name=s["shop_name"], landmark_address=s["landmark"],
                    latitude=s["lat"], longitude=s["lng"],
                    opening_time=s["open_t"], closing_time=s["close_t"],
                    is_open_override=True,
                ),
            )
            # Unpack the mechanic tuple into named variables for readability.
            mech_name, mech_phone, spec, years, on_duty = s["mech"]
            mfirst, *mrest = mech_name.split(" ")
            # Give the mechanic their own separate login account too
            # (username suffixed "_mechanic" so it can't collide with the
            # shop owner's username).
            mech_user, _ = User.objects.get_or_create(
                username=f"{s['username']}_mechanic",
                defaults=dict(first_name=mfirst, last_name=" ".join(mrest), phone_number=mech_phone, role=User.Role.MECHANIC),
            )
            mech_user.set_password("demo-password-123")
            mech_user.save()

            Mechanic.objects.update_or_create(
                user=mech_user,
                defaults=dict(shop=shop, full_name=mech_name, phone_number=mech_phone,
                               specialization=spec, years_experience=years, is_on_duty=on_duty),
            )
            shops.append(shop)  # remember this shop for the products loop below, at the same index as it appears in SHOPS

        self.stdout.write(self.style.SUCCESS(f"Shops + mechanics: {len(shops)}"))

        # --- Step 3: products -------------------------------------------
        created = 0  # counts how many NEW products this run actually created (vs. ones that already existed)
        for shop_idx, cat_name, part_name, desc, models_str, price, stock, image_name in PRODUCTS:
            product, was_created = Product.objects.get_or_create(
                shop=shops[shop_idx],  # look up the real Shop object by position, matching the frontend's shop_id grouping
                part_name=part_name,
                defaults=dict(category=cats[cat_name], description=desc,
                               compatible_models=models_str, price=price, stock_quantity=stock,
                               image_url=image_name),
            )
            if product.image_url != image_name:
                product.image_url = image_name
                product.save(update_fields=["image_url"])
            created += was_created  # was_created is a bool; True adds 1, False adds 0

        self.stdout.write(self.style.SUCCESS(f"Products created: {created} (of {len(PRODUCTS)} total in seed list)"))

        # --- Step 4: demo customer + admin accounts ---------------------
        rider, _ = User.objects.get_or_create(
            username="rider_demo",
            defaults=dict(first_name="Ama", last_name="Mensah", phone_number="0240000001", role=User.Role.RIDER),
        )
        rider.set_password("demo-password-123")
        rider.save()

        admin_user, _ = User.objects.get_or_create(
            username="admin_demo",
            defaults=dict(first_name="Platform", last_name="Admin", phone_number="0240000002", role=User.Role.ADMIN, is_staff=True, is_superuser=True),
        )
        admin_user.set_password("demo-password-123")
        admin_user.save()

        # --- Step 5: sample order + notifications -----------------------
        first_product = Product.objects.filter(shop=shops[0]).first()
        if first_product and not Order.objects.filter(customer=rider).exists():
            order = Order.objects.create(
                customer=rider, shop=shops[0], status=Order.Status.CONFIRMED,
                payment_method=Order.Payment.MOMO, total=first_product.price,
                contact_name="Ama Mensah", contact_phone="0240000001",
                momo_number="0240000001", notes="Please keep it aside for pickup.",
            )
            OrderItem.objects.create(
                order=order, product=first_product, quantity=1, unit_price=first_product.price,
            )
            Notification.objects.create(
                user=rider, order=order, title="Order confirmed",
                message=f"Your order #{order.pk} at {shops[0].shop_name} is confirmed.",
            )
            Notification.objects.create(
                user=shops[0].owner, order=order, title="New order",
                message=f"New order #{order.pk} from {rider.username}.",
            )

        # --- Step 6: sample reviews -------------------------------------
        review_seed = [
            (0, 5, "Genuine part, fitted perfectly on my Boxer. Fast service too."),
            (1, 4, "Good brake feel after fitting. Shop was easy to find."),
            (2, 5, "Battery has been strong for weeks. Recommended."),
        ]
        for shop_idx, rating, comment in review_seed:
            product = Product.objects.filter(shop=shops[shop_idx]).first()
            if product:
                Review.objects.get_or_create(
                    product=product, customer=rider,
                    defaults=dict(rating=rating, comment=comment),
                )

        self.stdout.write(self.style.SUCCESS("Demo accounts: rider_demo / admin_demo / seller usernames"))
        self.stdout.write(self.style.SUCCESS("Demo password for every account: demo-password-123"))
        self.stdout.write(self.style.SUCCESS("Done."))
