import { join } from 'path';
import { getLogger } from '../utils/logger.js';
import { discoverProfile } from '../vsco/index.js';
import { loadManifest, saveManifestAtomic, recordBackupRunStart, recordBackupRunFinish } from '../manifest/io.js';
import { detectIncrementalPhotos } from './incremental.js';
import { downloadAssets } from '../download/downloader.js';
import { generateSite } from '../site/index.js';
import type { Photo as ManifestPhoto, Gallery as ManifestGallery, BlogPost as ManifestBlogPost } from '../manifest/types.js';
import type { Photo as DiscoveryPhoto, Gallery as DiscoveryGallery, BlogPost as DiscoveryBlogPost } from '../vsco/types.js';

function mapPhoto(photo: DiscoveryPhoto): ManifestPhoto {
  return {
    id: photo.id,
    url_highres: photo.imageUrl || '',
    caption: photo.caption,
    downloaded_at: new Date().toISOString()
  };
}

function mapGallery(gallery: DiscoveryGallery): ManifestGallery {
  return {
    id: gallery.id,
    name: gallery.name || 'Untitled Gallery',
    photo_ids: []
  };
}

function mapBlogPost(post: DiscoveryBlogPost): ManifestBlogPost {
  return {
    id: post.id,
    slug: post.id,
    title: post.title || 'Untitled Post',
    content_html: post.excerpt || '',
    published_at: post.publishDate || new Date().toISOString()
  };
}

export interface BackupOptions {
  timeoutMs?: number;
}

export async function orchestrateBackup(username: string, outRoot: string, options?: BackupOptions): Promise<void> {
  const logger = getLogger();
  const backupRoot = join(outRoot, username);
  const profileUrl = `https://vsco.co/${username}`;

  logger.info(`Starting backup for ${username}`);
  
  const manifest = await loadManifest(backupRoot, username, profileUrl);
  const runId = recordBackupRunStart(manifest);

  try {
    const discovery = await discoverProfile(username, { navigationTimeout: options?.timeoutMs });
    if (discovery.errorMessage) {
      throw new Error(discovery.errorMessage);
    }

    const manifestPhotos = discovery.photos.map(mapPhoto);
    const incremental = await detectIncrementalPhotos(backupRoot, manifestPhotos, manifest);
    
    const itemsToDownload = [...incremental.newItems, ...incremental.missingItems, ...incremental.invalidItems];
    
    const downloadTasks = itemsToDownload.map(photo => ({
      url: photo.url_highres,
      backupRoot,
      mediaId: photo.id,
      contentType: 'image/jpeg'
    }));

    const { results } = await downloadAssets(downloadTasks);

    for (const photo of incremental.newItems) {
      manifest.content.photos.push(photo);
    }
    
    manifest.content.galleries = discovery.galleries.map(mapGallery);
    manifest.content.blog_posts = discovery.blogPosts.map(mapBlogPost);

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
