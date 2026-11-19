import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

function packageEntry(destination: string) {
  const output = resolve(destination);
  mkdirSync(output, { recursive: true });

  for (const folder of ['app', 'screenshots']) {
    const source = fileURLToPath(new URL(folder, import.meta.url));
    cpSync(source, resolve(output, folder), { recursive: true });
  }

  const dossier = buildDossier(output, {
    text_max_bytes: 160 * 1024,
    screenshots: { max: 4, max_bytes: 256 * 1024 },
    app_max_files: 993,
    app_max_bytes: 48 * 1024 * 1024,
    app_path_max_bytes: 1000,
  });
  writeFileSync(resolve(output, 'dossier.json'), dossier);
}

packageEntry(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
