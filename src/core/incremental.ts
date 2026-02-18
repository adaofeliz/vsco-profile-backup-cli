import { stat } from 'fs/promises';
import type { BackupManifest, Photo } from '../manifest/types.js';
import { generateMediaFilename, getMediaPath } from '../utils/paths.js';

export interface IncrementalDetectionOptions {
  expectedSizesById?: Map<string, number>;
  contentTypeById?: Map<string, string>;
  filenameById?: Map<string, string>;
}

export interface IncrementalDetectionResult<T> {
  newItems: T[];
  missingItems: T[];
  invalidItems: T[];
}

function resolveMediaPath(
  backupRoot: string,
  mediaId: string,
  options: IncrementalDetectionOptions
): string {
  const filename =
    options.filenameById?.get(mediaId) ??
    generateMediaFilename(mediaId, options.contentTypeById?.get(mediaId));
  return getMediaPath(backupRoot, filename);
}

async function classifyManifestPhoto(
  backupRoot: string,
  photo: Photo,
  options: IncrementalDetectionOptions
): Promise<'missing' | 'invalid' | 'ok'> {
  const expectedSize = options.expectedSizesById?.get(photo.id);
  const localPath = resolveMediaPath(backupRoot, photo.id, options);

  try {
    const stats = await stat(localPath);

    if (stats.size === 0) {
      return 'invalid';
    }

    if (expectedSize !== undefined && expectedSize > 0 && stats.size !== expectedSize) {
      return 'invalid';
    }

    return 'ok';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'missing';
    }

    return 'invalid';
  }
}

export async function detectIncrementalPhotos(
  backupRoot: string,
  discoveredPhotos: Photo[],
  manifest: BackupManifest,
  options: IncrementalDetectionOptions = {}
): Promise<IncrementalDetectionResult<Photo>> {
  const newItems: Photo[] = [];
  const missingItems: Photo[] = [];
  const invalidItems: Photo[] = [];

  const manifestPhotos = manifest.content.photos;
  const manifestIds = new Set(manifestPhotos.map((photo) => photo.id));

  for (const photo of discoveredPhotos) {
    if (!manifestIds.has(photo.id)) {
      newItems.push(photo);
    }
  }

  for (const photo of manifestPhotos) {
    const status = await classifyManifestPhoto(backupRoot, photo, options);
    if (status === 'missing') {
      missingItems.push(photo);
    } else if (status === 'invalid') {
      invalidItems.push(photo);
    }
  }

  return { newItems, missingItems, invalidItems };
}
