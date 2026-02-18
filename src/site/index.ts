/**
 * Static HTML generation module
 */

import { SiteGenerator } from './generator.js';
import { readManifest } from '../manifest/io.js';
import { getLogger } from '../utils/logger.js';

export async function generateSite(outputDir: string): Promise<void> {
  const logger = getLogger();
  logger.info(`Generating static site in ${outputDir}`);
  
  try {
    const manifest = await readManifest(outputDir);
    const generator = new SiteGenerator(manifest, outputDir);
    await generator.generate();
  } catch (error) {
    logger.error(`Failed to generate site: ${error}`);
    throw error;
  }
}
