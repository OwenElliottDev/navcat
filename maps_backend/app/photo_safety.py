"""Spotting photos that aren't safe to share, with a small image classifier run on the CPU.

The model (OwenElliott/image-safety-classifier-xs on Hugging Face) is baked into the backend
image by its Dockerfile, so nothing is downloaded at runtime.
"""

from collections.abc import Sequence
from functools import cache

import numpy as np
import onnxruntime as ort
from PIL import Image

from .config import settings

# Also in the Dockerfile, which downloads it
MODEL_URL = (
    "https://huggingface.co/OwenElliott/image-safety-classifier-xs/resolve/"
    "54f4560bd9c5ee92d45dc30418a8f8680e80de6d/onnx/image-safety-classifier-xs.onnx"
)
MODEL_SHA256 = "8c28c49d9075f3ad15ebdc2961f02d5b3f99be944815b848b49c9f0e6f3fb689"

INPUT_SIZE = 224
# Rejected only when the model is this sure a photo is NSFL or NSFW
REJECT_ABOVE = 0.9


@cache
def _session() -> ort.InferenceSession:
    # Uploads each run on a threadpool thread; one thread apiece is plenty for a model this small
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    return ort.InferenceSession(
        settings.photo_safety_model, options, providers=["CPUExecutionProvider"]
    )


def load() -> None:
    """Loads the model now, so a missing one stops the server starting."""
    _session()


def classify(image: Image.Image) -> Sequence[float]:
    """The model's NSFL, NSFW and SFW probabilities for an RGB image."""
    # Normalisation and softmax are part of the model: it takes 0-255 pixels
    small = image.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR)
    pixels = np.asarray(small, dtype=np.float32).transpose(2, 0, 1)[np.newaxis]
    (probabilities,) = _session().run(None, {"image": pixels})
    return [float(p) for p in np.asarray(probabilities)[0]]


def is_unsafe(probabilities: Sequence[float]) -> bool:
    nsfl, nsfw, _sfw = probabilities
    return nsfl > REJECT_ABOVE or nsfw > REJECT_ABOVE
