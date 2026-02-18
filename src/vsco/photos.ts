/**
 * Photos scraping and extraction
 * Enumerate photo items from discovery results and extract highest-resolution URLs
 */

import type { Photo } from '../manifest/types.js';
import { createHash } from 'crypto';

/**
 * Candidate image URL with resolution information
 */
interface ImageCandidate {
  url: string;
  width?: number;
  height?: number;
}

/**
 * Raw photo data from discovery/scraping
 */
export interface RawPhotoData {
  /** VSCO-provided ID (preferred) */
  vsco_id?: string;
  /** Canonical URL (used as fallback for ID generation) */
  canonical_url: string;
  /** Candidate URLs with resolution info */
  candidates: ImageCandidate[];
  /** Photo caption/description (if present) */
  caption?: string;
  /** Gallery ID this photo belongs to (if part of a gallery) */
  source_gallery_id?: string;
}

/**
 * Parse srcset string into candidate URLs with resolution info
 * Format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
 * 
 * @param srcset - srcset attribute value
 * @returns Array of image candidates with width information
 */
export function parseSrcset(srcset: string): ImageCandidate[] {
  if (!srcset?.trim()) {
    return [];
  }

  const candidates: ImageCandidate[] = [];
  const entries = srcset.split(',').map(e => e.trim());

  for (const entry of entries) {
    const parts = entry.split(/\s+/);
    if (parts.length < 1) continue;

    const url = parts[0];
    const descriptor = parts[1] || '';

    let width: number | undefined;
    
    // Parse width descriptor (e.g., "1920w")
    if (descriptor.endsWith('w')) {
      const w = parseInt(descriptor.slice(0, -1), 10);
      if (!isNaN(w)) {
        width = w;
      }
    }
    // Parse pixel density descriptor (e.g., "2x") - estimate width
    else if (descriptor.endsWith('x')) {
      const density = parseFloat(descriptor.slice(0, -1));
      if (!isNaN(density) && density > 0) {
        // Use density as a relative width indicator (no absolute width known)
        width = Math.round(density * 1000); // arbitrary base for comparison
      }
    }

    candidates.push({ url, width });
  }

  return candidates;
}

/**
 * Select the highest-resolution candidate from a list
 * 
 * @param candidates - Array of image candidates
 * @returns Highest-resolution candidate, or undefined if no candidates
 */
export function selectHighestResolution(candidates: ImageCandidate[]): ImageCandidate | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  // Sort by: width desc, height desc, then by URL length (as a tiebreaker for larger files)
  const sorted = [...candidates].sort((a, b) => {
    // Primary: width
    if (a.width !== undefined && b.width !== undefined) {
      return b.width - a.width;
    }
    if (a.width !== undefined) return -1;
    if (b.width !== undefined) return 1;

    // Secondary: height
    if (a.height !== undefined && b.height !== undefined) {
      return b.height - a.height;
    }
    if (a.height !== undefined) return -1;
    if (b.height !== undefined) return 1;

    // Tertiary: URL length (heuristic: longer URLs often indicate higher resolution)
    return b.url.length - a.url.length;
  });

  return sorted[0];
}

/**
 * Generate a stable photo ID from VSCO ID or canonical URL
 * 
 * @param vsco_id - VSCO-provided ID (preferred)
 * @param canonical_url - Canonical URL (fallback)
 * @returns Stable photo ID
 */
export function generatePhotoId(vsco_id: string | undefined, canonical_url: string): string {
  if (vsco_id?.trim()) {
    return vsco_id.trim();
  }

  // Fallback: hash of canonical URL
  const hash = createHash('sha256')
    .update(canonical_url)
    .digest('hex')
    .substring(0, 16); // Use first 16 chars for reasonable length

  return `photo-${hash}`;
}

/**
 * Extract photos from raw discovery data
 * 
 * @param rawPhotos - Array of raw photo data from discovery
 * @returns Array of Photo entities with highest-resolution URLs selected
 */
export function extractPhotos(rawPhotos: RawPhotoData[]): Photo[] {
  const photos: Photo[] = [];
  const now = new Date().toISOString();

  for (const raw of rawPhotos) {
    // Select highest-resolution candidate
    const highestRes = selectHighestResolution(raw.candidates);
    
    if (!highestRes) {
      // Skip photos with no valid candidates
      continue;
    }

    // Generate stable ID
    const id = generatePhotoId(raw.vsco_id, raw.canonical_url);

    // Extract metadata
    const width = highestRes.width;
    const height = highestRes.height;

    const photo: Photo = {
      id,
      url_highres: highestRes.url,
      downloaded_at: now,
    };

    // Add optional fields if present
    if (width !== undefined) {
      photo.width = width;
    }
    if (height !== undefined) {
      photo.height = height;
    }
    if (raw.caption?.trim()) {
      photo.caption = raw.caption.trim();
    }
    if (raw.source_gallery_id?.trim()) {
      photo.source_gallery_id = raw.source_gallery_id.trim();
    }

    photos.push(photo);
  }

  return photos;
}
