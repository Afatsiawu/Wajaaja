"""Django app configuration for the `api` app."""
from django.apps import AppConfig


class ApiConfig(AppConfig):
    # BigAutoField: use a 64-bit integer for every model's auto-generated
    # `id` primary key in this app (Django's modern default; explicit here
    # to avoid a startup warning on older Django versions).
    default_auto_field = "django.db.models.BigAutoField"
    # Must match the app's directory name / the string used in
    # INSTALLED_APPS in settings.py.
    name = "api"
