"""Service for uploading files to Cloudinary"""

import logging
import cloudinary
import cloudinary.uploader
from app.config import CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

logger = logging.getLogger(__name__)


def init_cloudinary():
    """Initialize Cloudinary configuration"""
    if not all([CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET]):
        logger.warning("Cloudinary credentials not configured")
        return False
    
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET
    )
    logger.info("Cloudinary initialized successfully")
    return True


def upload_pdf_to_cloudinary(file_path: str, file_name: str) -> dict:
    """
    Upload a PDF file to Cloudinary and ensure it's viewable in-browser.
    """
    try:
        # The public_id should be the unique identifier without the extension.
        # The full filename including the extension is specified in the public_id
        # for the upload call to ensure the correct Content-Type.
        public_id_with_ext = f"{file_name}.pdf"

        result = cloudinary.uploader.upload(
            file_path,
            resource_type="raw",  
            public_id=public_id_with_ext,
            folder="interview_reports",
            overwrite=True
        )
        
        secure_url = result.get("secure_url")
        logger.info(f"✅ Successfully uploaded to Cloudinary: {secure_url}")
        
        return {
            "success": True,
            "secure_url": secure_url,
            "public_id": result.get("public_id")
        }
    except Exception as e:
        logger.error(f"Failed to upload {file_name}: {e}")
        return {"success": False, "error": str(e)}


def delete_pdf_from_cloudinary(public_id: str) -> bool:
    """
    Delete a PDF file from Cloudinary
    
    Args:
        public_id: Public ID of the file in Cloudinary
    
    Returns:
        True if successful, False otherwise
    """
    try:
        result = cloudinary.uploader.destroy(
            public_id,
            resource_type="raw"
        )
        if result.get("result") == "ok":
            logger.info(f"Successfully deleted {public_id} from Cloudinary")
            return True
        logger.warning(f"Failed to delete {public_id}: {result}")
        return False
    except Exception as e:
        logger.error(f"Error deleting {public_id} from Cloudinary: {e}")
        return False
