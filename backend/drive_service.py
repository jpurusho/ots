"""
Google Drive service — uses service account for file operations.

Service account credentials are stored in Supabase app_settings
(encrypted JSON key uploaded by admin via Settings page).
"""

import io
import json
import hashlib
from typing import Optional

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

SCOPES = ['https://www.googleapis.com/auth/drive']

SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.heic', '.heif', '.pdf'}


def get_drive_service(credentials_json: str):
    """Create a Google Drive service from service account JSON."""
    creds_dict = json.loads(credentials_json)
    creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    return build('drive', 'v3', credentials=creds, cache_discovery=False)


def list_drive_images(service, folder_id: str) -> list[dict]:
    """List image/PDF files in a Drive folder."""
    query = f"'{folder_id}' in parents and trashed = false"
    results = []
    page_token = None

    while True:
        response = service.files().list(
            q=query,
            fields="nextPageToken, files(id, name, mimeType, size, modifiedTime, md5Checksum)",
            pageSize=100,
            pageToken=page_token,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()

        for f in response.get('files', []):
            name = f.get('name', '')
            ext = '.' + name.rsplit('.', 1)[-1].lower() if '.' in name else ''
            if ext in SUPPORTED_EXTENSIONS:
                results.append({
                    'id': f['id'],
                    'name': f['name'],
                    'mimeType': f.get('mimeType', ''),
                    'size': int(f.get('size', 0)),
                    'modifiedTime': f.get('modifiedTime', ''),
                    'md5': f.get('md5Checksum', ''),
                })

        page_token = response.get('nextPageToken')
        if not page_token:
            break

    return results


def download_drive_file(service, file_id: str) -> bytes:
    """Download a file from Google Drive."""
    request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue()


def upload_to_drive(service, folder_id: str, filename: str, content: bytes,
                    mime_type: str = 'application/pdf') -> dict:
    """Upload a file to a Google Drive folder."""
    file_metadata = {
        'name': filename,
        'parents': [folder_id],
    }
    media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mime_type, resumable=True)
    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id, name, webViewLink',
        supportsAllDrives=True,
    ).execute()
    return file


def list_drive_folders(service, parent_id: str = 'root') -> list[dict]:
    """List subfolders in a Drive folder (or root/shared drives)."""
    results = []

    # If root, also list shared drives
    if parent_id == 'root':
        try:
            drives = service.drives().list(pageSize=50).execute()
            for d in drives.get('drives', []):
                results.append({
                    'id': d['id'],
                    'name': d['name'],
                    'type': 'shared_drive',
                })
        except Exception:
            pass

    # List folders in parent
    query = f"'{parent_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    page_token = None
    while True:
        response = service.files().list(
            q=query,
            fields="nextPageToken, files(id, name)",
            pageSize=100,
            pageToken=page_token,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        for f in response.get('files', []):
            results.append({
                'id': f['id'],
                'name': f['name'],
                'type': 'folder',
            })
        page_token = response.get('nextPageToken')
        if not page_token:
            break

    return sorted(results, key=lambda x: x['name'].lower())


def get_folder_path(service, folder_id: str) -> str:
    """Get the full path of a folder by walking up parents."""
    parts = []
    current = folder_id
    for _ in range(10):  # max depth
        try:
            f = service.files().get(
                fileId=current,
                fields='id, name, parents',
                supportsAllDrives=True,
            ).execute()
            parts.append(f.get('name', ''))
            parents = f.get('parents', [])
            if not parents:
                break
            current = parents[0]
        except Exception:
            break
    parts.reverse()
    return ' / '.join(parts) if parts else folder_id


def test_drive_connection(credentials_json: str, folder_id: str) -> dict:
    """Test Drive connection and folder access."""
    try:
        service = get_drive_service(credentials_json)
        # Try to get folder metadata
        folder = service.files().get(
            fileId=folder_id,
            fields='id, name, mimeType',
            supportsAllDrives=True,
        ).execute()
        # Count files
        files = list_drive_images(service, folder_id)
        return {
            'success': True,
            'folder_name': folder.get('name', 'Unknown'),
            'file_count': len(files),
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
        }


def compute_file_hash(content: bytes) -> str:
    """Compute SHA-256 hash (first 32 chars) for dedup."""
    return hashlib.sha256(content).hexdigest()[:32]
