/**
 * Manifest schema and read/write operations
 */

export interface BackupManifest {
  username: string;
  timestamp: string;
  version: string;
}

export async function writeManifest(path: string, _manifest: BackupManifest): Promise<void> {
  console.log(`Writing manifest to ${path}`);
  // TODO: Implement manifest writing
}

export async function readManifest(path: string): Promise<BackupManifest> {
  console.log(`Reading manifest from ${path}`);
  // TODO: Implement manifest reading
  throw new Error('Not implemented');
}
