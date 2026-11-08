"""
WSGI entrypoint — the standard interface a production web server (like
gunicorn, which is what backend/README.md's deploy instructions use) talks
to in order to run this Django project.
"""
import os
from django.core.wsgi import get_wsgi_application

# Tells Django which settings module to load (config/settings.py) before
# anything else happens — has to be set before get_wsgi_application() runs.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
# `application` is the specific name gunicorn/WSGI servers look for by
# convention — this is the object that actually handles every request.
application = get_wsgi_application()
