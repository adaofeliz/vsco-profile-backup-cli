/**
 * Manifest schema and read/write operations
 */

export {
  SCHEMA_VERSION,
  type Profile,
  type Photo,
  type Gallery,
  type BlogPost,
  type BackupRun,
  type BackupContent,
  type BackupManifest,
  isValidBackupManifest,
  isValidPhoto,
  isValidGallery,
  isValidBlogPost,
  isValidBackupRun,
} from './types';

export {
  ensureBackupRoot,
  loadManifest,
  saveManifestAtomic,
  recordBackupRunStart,
  recordBackupRunFinish,
  getManifestPath,
} from './io';
