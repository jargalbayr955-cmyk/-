import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(fileURLToPath(import.meta.resolve('maplibre-gl/package.json')))
const { version } = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const target = new URL(`../public/maplibre/${version}/`, import.meta.url)
await mkdir(target, { recursive: true })
// Preserve sibling module names: Turbopack hashes URL assets without rewriting
// the worker's relative import of maplibre-gl-shared.mjs.
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(join(packageRoot, 'dist', file), new URL(file, target))
}
await copyFile(join(packageRoot, 'LICENSE.txt'), new URL('LICENSE.txt', target))
