from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from .models import Shop, Product, Category, Notification

User = get_user_model()


class SellerVerificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="admin_test", password="pass1234", role=User.Role.ADMIN,
            phone_number="0240000099", is_staff=True, verification_status=User.VerificationStatus.APPROVED,
        )
        self.pending_seller = User.objects.create_user(
            username="pending_seller", password="pass1234", role=User.Role.SELLER,
            phone_number="0240000100", verification_status=User.VerificationStatus.PENDING,
        )
        self.approved_seller = User.objects.create_user(
            username="approved_seller", password="pass1234", role=User.Role.SELLER,
            phone_number="0240000101", verification_status=User.VerificationStatus.APPROVED,
        )
        self.rejected_seller = User.objects.create_user(
            username="rejected_seller", password="pass1234", role=User.Role.SELLER,
            phone_number="0240000102", verification_status=User.VerificationStatus.REJECTED,
            rejection_reason="Incomplete documents",
        )
        self.customer = User.objects.create_user(
            username="customer_test", password="pass1234", role=User.Role.RIDER,
            phone_number="0240000103", verification_status=User.VerificationStatus.APPROVED,
        )
        self.category = Category.objects.create(category_name="Engine Components")
        self.approved_shop = Shop.objects.create(
            owner=self.approved_seller, shop_name="Approved Shop",
            landmark_address="Somewhere", latitude=5.0, longitude=-0.2,
            opening_time="07:00", closing_time="19:00",
        )
        self.pending_shop = Shop.objects.create(
            owner=self.pending_seller, shop_name="Pending Shop",
            landmark_address="Somewhere", latitude=5.0, longitude=-0.2,
            opening_time="07:00", closing_time="19:00",
        )

    def _token(self, user):
        from rest_framework.authtoken.models import Token
        token, _ = Token.objects.get_or_create(user=user)
        return token.key

    def test_pending_seller_cannot_create_product(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.pending_seller)}")
        res = self.client.post("/api/products/", {
            "shop_id": self.pending_shop.id, "category_id": self.category.id,
            "part_name": "Test Part", "price": 10, "stock_quantity": 1,
            "compatible_models": "Universal",
        })
        self.assertEqual(res.status_code, 403)

    def test_rejected_seller_cannot_create_product(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.rejected_seller)}")
        shop = Shop.objects.create(owner=self.rejected_seller, shop_name="Rejected Shop",
                                    landmark_address="X", latitude=5.0, longitude=-0.2,
                                    opening_time="07:00", closing_time="19:00")
        res = self.client.post("/api/products/", {
            "shop_id": shop.id, "category_id": self.category.id,
            "part_name": "Test Part", "price": 10, "stock_quantity": 1,
            "compatible_models": "Universal",
        })
        self.assertEqual(res.status_code, 403)

    def test_approved_seller_can_create_product(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.approved_seller)}")
        res = self.client.post("/api/products/", {
            "shop_id": self.approved_shop.id, "category_id": self.category.id,
            "part_name": "Test Part", "price": 10, "stock_quantity": 1,
            "compatible_models": "Universal",
        })
        self.assertEqual(res.status_code, 201)

    def test_customer_cannot_call_admin_seller_endpoints(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.customer)}")
        res = self.client.get("/api/admin/sellers/")
        self.assertEqual(res.status_code, 403)
        res = self.client.post(f"/api/admin/sellers/{self.pending_seller.id}/approve/")
        self.assertEqual(res.status_code, 403)
        res = self.client.post(f"/api/admin/sellers/{self.pending_seller.id}/reject/", {"reason": "no"})
        self.assertEqual(res.status_code, 403)

    def test_approve_notifies_seller(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.admin)}")
        n_before = Notification.objects.filter(user=self.pending_seller).count()
        res = self.client.post(f"/api/admin/sellers/{self.pending_seller.id}/approve/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["verification_status"], "APPROVED")
        self.assertEqual(Notification.objects.filter(user=self.pending_seller).count(), n_before + 1)

    def test_reject_requires_reason(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.admin)}")
        res = self.client.post(f"/api/admin/sellers/{self.pending_seller.id}/reject/", {})
        self.assertEqual(res.status_code, 400)

    def test_reject_notifies_seller(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.admin)}")
        n_before = Notification.objects.filter(user=self.pending_seller).count()
        res = self.client.post(f"/api/admin/sellers/{self.pending_seller.id}/reject/", {"reason": "Missing docs"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["verification_status"], "REJECTED")
        self.assertEqual(Notification.objects.filter(user=self.pending_seller).count(), n_before + 1)

    def test_approve_idempotent_no_duplicate_notification(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.admin)}")
        self.client.post(f"/api/admin/sellers/{self.pending_seller.id}/approve/")
        n_after = Notification.objects.filter(user=self.pending_seller).count()
        res = self.client.post(f"/api/admin/sellers/{self.pending_seller.id}/approve/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Notification.objects.filter(user=self.pending_seller).count(), n_after)

    def test_reject_idempotent_no_duplicate_notification(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.admin)}")
        self.client.post(f"/api/admin/sellers/{self.pending_seller.id}/reject/", {"reason": "Missing docs"})
        n_after = Notification.objects.filter(user=self.pending_seller).count()
        res = self.client.post(f"/api/admin/sellers/{self.pending_seller.id}/reject/", {"reason": "Missing docs"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Notification.objects.filter(user=self.pending_seller).count(), n_after)

    def test_unknown_seller_returns_404(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.admin)}")
        res = self.client.post("/api/admin/sellers/99999/approve/")
        self.assertEqual(res.status_code, 404)
        res = self.client.post("/api/admin/sellers/99999/reject/", {"reason": "x"})
        self.assertEqual(res.status_code, 404)

    def test_non_seller_cannot_be_approved(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.admin)}")
        res = self.client.post(f"/api/admin/sellers/{self.customer.id}/approve/")
        self.assertEqual(res.status_code, 404)

    def test_pending_seller_products_hidden_from_customers(self):
        Product.objects.create(shop=self.pending_shop, category=self.category, part_name="Pending Part", price=10, stock_quantity=1)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.customer)}")
        res = self.client.get("/api/products/")
        names = [p["part_name"] for p in res.data.get("results", res.data)]
        self.assertNotIn("Pending Part", names)

    def test_approved_seller_products_visible_to_customers(self):
        Product.objects.create(shop=self.approved_shop, category=self.category, part_name="Approved Part", price=10, stock_quantity=1)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.customer)}")
        res = self.client.get("/api/products/")
        names = [p["part_name"] for p in res.data.get("results", res.data)]
        self.assertIn("Approved Part", names)

    def test_pending_seller_shops_hidden_from_customers(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self._token(self.customer)}")
        res = self.client.get("/api/shops/")
        names = [s["shop_name"] for s in res.data.get("results", res.data)]
        self.assertNotIn("Pending Shop", names)
        self.assertIn("Approved Shop", names)