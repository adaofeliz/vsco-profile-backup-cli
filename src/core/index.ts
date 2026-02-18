import { join } from 'path';
import { getLogger } from '../utils/logger.js';
import { discoverProfile } from '../vsco/index.js';
import { loadManifest, saveManifestAtomic, recordBackupRunStart, recordBackupRunFinish } from '../manifest/io.js';
import { detectIncrementalPhotos } from './incremental.js';
import { downloadAssets } from '../download/downloader.js';
import { generateSite } from '../site/index.js';

/**
 * Core orchestration module
 * High-level coordination of backup workflow
 */

export async function orchestrateBackup(username: string, outRoot: string): Promise<void> {
  const logger = getLogger();
  const backupRoot = join(outRoot, username);
  const profileUrl = `https://vsco.co/${username}`;

  logger.info(`Starting backup for ${username}`);
  
  const manifest = await loadManifest(backupRoot, username, profileUrl);
  const runId = recordBackupRunStart(manifest);

  try {
    const discovery = await discoverProfile(username);
    if (discovery.errorMessage) {
      throw new Error(discovery.errorMessage);
    }

    const incremental = await detectIncrementalPhotos(backupRoot, discovery.photos, manifest);
    
    const itemsToDownload = [...incremental.newItems, ...incremental.missingItems, ...incremental.invalidItems];
    
    const downloadTasks = itemsToDownload.map(photo => ({
      url: photo.imageUrl,
      backupRoot,
      mediaId: photo.id,
      contentType: 'image/jpeg'
    }));

    const { results, stats } = await downloadAssets(downloadTasks);

    for (const photo of incremental.newItems) {
      manifest.content.photos.push(photo);
    }
    
    manifest.content.galleries = discovery.galleries;
    manifest.content.blog_posts = discovery.blogPosts;

    recordBackupRunFinish(manifest, runId, {
      new_content_count: incremental.newItems.length,
      missing_content_count: incremental.missingItems.length,
      invalid_content_count: incremental.invalidItems.length,
      downloaded_items: results.filter(r => r.success && r.downloaded).map(r => r.task.mediaId)
    });

    await saveManifestAtomic(backupRoot, manifest);

    await generateSite(backupRoot);

    logger.info(`Backup completed successfully for ${username}`);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Backup failed: ${message}`);
    recordBackupRunFinish(manifest, runId, {
      new_content_count: 0,
      missing_content_count: 0,
      invalid_content_count: 0,
      downloaded_items: []
    }, 'failed', message);
    await saveManifestAtomic(backupRoot, manifest);
    throw error;
  }
}
