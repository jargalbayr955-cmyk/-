import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-static'
export const revalidate = false

export async function GET() {
  try {
    const svg = await readFile(path.join(process.cwd(), 'public', 'welcome-achilt-banner.svg'), 'utf8')
    const match = svg.match(/data:image\/webp;base64,([^"']+)/)
    if (!match?.[1]) return new Response('Banner not found', { status: 404 })

    const bytes = Buffer.from(match[1], 'base64')
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(bytes.byteLength),
      },
    })
  } catch {
    return new Response('Banner not found', { status: 404 })
  }
}
