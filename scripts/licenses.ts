import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const permitted = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Python-2.0',
]);
const rows: { package: string; version: string; license: string; review: string }[] = [];
for (const [key, p] of Object.entries(lock.packages) as [
  string,
  { version?: string; license?: string; dev?: boolean },
][]) {
  if (!key) continue;
  const license = p.license || 'UNKNOWN';
  const review =
    license === '(MPL-2.0 OR Apache-2.0)'
      ? 'Apache-2.0 selected'
      : license === 'MPL-2.0' && p.dev && key.startsWith('node_modules/lightningcss')
        ? 'reviewed build dependency (MPL-2.0)'
        : permitted.has(license) ||
            license === '(MIT OR CC0-1.0)' ||
            license === '(MIT AND Zlib)' ||
            license === '(MIT OR Apache-2.0)'
          ? 'permissive'
          : 'REVIEW';
  rows.push({
    package: key.replace(/^node_modules\//, ''),
    version: p.version || 'unknown',
    license,
    review,
  });
}
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/dependency-licenses.json', JSON.stringify(rows, null, 2));
console.log(
  JSON.stringify(
    {
      packages: rows.length,
      licenses: [...new Set(rows.map((r) => r.license))].sort(),
      requiresReview: rows.filter((r) => r.review === 'REVIEW'),
    },
    null,
    2,
  ),
);
if (rows.some((r) => r.review === 'REVIEW')) process.exitCode = 1;

if (process.argv.includes('--write-notices')) {
  const sections: string[] = [];
  for (const key of Object.keys(lock.packages)) {
    if (!key) continue;
    let names: string[] = [];
    try {
      names = await readdir(key);
    } catch {
      continue;
    }
    for (const name of names.filter((n) => /^(?:licen[cs]e|notice)(?:[._-].*)?$/i.test(n))) {
      try {
        sections.push(`PACKAGE: ${key}\n${await readFile(`${key}/${name}`, 'utf8')}`);
      } catch {}
    }
  }
  await mkdir('dist', { recursive: true });
  await writeFile('dist/THIRD_PARTY_LICENSES.txt', sections.join('\n\n' + '='.repeat(72) + '\n\n'));
}
