"""PyInstaller runtime hook: ensure pyiceberg config doesn't crash on missing dirs."""
import os
import tempfile

# pyiceberg.utils.config tries os.path.expanduser("~") and os.getcwd()
# which can fail inside a PyInstaller frozen bundle. Set a safe fallback.
if not os.environ.get("PYICEBERG_HOME"):
    os.environ["PYICEBERG_HOME"] = tempfile.gettempdir()
