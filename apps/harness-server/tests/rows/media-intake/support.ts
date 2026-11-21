import type { JsonValue } from '@omne-harness/json-text'
import { sessionBeforeIntakeKey } from '@omne-harness/session-cordis-contract/cordis'
import { userMessageId } from '@omne-harness/session-protocol'
import { savedTenant } from '../../r9/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import type { ReleaseTree } from '../../support/release-tree.ts'
import { digestOf, type MediaClient } from '../media-access/support.ts'

type Send = Parameters<ReleaseTree['clients']['session']['send-input']>[0]
export type Reference = Readonly<
  Record<'storage' | 'key' | 'mediaType' | 'bytes' | 'digest', string>
>

const visibility = { toHuman: true, toModel: true }
export const words = (id: string, text: string) => ({ kind: 'text', id, visibility, text })
export const picture = (id: string, ref: Reference, extra: object = {}) => ({
  kind: 'image',
  id,
  visibility,
  ref,
  transcript: null,
  ...extra,
})

/** Takes a whole medium in through media/v1, a picture unless told, and answers its reference. */
export async function uploaded(
  client: MediaClient,
  tenant: Send['tenant'],
  upload: string,
  bytes: Uint8Array,
  mediaType = 'image/png',
): Promise<Reference> {
  const begun = await client['begin-upload']({
    tenant,
    upload,
    mediaType,
    bytes: bytes.byteLength,
  })
  if (begun.outcome !== 'succeeded' || begun.body.status.kind !== 'uploading')
    throw new Error(JSON.stringify(begun))
  const { partBytes } = begun.body.status
  for (let sequence = 0; sequence * partBytes < bytes.byteLength; sequence += 1) {
    const part = bytes.subarray(sequence * partBytes, (sequence + 1) * partBytes)
    const appended = await client['append-upload-part']({ tenant, upload, sequence, part })
    if (appended.outcome !== 'succeeded') throw new Error(JSON.stringify(appended))
  }
  const committed = await client['commit-upload']({ tenant, upload, digest: digestOf(bytes) })
  if (committed.outcome !== 'succeeded') throw new Error(JSON.stringify(committed))
  return committed.body.ref
}

export function treeOf(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(treeOf) }
  const entries = Object.entries(value as object).map(([key, item]) => ({
    key,
    value: treeOf(item),
  }))
  return { kind: 'object', entries }
}

/** One input of the logged-in member through session/v1, with the blocks given. */
export async function send(tree: ReleaseTree, session: string, input: string, blocks: unknown[]) {
  const message = treeOf({ id: await userMessageId(input), role: 'user', blocks })
  return tree.clients.session['send-input']({
    tenant: tenantOf(savedTenant(tree.home)),
    session: sessionRef(session),
    acceptId: `accept-${input}`,
    inputId: input,
    message,
  } as Send)
}

/** The names of the processors registered before intake in this tree, in the order they run. */
export function processors(tree: ReleaseTree): readonly string[] {
  const point = tree.scope.get(sessionBeforeIntakeKey)
  if (point === undefined) throw new Error('no registration point session.before-intake')
  return point.current().map(each => each.name)
}
