#!/usr/bin/env python
"""
Django's command-line utility. Every management command runs through this
file — e.g. `python manage.py runserver`, `python manage.py migrate`,
`python manage.py seed_demo_data` (the custom command defined in
api/management/commands/seed_demo_data.py).
"""
import os
import sys


def main():
    # Point Django at this project's settings before doing anything else.
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        # Imported here (not at the top of the file) so the except block
        # below can catch the case where Django itself isn't installed yet
        # and give a helpful message instead of a raw traceback.
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    # Runs whatever command was typed after "manage.py" (sys.argv is the
    # full command line, e.g. ["manage.py", "migrate"]).
    execute_from_command_line(sys.argv)


# Only runs main() when this file is executed directly (`python manage.py
# ...`), not if it's ever imported from somewhere else.
if __name__ == "__main__":
    main()
