// Offline repair of the two unsent/failed history probes. No credential, network,
// ledger, or original frozen evidence is modified by this file.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const sourceSha256 = '34e1fa732f063a2220f92a01a5b5546059380eb6cd4bb9cab49c18a832b743cc'
const corruptTiny =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
const signature = Buffer.from('89504e470d0a1a0a', 'hex')
const outputCap = 1024

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Checks the actual 1x1 RGBA PNG payload, including every chunk and zlib checksum. */
export function verifyRedPng(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 8).equals(signature))
    throw new Error('PNG signature mismatch')
  let offset = 8
  const kinds = []
  const compressed = []
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw new Error('Truncated PNG chunk')
    const length = bytes.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > bytes.length) throw new Error('PNG chunk exceeds file')
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    const expected = bytes.readUInt32BE(offset + 8 + length)
    const actual = crc32(bytes.subarray(offset + 4, offset + 8 + length))
    if (expected !== actual) throw new Error(`${type} CRC mismatch`)
    kinds.push(type)
    if (type === 'IHDR') {
      if (
        length !== 13 ||
        data.readUInt32BE(0) !== 1 ||
        data.readUInt32BE(4) !== 1 ||
        !data.subarray(8).equals(Buffer.from([8, 6, 0, 0, 0]))
      )
        throw new Error('Unexpected PNG dimensions or format')
    } else if (type === 'IDAT') compressed.push(data)
    else if (type !== 'IEND' || length !== 0) throw new Error('Unexpected PNG chunk')
    offset = end
  }
  if (kinds.join(',') !== 'IHDR,IDAT,IEND') throw new Error('Unexpected PNG chunk order')
  const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: 5 })
  if (!pixels.equals(Buffer.from([0, 255, 0, 0, 255])))
    throw new Error('PNG scanline, filter, or pixel mismatch')
  return { width: 1, height: 1, decodedBytes: bytes.length, sha256: sha256(bytes) }
}

export function rebuild(sourceBytes, pngBytes) {
  if (sha256(sourceBytes) !== sourceSha256) throw new Error('Original manifest SHA mismatch')
  const png = verifyRedPng(pngBytes)
  const original = JSON.parse(sourceBytes.toString('utf8'))
  if (original.version !== 1 || original.cases?.length !== 8)
    throw new Error('Original manifest shape mismatch')
  const cases = ['k3', 'k27'].map(route => {
    const sourceCase = original.cases.find(item => item.id === `${route}-history`)
    if (
      !sourceCase ||
      !['moonshotai/kimi-k3', 'moonshotai/kimi-k2.7-code'].includes(sourceCase.model)
    )
      throw new Error(`Missing original ${route} history`)
    const body = structuredClone(sourceCase.body)
    const messages = body.messages
    const assistant = messages.find(
      message => message.role === 'assistant' && message.tool_calls?.length,
    )
    const tool = messages.find(message => message.role === 'tool')
    const images = messages.flatMap(message =>
      Array.isArray(message.content)
        ? message.content.filter(part => part.type === 'image_url')
        : [],
    )
    const final = messages.at(-1)?.content?.at(-1)
    if (
      !assistant?.reasoning ||
      !tool ||
      images.length !== 2 ||
      final !== images[1] ||
      final?.image_url?.url !== `data:image/png;base64,${corruptTiny}`
    )
      throw new Error(`Original ${route} history changed unexpectedly`)
    final.image_url.url = `data:image/png;base64,${pngBytes.toString('base64')}`
    // Reasoning-inclusive output has exceeded a small requested cap on other routes.
    // This is a bounded request knob, never the endpoint capacity used for budget hold.
    body.max_tokens = outputCap
    const wire = JSON.stringify(body)
    return {
      id: `${route}-history-validpng-v2`,
      sourceCaseId: sourceCase.id,
      sourceBodySha256: sha256(JSON.stringify(sourceCase.body)),
      purpose: 'history-image-holdout',
      model: sourceCase.model,
      provider: sourceCase.provider,
      imageSha256: png.sha256,
      bodySha256: sha256(wire),
      body,
    }
  })
  return {
    version: 2,
    sourceManifestSha256: sourceSha256,
    png,
    maxInitialRequests: cases.length,
    cases,
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [command, source, output] = process.argv.slice(2)
  if (command !== 'emit' || !source || !output)
    throw new Error('Usage: node repair-image.mjs emit FROZEN-CALIBRATION.json NEW-MANIFEST.json')
  const manifest = rebuild(
    readFileSync(source),
    readFileSync(new URL('valid-red-1x1.png', import.meta.url)),
  )
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
}
