import datetime
import logging
from google.cloud import storage
from google.auth.exceptions import DefaultCredentialsError

from app.config import GCP_REPORTS_BUCKET, GCP_PROJECT_ID

logger = logging.getLogger(__name__)

def _get_client() -> storage.Client | None:
    if not GCP_REPORTS_BUCKET:
        return None
    try:
        if GCP_PROJECT_ID:
            return storage.Client(project=GCP_PROJECT_ID)
        return storage.Client()
    except DefaultCredentialsError as e:
        logger.error("GCS Authentication failed. Are ADC configured correctly? %s", e)
        return None
    except Exception as e:
        logger.error("Failed to initialize GCS client: %s", e)
        return None

def upload_pdf_to_gcs(interview_id: str, pdf_bytes: bytes) -> str | None:
    """
    Uploads a generated PDF to Google Cloud Storage and returns the object name (or None if failed/disabled).
    """
    client = _get_client()
    if not client or not GCP_REPORTS_BUCKET:
        logger.warning("GCS is not configured or authenticated. Skipping upload.")
        return None

    try:
        bucket = client.bucket(GCP_REPORTS_BUCKET)
        # Store all reports under a specific prefix to keep it organized
        blob_name = f"reports/{interview_id}-report.pdf"
        blob = bucket.blob(blob_name)
        
        logger.info("Uploading report for %s to GCS bucket %s", interview_id, GCP_REPORTS_BUCKET)
        blob.upload_from_string(pdf_bytes, content_type="application/pdf")
        return blob_name
    except Exception as e:
        logger.error("Error uploading to GCS for %s: %s", interview_id, e)
        return None

def download_pdf_from_gcs(blob_name: str) -> bytes | None:
    """
    Downloads a PDF from Google Cloud Storage directly into memory.
    Useful when using Application Default Credentials which cannot easily generate signed URLs.
    """
    client = _get_client()
    if not client or not GCP_REPORTS_BUCKET or not blob_name:
        return None

    try:
        bucket = client.bucket(GCP_REPORTS_BUCKET)
        blob = bucket.blob(blob_name)
        
        if not blob.exists():
            logger.warning("Requested blob %s does not exist in bucket %s", blob_name, GCP_REPORTS_BUCKET)
            return None

        return blob.download_as_bytes()
    except Exception as e:
        logger.error("Error downloading from GCS for %s: %s", blob_name, e)
        return None
