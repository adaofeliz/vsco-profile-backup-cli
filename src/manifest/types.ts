/**
 * Manifest schema types and versioning
 * Defines the structure of the backup manifest stored at <backup-root>/.vsco-backup/manifest.json
 */

/**
 * Schema version constant - increment when manifest structure changes
 */
export const SCHEMA_VERSION = '1.0.0';

/**
 * Profile metadata
 */
export interface Profile {
  /** VSCO username */
  username: string;
  /** Canonical profile URL */
  profile_url: string;
  /** Timestamp of last successful backup (ISO 8601) */
  last_backup_ts: string;
  /** Backup version that created this profile entry */
  backup_version: string;
}

/**
 * Photo entity
 */
export interface Photo {
  /** Stable photo ID (VSCO-provided or hash of canonical URL) */
  id: string;
  /** Highest-resolution available URL */
  url_highres: string;
  /** Image width in pixels (if discoverable) */
  width?: number;
  /** Image height in pixels (if discoverable) */
  height?: number;
  /** Photo caption/description (if present) */
  caption?: string;
  /** Gallery ID this photo belongs to (if part of a gallery) */
  source_gallery_id?: string;
  /** Timestamp when this photo was downloaded (ISO 8601) */
  downloaded_at: string;
}

/**
 * Gallery entity
 */
export interface Gallery {
  /** Stable gallery ID (VSCO-provided or hash) */
  id: string;
  /** Gallery name/title */
  name: string;
  /** Gallery description (if present) */
  description?: string;
  /** Cover photo URL (if available) */
  cover_photo_url?: string;
  /** Array of photo IDs contained in this gallery */
  photo_ids: string[];
}

/**
 * Blog post entity
 */
export interface BlogPost {
  /** Stable blog post ID (VSCO-provided or hash) */
  id: string;
  /** URL-safe slug for the post */
  slug: string;
  /** Post title */
  title: string;
  /** Post content as HTML (normalized for offline rendering) */
  content_html: string;
  /** Publication timestamp (ISO 8601) */
  published_at: string;
}

/**
 * Backup run record
 */
export interface BackupRun {
  /** Unique run identifier (timestamp-based or UUID) */
  run_id: string;
  /** Run start timestamp (ISO 8601) */
  ts: string;
  /** Count of newly discovered items */
  new_content_count: number;
  /** Count of previously missing items that were downloaded */
  missing_content_count: number;
  /** Count of invalid items that were re-downloaded */
  invalid_content_count: number;
  /** Array of downloaded item IDs in this run */
  downloaded_items: string[];
  /** Run status: 'success' | 'partial' | 'failed' */
  status: 'success' | 'partial' | 'failed';
  /** Optional error message if status is 'failed' or 'partial' */
  error_message?: string;
  /** Robots.txt policy decision for this run */
  robots_policy?: {
    allowed: boolean;
    reason: string;
    fetch_success: boolean;
    ignored: boolean;
  };
}

/**
 * Content container
 */
export interface BackupContent {
  /** All photos discovered */
  photos: Photo[];
  /** All galleries discovered */
  galleries: Gallery[];
  /** All blog posts discovered */
  blog_posts: BlogPost[];
}

/**
 * Complete backup manifest
 */
export interface BackupManifest {
  /** Schema version for forward compatibility */
  schemaVersion: string;
  /** Profile metadata */
  profile: Profile;
  /** All backed-up content */
  content: BackupContent;
  /** History of backup runs */
  backup_runs: BackupRun[];
}

/**
 * Type guard: check if value is a valid BackupManifest
 * Lightweight runtime validation without external dependencies
 */
export function isValidBackupManifest(value: unknown): value is BackupManifest {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  // Check schemaVersion
  if (typeof obj.schemaVersion !== 'string') return false;

  // Check profile
  if (!obj.profile || typeof obj.profile !== 'object') return false;
  const profile = obj.profile as Record<string, unknown>;
  if (
    typeof profile.username !== 'string' ||
    typeof profile.profile_url !== 'string' ||
    typeof profile.last_backup_ts !== 'string' ||
    typeof profile.backup_version !== 'string'
  ) {
    return false;
  }

  // Check content
  if (!obj.content || typeof obj.content !== 'object') return false;
  const content = obj.content as Record<string, unknown>;
  if (
    !Array.isArray(content.photos) ||
    !Array.isArray(content.galleries) ||
    !Array.isArray(content.blog_posts)
  ) {
    return false;
  }

  // Check backup_runs
  if (!Array.isArray(obj.backup_runs)) return false;

  return true;
}

/**
 * Type guard: check if value is a valid Photo
 */
export function isValidPhoto(value: unknown): value is Photo {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.url_highres === 'string' &&
    typeof obj.downloaded_at === 'string' &&
    (obj.width === undefined || typeof obj.width === 'number') &&
    (obj.height === undefined || typeof obj.height === 'number') &&
    (obj.caption === undefined || typeof obj.caption === 'string') &&
    (obj.source_gallery_id === undefined || typeof obj.source_gallery_id === 'string')
  );
}

/**
 * Type guard: check if value is a valid Gallery
 */
export function isValidGallery(value: unknown): value is Gallery {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.photo_ids) &&
    (obj.description === undefined || typeof obj.description === 'string') &&
    (obj.cover_photo_url === undefined || typeof obj.cover_photo_url === 'string')
  );
}

/**
 * Type guard: check if value is a valid BlogPost
 */
export function isValidBlogPost(value: unknown): value is BlogPost {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.slug === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.content_html === 'string' &&
    typeof obj.published_at === 'string'
  );
}

/**
 * Type guard: check if value is a valid BackupRun
 */
export function isValidBackupRun(value: unknown): value is BackupRun {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;
  const validStatuses = ['success', 'partial', 'failed'];

  const robotsPolicyValid =
    obj.robots_policy === undefined ||
    (typeof obj.robots_policy === 'object' &&
      obj.robots_policy !== null &&
      typeof (obj.robots_policy as Record<string, unknown>).allowed === 'boolean' &&
      typeof (obj.robots_policy as Record<string, unknown>).reason === 'string' &&
      typeof (obj.robots_policy as Record<string, unknown>).fetch_success === 'boolean' &&
      typeof (obj.robots_policy as Record<string, unknown>).ignored === 'boolean');

  return (
    typeof obj.run_id === 'string' &&
    typeof obj.ts === 'string' &&
    typeof obj.new_content_count === 'number' &&
    typeof obj.missing_content_count === 'number' &&
    typeof obj.invalid_content_count === 'number' &&
    Array.isArray(obj.downloaded_items) &&
    validStatuses.includes(obj.status as string) &&
    (obj.error_message === undefined || typeof obj.error_message === 'string') &&
    robotsPolicyValid
  );
}
