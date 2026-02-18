# VSCO Profile Backup CLI

A command line tool to incrementally backup VSCO profiles into a local, browsable static website.

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/adaofeliz/vsco-profile-backup-cli.git
cd vsco-profile-backup-cli
npm install
```

Build the project:

```bash
npm run build
```

## Usage

Run the backup by providing a VSCO profile URL:

```bash
node dist/cli/index.js "https://vsco.co/username" --out-root ./backups
```

### Options

- `--out-root <dir>`: Root directory for backups (default: `.`)
- `--verbose`: Enable detailed logging
- `--ignore-robots`: Bypass robots.txt restrictions (use responsibly)

## Output Structure

The tool creates a structured backup directory for each user:

```text
<out-root>/<username>/
├── .vsco-backup/
│   ├── manifest.json      # Backup metadata and state
│   └── media/             # Downloaded photos and videos
│       ├── <media-id>.jpg
│       └── ...
├── assets/                # Static site styles and scripts
│   └── style.css
├── index.html             # Profile home and photo grid
├── galleries/             # Gallery pages
│   └── <gallery-slug>/
│       └── index.html
└── blog/                  # Blog post pages
    └── <post-slug>/
        └── index.html
```

## Features

- **Incremental Backups**: Only downloads new or missing content on subsequent runs.
- **Offline Browsing**: Generates a static site that works directly from your local file system.
- **Highest Resolution**: Automatically selects the highest available resolution for all media.
- **Safe Crawling**: Implements conservative rate limiting and respects robots.txt.

## Limitations

- **Public Profiles Only**: Does not support authentication or private profiles.
- **Robots Policy**: Respects VSCO's robots.txt by default. Use `--ignore-robots` at your own risk.
- **Rate Limiting**: Conservative request patterns are used to prevent IP blocking. Large profiles may take time to complete.
- **No Deletion**: The tool never deletes local files. If content is removed from VSCO, it remains in your local backup.

## License

MIT
