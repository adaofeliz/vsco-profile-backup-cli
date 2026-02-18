import { readFile, writeFile, mkdir, copyFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BackupManifest, Photo, Gallery, BlogPost } from '../manifest/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import {
  OUTPUT_LAYOUT,
  getMediaDir,
  getGalleriesDir,
  getBlogDir,
  generateSlug,
} from '../utils/paths.js';

export class SiteGenerator {
  private manifest: BackupManifest;
  private backupRoot: string;
  private templates: {
    index: string;
    gallery: string;
    blog: string;
  };

  constructor(backupRoot: string, manifest: BackupManifest) {
    this.backupRoot = backupRoot;
    this.manifest = manifest;
    this.templates = { index: '', gallery: '', blog: '' };
  }

  async init() {
    this.templates.index = await readFile(join(__dirname, 'templates/index.html'), 'utf-8');
    this.templates.gallery = await readFile(join(__dirname, 'templates/gallery.html'), 'utf-8');
    this.templates.blog = await readFile(join(__dirname, 'templates/blog.html'), 'utf-8');
  }

  async generate() {
    await this.init();
    await this.copyAssets();
    await this.generateIndex();
    await this.generateGalleries();
    await this.generateBlogPosts();
  }

  private async copyAssets() {
    const assetsSrc = join(__dirname, 'assets');
    const assetsDest = join(this.backupRoot, OUTPUT_LAYOUT.ASSETS_DIR);
    await mkdir(assetsDest, { recursive: true });

    const files = await readdir(assetsSrc);
    for (const file of files) {
      await copyFile(join(assetsSrc, file), join(assetsDest, file));
    }
  }

  private async getLocalMediaPath(photoId: string): Promise<string | null> {
    const mediaDir = getMediaDir(this.backupRoot);
    try {
      const files = await readdir(mediaDir);
      const match = files.find(f => f.startsWith(photoId));
      return match ? match : null;
    } catch (e) {
      return null;
    }
  }

  private async generateIndex() {
    const photosHtml = await this.renderPhotoGrid(this.manifest.content.photos.slice(0, 12), '.');
    const galleriesHtml = this.renderGalleryList(this.manifest.content.galleries, '.');
    const blogHtml = this.renderBlogList(this.manifest.content.blog_posts, '.');

    const html = this.templates.index
      .replace(/{{username}}/g, this.manifest.profile.username)
      .replace('{{bio}}', `Profile URL: ${this.manifest.profile.profile_url}`)
      .replace('{{lastBackup}}', new Date(this.manifest.profile.last_backup_ts).toLocaleString())
      .replace('{{photoGrid}}', photosHtml)
      .replace('{{galleryList}}', galleriesHtml)
      .replace('{{blogList}}', blogHtml);

    await writeFile(join(this.backupRoot, OUTPUT_LAYOUT.INDEX_FILE), html);
  }

  private async generateGalleries() {
    const galleriesDir = getGalleriesDir(this.backupRoot);
    await mkdir(galleriesDir, { recursive: true });

    for (const gallery of this.manifest.content.galleries) {
      const slug = generateSlug(gallery.name, gallery.id);
      const galleryDir = join(galleriesDir, slug);
      await mkdir(galleryDir, { recursive: true });

      const galleryPhotos = this.manifest.content.photos.filter(p => gallery.photo_ids.includes(p.id));
      const photosHtml = await this.renderPhotoGrid(galleryPhotos, '../..');

      const html = this.templates.gallery
        .replace(/{{galleryName}}/g, gallery.name)
        .replace('{{username}}', this.manifest.profile.username)
        .replace('{{galleryDescription}}', gallery.description || '')
        .replace('{{lastUpdated}}', new Date(this.manifest.profile.last_backup_ts).toLocaleDateString())
        .replace('{{photoGrid}}', photosHtml);

      await writeFile(join(galleryDir, OUTPUT_LAYOUT.INDEX_FILE), html);
    }
  }

  private async generateBlogPosts() {
    const blogDir = getBlogDir(this.backupRoot);
    await mkdir(blogDir, { recursive: true });

    for (const post of this.manifest.content.blog_posts) {
      const postDir = join(blogDir, post.slug);
      await mkdir(postDir, { recursive: true });

      const html = this.templates.blog
        .replace(/{{title}}/g, post.title)
        .replace('{{username}}', this.manifest.profile.username)
        .replace('{{publishDate}}', new Date(post.published_at).toLocaleDateString())
        .replace('{{content}}', post.content_html);

      await writeFile(join(postDir, OUTPUT_LAYOUT.INDEX_FILE), html);
    }
  }

  private async renderPhotoGrid(photos: Photo[], relativeTo: string): Promise<string> {
    if (photos.length === 0) return '<p>No photos found.</p>';

    const items = await Promise.all(photos.map(async (photo) => {
      const filename = await this.getLocalMediaPath(photo.id);
      const imgSrc = filename 
        ? `${relativeTo}/${OUTPUT_LAYOUT.MEDIA_DIR}/${filename}`
        : photo.url_highres;
      
      return `
        <div class="photo-card">
          <img src="${imgSrc}" alt="${photo.caption || ''}" loading="lazy">
          ${photo.caption ? `<div class="photo-info">${photo.caption}</div>` : ''}
        </div>
      `;
    }));

    return items.join('\n');
  }

  private renderGalleryList(galleries: Gallery[], relativeTo: string): string {
    if (galleries.length === 0) return '<p>No galleries found.</p>';

    return galleries.map(gallery => {
      const slug = generateSlug(gallery.name, gallery.id);
      const link = `${relativeTo}/${OUTPUT_LAYOUT.GALLERIES_DIR}/${slug}/${OUTPUT_LAYOUT.INDEX_FILE}`;
      return `
        <a href="${link}" class="gallery-item">
          <span class="gallery-title">${gallery.name}</span>
          <span>${gallery.photo_ids.length} photos</span>
        </a>
      `;
    }).join('\n');
  }

  private renderBlogList(posts: BlogPost[], relativeTo: string): string {
    if (posts.length === 0) return '<p>No journal entries found.</p>';

    return posts.map(post => {
      const link = `${relativeTo}/${OUTPUT_LAYOUT.BLOG_DIR}/${post.slug}/${OUTPUT_LAYOUT.INDEX_FILE}`;
      return `
        <a href="${link}" class="gallery-item">
          <span class="gallery-title">${post.title}</span>
          <span>${new Date(post.published_at).toLocaleDateString()}</span>
        </a>
      `;
    }).join('\n');
  }
}
