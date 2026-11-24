"""Exact V5 image decoding, validation, and preprocessing utilities."""

from __future__ import annotations

import io
from PIL import Image, ImageOps, UnidentifiedImageError
from torchvision import transforms as T

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG"}


class ImageValidationError(ValueError):
    """Raised when an uploaded image fails format, size, or integrity checks."""

    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def decode_and_validate_image(
    data: bytes,
    *,
    max_upload_bytes: int,
    max_decoded_pixels: int,
) -> Image.Image:
    """Safely decode JPEG/PNG bytes, validate dimensions, and apply EXIF orientation."""
    if not data:
        raise ImageValidationError("EMPTY_IMAGE", "Uploaded image file is empty.", status_code=422)
    if len(data) > max_upload_bytes:
        raise ImageValidationError(
            "PAYLOAD_TOO_LARGE",
            f"Image exceeds maximum allowed size of {max_upload_bytes} bytes.",
            status_code=413,
        )

    previous_max_pixels = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = max_decoded_pixels
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = (probe.format or "").upper()
            if fmt not in ALLOWED_IMAGE_FORMATS:
                raise ImageValidationError(
                    "UNSUPPORTED_MEDIA_TYPE",
                    f"Unsupported image format '{fmt or 'UNKNOWN'}'. Only JPEG and PNG are supported.",
                    status_code=415,
                )
            if probe.width <= 0 or probe.height <= 0:
                raise ImageValidationError("INVALID_IMAGE", "Image has zero dimensions.", status_code=422)
            if probe.width * probe.height > max_decoded_pixels:
                raise ImageValidationError(
                    "IMAGE_DIMENSIONS_TOO_LARGE",
                    f"Decoded image exceeds {max_decoded_pixels} pixels.",
                    status_code=422,
                )
            probe.verify()

        with Image.open(io.BytesIO(data)) as raw:
            transposed = ImageOps.exif_transpose(raw)
            if transposed.width * transposed.height > max_decoded_pixels:
                raise ImageValidationError(
                    "IMAGE_DIMENSIONS_TOO_LARGE",
                    f"Decoded image exceeds {max_decoded_pixels} pixels.",
                    status_code=422,
                )
            return transposed.convert("RGB")
    except ImageValidationError:
        raise
    except Image.DecompressionBombError as err:
        raise ImageValidationError(
            "IMAGE_DIMENSIONS_TOO_LARGE",
            f"Decoded image exceeds {max_decoded_pixels} pixels.",
            status_code=422,
        ) from err
    except Exception as err:
        raise ImageValidationError(
            "INVALID_IMAGE",
            "Image could not be decoded as a valid JPEG or PNG.",
            status_code=422,
        ) from err
    finally:
        Image.MAX_IMAGE_PIXELS = previous_max_pixels


def prepare_fer_face_image(cropped_face: Image.Image) -> Image.Image:
    """Match FER2013 48x48 grayscale training distribution before ImageNet normalization."""
    return ImageOps.grayscale(cropped_face).resize((48, 48), Image.Resampling.BILINEAR).convert("RGB")


def build_member_transform(image_size: int, mean: list[float] | tuple[float, ...], std: list[float] | tuple[float, ...]) -> T.Compose:
    """Build exact per-member torchvision transform matching V5 inference.py."""
    return T.Compose(
        [
            T.Resize((image_size, image_size)),
            T.ToTensor(),
            T.Normalize(mean=list(mean), std=list(std)),
        ]
    )
