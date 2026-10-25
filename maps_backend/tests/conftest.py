import hashlib
from pathlib import Path

import pycurl
import pytest

from app.photo_safety import MODEL_SHA256, MODEL_URL

MODELS_DIR = Path(__file__).parent / "models"


@pytest.fixture(scope="session")
def safety_model() -> Path:
    """The photo safety model, downloaded once (the Dockerfile bakes it into the image)."""
    path = MODELS_DIR / "image-safety-classifier-xs.onnx"
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != MODEL_SHA256:
        MODELS_DIR.mkdir(exist_ok=True)
        partial = path.with_suffix(".part")
        with open(partial, "wb") as out:
            curl = pycurl.Curl()
            curl.setopt(pycurl.URL, MODEL_URL)
            curl.setopt(pycurl.FOLLOWLOCATION, True)
            curl.setopt(pycurl.WRITEDATA, out)
            curl.perform()
            curl.close()
        assert hashlib.sha256(partial.read_bytes()).hexdigest() == MODEL_SHA256
        partial.replace(path)
    return path
