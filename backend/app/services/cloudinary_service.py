import cloudinary
import cloudinary.uploader

from app.core.config import settings


def _configure() -> None:
    if not settings.CLOUDINARY_CLOUD_NAME:
        raise RuntimeError("CLOUDINARY_CLOUD_NAME is not configured in .env")
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


def upload_pdf(file_bytes: bytes, filename: str, classroom_id: str) -> dict:
    """Upload a PDF to Cloudinary and return {public_id, secure_url, bytes}."""
    _configure()
    result = cloudinary.uploader.upload(
        file_bytes,
        resource_type="raw",  # non-image asset (PDF)
        folder=f"english-teacher/classrooms/{classroom_id}",
        public_id=filename.rsplit(".", 1)[0],
        unique_filename=True,
        overwrite=False,
    )
    return {
        "public_id": result["public_id"],
        "secure_url": result["secure_url"],
        "bytes": result.get("bytes"),
    }


def delete_pdf(public_id: str) -> None:
    _configure()
    cloudinary.uploader.destroy(public_id, resource_type="raw")
