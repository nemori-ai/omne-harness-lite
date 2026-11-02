// Reads the bytes of a raw output back through the read handlers of this member, chunk by chunk,
// the way a content reader would: the manifest names the chunk count, and every chunk is one read.
import { randomUUID } from 'node:crypto'
import type { TenantId } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { RawOutput } from '@omne-harness/tool-contract'
import { CHUNK_READ_HANDLER, MANIFEST_READ_HANDLER, PROTOCOL } from '../../src/worker/schema.ts'
import { domainNameOf, textOf, type App } from './app.ts'
import { domainRef } from './sqlite-storage.ts'

async function read(app: App, tenant: TenantId, handler: string, input: JsonValue) {
  const answer = await app.sqlite.storage.read({
    domain: domainRef(textOf(tenant), domainNameOf(tenant)),
    handler,
    protocol: PROTOCOL,
    requestKey: randomUUID(),
    input,
  })
  if (answer.kind !== 'read') throw new Error(`read ${handler}: ${answer.kind}`)
  return answer.output
}

/** The address of a raw output: the call and the preserve operation its content key names. */
export function addressOf(raw: RawOutput): readonly [string, string] {
  const parsed: unknown = JSON.parse(raw.content.key)
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== 'string' ||
    typeof parsed[1] !== 'string'
  )
    throw new Error('not a content key of this storage')
  return [parsed[0], parsed[1]]
}

export async function readRawBytes(
  app: App,
  tenant: TenantId,
  raw: RawOutput,
): Promise<Uint8Array> {
  const [call, operation] = addressOf(raw)
  const address = { tenant: textOf(tenant), call, operation }
  const found = await read(app, tenant, MANIFEST_READ_HANDLER, address)
  const manifest: unknown =
    typeof found === 'object' && found !== null ? Reflect.get(found, 'manifest') : null
  if (typeof manifest !== 'object' || manifest === null)
    throw new Error('the custody keeps no output under this reference')
  const chunks = Number(Reflect.get(manifest, 'chunks'))
  const parts: Buffer[] = []
  for (let index = 0; index < chunks; index += 1) {
    const chunk = await read(app, tenant, CHUNK_READ_HANDLER, { ...address, index })
    const data: unknown =
      typeof chunk === 'object' && chunk !== null ? Reflect.get(chunk, 'data') : null
    if (typeof data !== 'string') throw new Error(`chunk ${index} is missing`)
    parts.push(Buffer.from(data, 'base64'))
  }
  return new Uint8Array(Buffer.concat(parts))
}
