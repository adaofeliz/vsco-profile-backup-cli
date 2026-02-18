import { mkdir, readFile, writeFile, readdir, copyFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BackupManifest, Photo, Gallery, BlogPost } from '../manifest/types.js';
import {
  getIndexPath,
  getGalleryPath,
  getBlogPath,
  getAssetsDir,
  generateSlug,
  OUTPUT_LAYOUT,
  getMediaDir,
} from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class SiteGenerator {
  private manifest: BackupManifest;
  private backupRoot: string;
  private templates: {
    index: string;
    gallery: string;
    blog: string;
  };
  private mediaMap: Map<string, string>;

  constructor(manifest: BackupManifest, backupRoot: string) {
    this.manifest = manifest;
    this.backupRoot = backupRoot;
    this.templates = { index: '', gallery: '', blog: '' };
    this.mediaMap = new Map();
  }

  public async generate(): Promise<void> {
    const logger = getLogger();
    logger.info('Starting site generation...');

    await this.loadTemplates();
    await this.buildMediaMap();
    await this.copyAssets();

    await this.generateIndex();
    await this.generateGalleries();
    await this.generateBlogPosts();

    logger.info('Site generation complete.');
  }

  private async loadTemplates(): Promise<void> {
    const templateDir = join(__dirname, 'templates');
    this.templates.index = await readFile(join(templateDir, 'index.html'), 'utf-8');
    this.templates.gallery = await readFile(join(templateDir, 'gallery.html'), 'utf-8');
    this.templates.blog = await readFile(join(templateDir, 'blog.html'), 'utf-8');
  }

  private async buildMediaMap(): Promise<void> {
    const mediaDir = getMediaDir(this.backupRoot);
    try {
      try {
        await stat(mediaDir);
      } catch (e) {
        getLogger().warn(`Media directory not found at ${mediaDir}. Skipping media map build.`);
        return;
      }

      const files = await readdir(mediaDir);
      for (const file of files) {
        const nameWithoutExt = file.substring(0, file.lastIndexOf('.'));
        this.mediaMap.set(nameWithoutExt, file);
      }
    } catch (error) {
      getLogger().warn(`Could not read media directory: ${error}`);
    }
  }

  private getMediaFilename(photoId: string): string {
    const safeId = photoId.replace(/[^a-z0-9-]/gi, '');
    
    if (this.mediaMap.has(safeId)) {
      return this.mediaMap.get(safeId)!;
    }
    
    return `${safeId}.jpg`;
  }

  private async copyAssets(): Promise<void> {
    const sourceAssetsDir = join(__dirname, 'assets');
    const destAssetsDir = getAssetsDir(this.backupRoot);

    await mkdir(destAssetsDir, { recursive: true });

    try {
      const files = await readdir(sourceAssetsDir);
      for (const file of files) {
        await copyFile(join(sourceAssetsDir, file), join(destAssetsDir, file));
      }
    } catch (error) {
      getLogger().warn(`Could not copy assets: ${error}`);
    }
  }

  private async generateIndex(): Promise<void> {
    const { profile, content } = this.manifest;
    
    const sortedPhotos = [...content.photos].sort((a, b) => 
      new Date(b.downloaded_at).getTime() - new Date(a.downloaded_at).getTime()
    );

    const photoGrid = this.renderPhotoGrid(sortedPhotos.slice(0, 12), '');
    const galleryList = this.renderGalleryList(content.galleries, '');
    const blogList = this.renderBlogList(content.blog_posts, '');

    const html = this.templates.index
      .replace(/{{username}}/g, profile.username)
      .replace(/{{bio}}/g, `VSCO Profile Backup for ${profile.username}`)
      .replace(/{{lastBackup}}/g, new Date(profile.last_backup_ts).toLocaleString())
      .replace('{{photoGrid}}', photoGrid)
      .replace('{{galleryList}}', galleryList)
      .replace('{{blogList}}', blogList);

    await writeFile(getIndexPath(this.backupRoot), html);
  }

  private async generateGalleries(): Promise<void> {
    const { content, profile } = this.manifest;
    const existingSlugs = new Map<string, string>();

    for (const gallery of content.galleries) {
      const slug = generateSlug(gallery.name, gallery.id, existingSlugs);
      const galleryPath = getGalleryPath(this.backupRoot, slug);
      const galleryDir = dirname(galleryPath);

      await mkdir(galleryDir, { recursive: true });

      const galleryPhotos = content.photos.filter((p) => gallery.photo_ids.includes(p.id));
      const photoGrid = this.renderPhotoGrid(galleryPhotos, '../../');

      const html = this.templates.gallery
        .replace(/{{galleryName}}/g, gallery.name)
        .replace(/{{username}}/g, profile.username)
        .replace(/{{galleryDescription}}/g, gallery.description || '')
        .replace(/{{lastUpdated}}/g, new Date(profile.last_backup_ts).toLocaleString())
        .replace('{{photoGrid}}', photoGrid);

      await writeFile(galleryPath, html);
    }
  }

  private async generateBlogPosts(): Promise<void> {
    const { content, profile } = this.manifest;
    
    for (const post of content.blog_posts) {
      const postPath = getBlogPath(this.backupRoot, post.slug);
      const postDir = dirname(postPath);

      await mkdir(postDir, { recursive: true });

      const html = this.templates.blog
        .replace(/{{title}}/g, post.title)
        .replace(/{{username}}/g, profile.username)
        .replace(/{{publishDate}}/g, new Date(post.published_at).toLocaleDateString())
        .replace('{{content}}', post.content_html);

      await writeFile(postPath, html);
    }
  }

  private renderPhotoGrid(photos: Photo[], relativePrefix: string): string {
    if (photos.length === 0) return '<p>No photos found.</p>';

    return photos
      .map((photo) => {
        const filename = this.getMediaFilename(photo.id);
        const src = `${relativePrefix}${OUTPUT_LAYOUT.MEDIA_DIR}/${filename}`;
        return `
          <div class="photo-item">
            <img src="${src}" alt="${photo.caption || ''}" loading="lazy">
          </div>
        `;
      })
      .join('\n');
  }

  private renderGalleryList(galleries: Gallery[], relativePrefix: string): string {
    if (galleries.length === 0) return '<p>No galleries found.</p>';

    const existingSlugs = new Map<string, string>();
    
    return galleries
      .map((gallery) => {
        const slug = generateSlug(gallery.name, gallery.id, existingSlugs);
        const href = `${relativePrefix}${OUTPUT_LAYOUT.GALLERIES_DIR}/${slug}/${OUTPUT_LAYOUT.INDEX_FILE}`;
        return `
          <div class="gallery-item">
            <a href="${href}">
              <h3>${gallery.name}</h3>
              <p>${gallery.photo_ids.length} photos</p>
            </a>
          </div>
        `;
      })
      .join('\n');
  }

  private renderBlogList(posts: BlogPost[], relativePrefix: string): string {
    if (posts.length === 0) return '<p>No journal entries found.</p>';

    return posts
      .map((post) => {
        const href = `${relativePrefix}${OUTPUT_LAYOUT.BLOG_DIR}/${post.slug}/${OUTPUT_LAYOUT.INDEX_FILE}`;
        return `
          <div class="blog-item">
            <a href="${href}">
              <h3>${post.title}</h3>
              <p>${new Date(post.published_at).toLocaleDateString()}</p>
            </a>
          </div>
        `;
      })
      .join('\n');
  }
}
