# VSCO Profile Backup CLI - Learnings

## T3: Manifest Schema Definition (2026-02-18)

### Approach
- Created `src/manifest/types.ts` with comprehensive TypeScript interfaces for all entities
- Implemented lightweight runtime type guards without external dependencies (no Zod)
- Exported all types and guards from `src/manifest/index.ts`

### Key Decisions
1. **Schema Version**: Set to "1.0.0" as constant for forward compatibility
2. **Type Guards**: Implemented 5 type guards (isValidBackupManifest, isValidPhoto, isValidGallery, isValidBlogPost, isValidBackupRun)
3. **Optional Fields**: Used optional properties (?) for discoverable metadata (width, height, caption, description)
4. **Status Enum**: BackupRun.status uses literal union type ('success' | 'partial' | 'failed')
5. **Stable IDs**: Documented that IDs should be VSCO-provided or hash of canonical URL

### Entities Defined
- **Profile**: username, profile_url, last_backup_ts, backup_version
- **Photo**: id, url_highres, width?, height?, caption?, source_gallery_id?, downloaded_at
- **Gallery**: id, name, description?, cover_photo_url?, photo_ids[]
- **BlogPost**: id, slug, title, content_html, published_at
- **BackupRun**: run_id, ts, new_content_count, missing_content_count, invalid_content_count, downloaded_items[], status, error_message?
- **BackupContent**: photos[], galleries[], blog_posts[]
- **BackupManifest**: schemaVersion, profile, content, backup_runs[]

### Type Guard Implementation
- Lightweight runtime validation using typeof checks
- No external dependencies (Zod not needed for MVP)
- Validates structure recursively for nested objects
- Handles optional fields correctly

### Testing
- All type guards tested and working correctly
- TypeScript compilation clean (no errors/warnings)
- Generated .d.ts files properly exported

### Next Steps
- T4 will implement manifest IO (load/save/atomic operations)
- Type guards will be used in manifest validation during load

## Task 5: Output Layout & Slug/File Naming Policy

### Key Learnings

1. **Slug Generation Strategy**
   - Unicode normalization (NFKD) is essential for handling accented characters
   - Collision handling uses hash suffix (6-char SHA256) for determinism
   - Idempotent: same ID always produces same slug
   - Fallback to numeric suffix only if hash collision occurs (extremely rare)

2. **Deterministic Naming**
   - Media filenames use stable VSCO ID or hash of canonical URL
   - Content-type mapping ensures correct extensions (jpg, mp4, webp, etc.)
   - All naming is deterministic and stable across runs

3. **Path Layout**
   - Canonical structure: `.vsco-backup/manifest.json`, `.vsco-backup/media/`, `assets/`, `galleries/`, `blog/`
   - Path utilities provide consistent access to all output locations
   - Relative links work for offline browsing

4. **Validation**
   - Filename validation prevents path traversal attacks
   - Slug validation ensures safe characters only (a-z, 0-9, hyphen)
   - Length constraints respect filesystem limits (255 char max)

### Implementation Notes

- Used Node.js built-in `crypto.createHash()` for deterministic hashing
- NFKD normalization handles Unicode properly (e.g., "Café" → "cafe")
- Map-based collision tracking ensures O(1) lookup for existing slugs
- All functions are pure and testable

### Testing

- Slug collision: Two items with same name produce distinct, stable slugs
- Idempotency: Same ID always produces same slug
- Unicode: Accented characters properly normalized
- Validation: Path traversal and unsafe characters rejected
- Media filenames: Stable across runs, proper extensions

