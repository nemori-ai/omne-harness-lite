import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import { mediaProtocol } from '@omne-harness/media-protocol'
import { createClient, type ClientOf } from '@omne-harness/sdk/core'
import { savedTenant } from '../../r9/support.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'

export type MediaClient = ClientOf<typeof mediaProtocol>

/** media/v1 over HTTP with the login the given client state saved, and the tenant of that login. */
export function mediaClientOf(port: number, home: string) {
  const client = createClient(
    mediaProtocol,
    protocolTransport(originOf(port), savedCredentials(home)),
  )
  return { client, tenant: tenantOf(savedTenant(home)) }
}

export const digestOf = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data])
  const frame = Buffer.alloc(8 + data.length + 4)
  frame.writeUInt32BE(data.length, 0)
  body.copy(frame, 4)
  frame.writeUInt32BE(crc32(body) >>> 0, 8 + data.length)
  return frame
}

/** A real PNG of noise, so that it does not compress: its size is about width × height × 3 bytes. */
export function noisePng(width: number, height: number): Uint8Array {
  const raw = Buffer.alloc(height * (1 + width * 3))
  let seed = 0x9e3779b9
  for (let at = 0; at < raw.length; at += 1) {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    raw[at] = at % (1 + width * 3) === 0 ? 0 : seed & 0xff
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}
