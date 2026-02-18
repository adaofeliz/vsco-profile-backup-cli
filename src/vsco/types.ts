/**
 * VSCO profile discovery and content types
 */

/**
 * Photo metadata from VSCO profile
 */
export interface Photo {
  id: string;
  permalink?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  uploadDate?: string;
  caption?: string;
}

/**
 * Gallery/collection metadata from VSCO profile
 */
export interface Gallery {
  id: string;
  name?: string;
  permalink?: string;
  thumbnailUrl?: string;
  photoCount?: number;
}

/**
 * Blog post metadata from VSCO profile
 */
export interface BlogPost {
  id: string;
  title?: string;
  permalink?: string;
  publishDate?: string;
  excerpt?: string;
}

/**
 * Result from profile discovery
 */
export interface ProfileDiscoveryResult {
  username: string;
  profileUrl: string;
  photos: Photo[];
  galleries: Gallery[];
  blogPosts: BlogPost[];
  isEmpty: boolean; // true if profile has no content
  isPrivate?: boolean; // true if profile is private/suspended
  errorMessage?: string; // set if discovery failed
}

/**
 * Options for profile discovery
 */
export interface DiscoveryOptions {
  /**
   * Number of scroll cycles with no new IDs before stopping
   * @default 3
   */
  noNewContentThreshold?: number;

  /**
   * Maximum number of scroll cycles (hard cap)
   * @default 50
   */
  maxScrollCycles?: number;

  /**
   * Timeout for page navigation (ms)
   * @default 30000
   */
  navigationTimeout?: number;

  /**
   * Headless mode for browser
   * @default true
   */
  headless?: boolean;

  /**
   * User agent string
   * @default Chrome user agent
   */
  userAgent?: string;
}

/**
 * Scroll state for tracking discovery progress
 */
export interface ScrollState {
  currentCycle: number;
  totalIds: Set<string>;
  cyclesWithoutNewContent: number;
  lastIdCount: number;
}
