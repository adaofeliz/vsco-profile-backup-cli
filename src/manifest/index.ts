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

export async function writeManifest(path: string, _manifest: unknown): Promise<void> {
  console.log(`Writing manifest to ${path}`);
  // TODO: Implement manifest writing
}

export async function readManifest(path: string): Promise<unknown> {
  console.log(`Reading manifest from ${path}`);
  // TODO: Implement manifest reading
  throw new Error('Not implemented');
}
