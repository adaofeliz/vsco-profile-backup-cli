/**
 * Path utilities and naming policy for output layout
 * Defines canonical output structure, slug generation, and media filename rules
 */

import { createHash } from 'crypto';
import { join } from 'path';

/**
 * Canonical output layout structure
 */
export const OUTPUT_LAYOUT = {
  /** Manifest and metadata directory */
  BACKUP_DIR: '.vsco-backup',
  /** Downloaded media binaries */
  MEDIA_DIR: '.vsco-backup/media',
  /** Generated CSS/JS assets */
  ASSETS_DIR: 'assets',
  /** Galleries index directory */
  GALLERIES_DIR: 'galleries',
  /** Blog posts index directory */
  BLOG_DIR: 'blog',
  /** Main index file */
  INDEX_FILE: 'index.html',
  /** Manifest file */
  MANIFEST_FILE: '.vsco-backup/manifest.json',
} as const;

/**
 * Get the path to the manifest file
 * @param backupRoot - Root directory of the backup
 * @returns Full path to manifest.json
 */
export function getManifestPath(backupRoot: string): string {
  return join(backupRoot, OUTPUT_LAYOUT.MANIFEST_FILE);
}

/**
 * Get the path to the media directory
 * @param backupRoot - Root directory of the backup
 * @returns Full path to media directory
 */
export function getMediaDir(backupRoot: string): string {
  return join(backupRoot, OUTPUT_LAYOUT.MEDIA_DIR);
}

/**
 * Get the path to a specific media file
 * @param backupRoot - Root directory of the backup
 * @param filename - Media filename (e.g., "photo-abc123.jpg")
 * @returns Full path to media file
 */
export function getMediaPath(backupRoot: string, filename: string): string {
  return join(backupRoot, OUTPUT_LAYOUT.MEDIA_DIR, filename);
}

/**
 * Get the path to the assets directory
 * @param backupRoot - Root directory of the backup
 * @returns Full path to assets directory
 */
export function getAssetsDir(backupRoot: string): string {
  return join(backupRoot, OUTPUT_LAYOUT.ASSETS_DIR);
}

/**
 * Get the path to the galleries directory
 * @param backupRoot - Root directory of the backup
 * @returns Full path to galleries directory
 */
export function getGalleriesDir(backupRoot: string): string {
  return join(backupRoot, OUTPUT_LAYOUT.GALLERIES_DIR);
}

/**
 * Get the path to a specific gallery page
 * @param backupRoot - Root directory of the backup
 * @param gallerySlug - URL-safe gallery slug
 * @returns Full path to gallery index.html
 */
export function getGalleryPath(backupRoot: string, gallerySlug: string): string {
  return join(backupRoot, OUTPUT_LAYOUT.GALLERIES_DIR, gallerySlug, OUTPUT_LAYOUT.INDEX_FILE);
}

/**
 * Get the path to the blog directory
 * @param backupRoot - Root directory of the backup
 * @returns Full path to blog directory
 */
export function getBlogDir(backupRoot: string): string {
  return join(backupRoot, OUTPUT_LAYOUT.BLOG_DIR);
}

/**
 * Get the path to a specific blog post page
 * @param backupRoot - Root directory of the backup
 * @param postSlug - URL-safe post slug
 * @returns Full path to blog post index.html
 */
export function getBlogPath(backupRoot: string, postSlug: string): string {
  return join(backupRoot, OUTPUT_LAYOUT.BLOG_DIR, postSlug, OUTPUT_LAYOUT.INDEX_FILE);
}

/**
 * Get the path to the main index file
 * @param backupRoot - Root directory of the backup
 * @returns Full path to index.html
 */
export function getIndexPath(backupRoot: string): string {
  return join(backupRoot, OUTPUT_LAYOUT.INDEX_FILE);
}

/**
 * Normalize a string to a URL-safe slug
 * - Unicode normalization (NFKD)
 * - Lowercase
 * - Replace spaces and underscores with hyphens
 * - Remove unsafe characters
 * - Collapse consecutive hyphens
 * - Trim hyphens from edges
 *
 * @param text - Text to slugify
 * @returns URL-safe slug
 */
export function normalizeSlug(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return (
    text
      // Unicode normalization (NFKD) - decompose accented characters
      .normalize('NFKD')
      // Lowercase
      .toLowerCase()
      // Replace spaces and underscores with hyphens
      .replace(/[\s_]+/g, '-')
      // Remove unsafe characters (keep only a-z, 0-9, hyphen)
      .replace(/[^a-z0-9-]/g, '')
      // Collapse consecutive hyphens
      .replace(/-+/g, '-')
      // Trim hyphens from edges
      .replace(/^-+|-+$/g, '')
  );
}

/**
 * Generate a deterministic short hash suffix for collision handling
 * Uses first 6 characters of SHA256 hash
 *
 * @param input - String to hash
 * @returns Short hash suffix (6 characters)
 */
function generateHashSuffix(input: string): string {
  const hash = createHash('sha256').update(input).digest('hex');
  return hash.substring(0, 6);
}

/**
 * Generate a collision-proof slug for a gallery or blog post
 * Strategy:
 * 1. Normalize the base name
 * 2. If collision detected (via existingSlugMap), append numeric suffix or hash
 * 3. Return deterministic, stable slug
 *
 * @param name - Gallery/post name or title
 * @param id - Stable ID (VSCO ID or hash) for deterministic collision handling
 * @param existingSlugMap - Map of already-used slugs to their IDs (for collision detection)
 * @returns Collision-proof slug
 */
export function generateSlug(
  name: string,
  id: string,
  existingSlugMap: Map<string, string> = new Map()
): string {
  const baseSlug = normalizeSlug(name);

  // If base slug is empty, use hash of ID
  if (!baseSlug) {
    return `item-${generateHashSuffix(id)}`;
  }

  // Check if slug already exists
  if (!existingSlugMap.has(baseSlug)) {
    existingSlugMap.set(baseSlug, id);
    return baseSlug;
  }

  // Collision detected: check if it's the same ID (idempotent)
  if (existingSlugMap.get(baseSlug) === id) {
    return baseSlug;
  }

  // Different ID with same slug: append hash suffix
  const hashSuffix = generateHashSuffix(id);
  const candidateSlug = `${baseSlug}-${hashSuffix}`;

  // Verify new slug doesn't collide (extremely unlikely with 6-char hash)
  if (!existingSlugMap.has(candidateSlug)) {
    existingSlugMap.set(candidateSlug, id);
    return candidateSlug;
  }

  // Fallback: append numeric suffix (should rarely reach here)
  let counter = 2;
  while (existingSlugMap.has(`${baseSlug}-${counter}`)) {
    counter++;
  }
  const numericSlug = `${baseSlug}-${counter}`;
  existingSlugMap.set(numericSlug, id);
  return numericSlug;
}

/**
 * Generate a deterministic media filename
 * Strategy:
 * 1. Prefer stable media ID from VSCO
 * 2. Fallback: hash of canonical URL
 * 3. Append extension based on content-type
 * 4. Ensure filename is safe and within length constraints
 *
 * @param mediaId - Stable media ID (VSCO-provided or hash of URL)
 * @param contentType - MIME type (e.g., "image/jpeg", "video/mp4")
 * @returns Safe media filename with extension
 */
export function generateMediaFilename(mediaId: string, contentType: string = 'image/jpeg'): string {
  // Map common content types to extensions
  const extensionMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'application/octet-stream': 'bin',
  };

  // Extract extension from content-type
  let ext = extensionMap[contentType] || 'bin';

  // Sanitize media ID: keep only alphanumeric and hyphens
  const safeId = mediaId.replace(/[^a-z0-9-]/gi, '');

  // Ensure filename doesn't exceed reasonable length (255 char filesystem limit)
  // Reserve space for extension and dot
  const maxIdLength = 240 - ext.length - 1;
  const truncatedId = safeId.substring(0, maxIdLength);

  return `${truncatedId}.${ext}`;
}

/**
 * Validate that a filename is safe and within constraints
 * @param filename - Filename to validate
 * @returns true if filename is safe
 */
export function isValidFilename(filename: string): boolean {
  // Check length (filesystem limit is typically 255)
  if (filename.length > 255) {
    return false;
  }

  // Check for unsafe characters
  if (!/^[a-z0-9._-]+$/i.test(filename)) {
    return false;
  }

  // Disallow path traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return false;
  }

  return true;
}

/**
 * Validate that a slug is safe and within constraints
 * @param slug - Slug to validate
 * @returns true if slug is safe
 */
export function isValidSlug(slug: string): boolean {
  // Check length
  if (slug.length === 0 || slug.length > 200) {
    return false;
  }

  // Check for safe characters only (a-z, 0-9, hyphen)
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return false;
  }

  // Disallow leading/trailing hyphens
  if (slug.startsWith('-') || slug.endsWith('-')) {
    return false;
  }

  return true;
}
