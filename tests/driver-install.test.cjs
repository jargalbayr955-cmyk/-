const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('driver PWA opens directly on the driver route', () => {
  const manifest = JSON.parse(read('public/driver-manifest.json'))
  const layout = read('app/driver/layout.tsx')
  assert.equal(manifest.id, '/driver')
  assert.equal(manifest.start_url, '/driver')
  assert.equal(manifest.display, 'standalone')
  assert.match(layout, /manifest:\s*['"]\/driver-manifest\.json['"]/)
  assert.match(layout, /DriverInstallButton/)
})

test('driver install control sits below login and supports native browser install prompt', () => {
  const source = read('app/components/driver-install-button.tsx')
  assert.match(source, /beforeinstallprompt/)
  assert.match(source, /installPrompt\.prompt\(\)/)
  assert.match(source, /insertAdjacentElement\(['"]afterend['"]/)
  assert.match(source, /Жолооч апп утас дээр суулгах/)
  assert.match(source, /navigator\.serviceWorker\.register\(['"]\/sw\.js['"]\)/)
  assert.match(source, /Add to Home Screen/)
  assert.match(source, /a\[href=\"\/driver\/app\"\]/)
})
