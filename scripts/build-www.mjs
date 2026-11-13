// Copies the app's files (public/) into www/ (Capacitor's webDir) for the iPhone app.
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(root, 'www'), { recursive: true, force: true });
cpSync(join(root, 'public'), join(root, 'www'), { recursive: true });
console.log('www/ ready');
