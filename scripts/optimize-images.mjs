/**
 * Image Optimization Script for VeilPix Showcase
 *
 * Generates optimized WebP versions of before/after showcase images
 * for responsive loading and improved SEO/Core Web Vitals.
 *
 * Usage: node scripts/optimize-images.mjs
 */

import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const outputDir = join(publicDir, 'showcase');

// Images to optimize
const images = [
  { name: 'civic', source: 'civic.jpeg', alt: 'before' },
  { name: 'audi', source: 'audi.jpeg', alt: 'after' }
];

// Output sizes (width in pixels)
const sizes = [400, 800];

// WebP quality (0-100)
const quality = 80;

async function optimizeImages() {
  console.log('🖼️  VeilPix Image Optimizer\n');

  // Create output directory if it doesn't exist
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
    console.log(`📁 Created directory: ${outputDir}\n`);
  }

  for (const image of images) {
    const sourcePath = join(publicDir, image.source);

    if (!existsSync(sourcePath)) {
      console.error(`❌ Source image not found: ${sourcePath}`);
      continue;
    }

    // Get original image info
    const metadata = await sharp(sourcePath).metadata();
    console.log(`📷 Processing: ${image.source}`);
    console.log(`   Original: ${metadata.width}×${metadata.height} (${metadata.format})`);

    for (const width of sizes) {
      const outputFilename = `${image.name}-${width}w.webp`;
      const outputPath = join(outputDir, outputFilename);

      try {
        const result = await sharp(sourcePath)
          .resize(width, null, {
            withoutEnlargement: true,
            fit: 'inside'
          })
          .webp({ quality })
          .toFile(outputPath);

        // Calculate file size in KB
        const sizeKB = (result.size / 1024).toFixed(1);
        console.log(`   ✅ ${outputFilename}: ${result.width}×${result.height} (${sizeKB} KB)`);
      } catch (err) {
        console.error(`   ❌ Failed to create ${outputFilename}: ${err.message}`);
      }
    }
    console.log('');
  }

  console.log('✨ Image optimization complete!\n');
  console.log('Generated files in public/showcase/:');
  console.log('  - civic-400w.webp (mobile)');
  console.log('  - civic-800w.webp (desktop)');
  console.log('  - audi-400w.webp (mobile)');
  console.log('  - audi-800w.webp (desktop)');
}

optimizeImages().catch(console.error);
