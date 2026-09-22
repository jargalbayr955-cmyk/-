/* eslint-disable @typescript-eslint/no-require-imports -- Verify the deployed worker import graph, without requiring a GPU. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {execFileSync}=require('node:child_process')
test('the production map worker and every relative module import are shipped together',()=>{
 const root=path.join(__dirname,'..')
 execFileSync(process.execPath,['scripts/prepare-map-assets.mjs'],{cwd:root})
 const version=require('maplibre-gl/package.json').version
 const dir=path.join(root,'public/maplibre',version)
 const worker=fs.readFileSync(path.join(dir,'maplibre-gl-worker.mjs'),'utf8')
 const imports=[...worker.matchAll(/from["'](\.\/[^"']+)["']/g)].map(m=>m[1])
 assert(imports.length>0)
 for(const name of imports){assert(fs.existsSync(path.resolve(dir,name)),`Missing worker dependency ${name}`);assert(fs.statSync(path.resolve(dir,name)).size>0)}
 assert(fs.existsSync(path.join(dir,'LICENSE.txt')))
})
