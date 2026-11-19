import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// No credentials required. Stream the actual public installer without executing
// or retaining it, and compare it with the hash reviewed alongside the URL.
const source = await readFile(new URL('../src/lib/releases.ts', import.meta.url), 'utf8');
const url = source.match(/url: "([^"]+)"/)?.[1];
const expected = source.match(/sha256: "([a-f0-9]{64})"/)?.[1];
if (!url || !expected) throw new Error('Release manifest is missing a URL or SHA-256.');
const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
if (!response.ok || !response.body) throw new Error(`Installer request failed: ${response.status}`);
const hash = createHash('sha256');
let bytes = 0;
for await (const chunk of response.body) {
  bytes += chunk.length;
  hash.update(chunk);
}
if (hash.digest('hex') !== expected) throw new Error('Installer SHA-256 does not match the reviewed release.');
const checksumUrl = new URL('SHA256SUMS.txt', url);
const checksum = await fetch(checksumUrl, { signal: AbortSignal.timeout(30_000) });
if (!checksum.ok) throw new Error(`Checksum request failed: ${checksum.status}`);
const filename = decodeURIComponent(new URL(url).pathname.split('/').pop());
const lines = (await checksum.text()).trim().split(/\r?\n/);
if (!lines.some(line => line.trim() === `${expected}  ${filename}`)) {
  throw new Error('Published checksum file does not match the reviewed installer.');
}
console.log(`Verified public installer: ${bytes} bytes; SHA-256 ${expected}`);
