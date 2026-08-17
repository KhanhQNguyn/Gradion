import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) {
      return structuredClone(fallback);
    }
    throw err;
  }
}

// Writes to a sibling temp file then renames over the target. fs.rename is
// atomic on both POSIX (rename(2)) and Windows (libuv uses MoveFileEx with
// MOVEFILE_REPLACE_EXISTING) so readers never observe a partial file.
export async function writeFileAtomic(file, data) {
  const dir = path.dirname(file);
  await ensureDir(dir);
  const tmp = path.join(
    dir,
    `${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  );
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

export async function writeJsonAtomic(file, value) {
  await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function newId(prefix) {
  // Time-prefixed so a directory listing sorts oldest-first.
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

export function slugify(value, fallback = 'item') {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || fallback;
}
