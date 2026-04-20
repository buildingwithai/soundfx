import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const sourceDir = resolve(rootDir, 'website');
const outputDir = resolve(rootDir, 'dist');

if (!existsSync(sourceDir)) {
  throw new Error(`Website source folder not found: ${sourceDir}`);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(sourceDir, outputDir, { recursive: true });

console.log(`Built website from ${sourceDir} -> ${outputDir}`);
