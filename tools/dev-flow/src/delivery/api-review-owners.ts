import { IntegrationError, array, fields, literal, string } from '../integration/parse.ts'
import type { OwnerIdentityFact, OwnerIdentityManifest } from './api-review-types.ts'
import { LINES_PATH, lineId, type DeliveryLines } from './lines.ts'
import { InputError } from './protocol.ts'
import { strictJson } from './strict-json.ts'

/** The only file that owns per-line owner identity facts for the API review mechanism. */
export const OWNER_IDENTITY_PATH = 'docs/engineering/api-review-owners.json'

export type { OwnerIdentityFact, OwnerIdentityManifest }
/** One drift finding; `at` locates the entry as a JSON path into the manifest. */
export type OwnerIdentityDrift = { code: 'owner-identity-drift'; at: string; message: string }

function digest(value: unknown, path: string): string {
  const result = string(value, path)
  if (!/^[0-9a-f]{64}$/.test(result))
    throw new IntegrationError('input-error', `${path} must be 64 lowercase hexadecimal digits`)
  return result
}
function parseFact(value: unknown, index: number): OwnerIdentityFact {
  const at = `owners[${index}]`
  const v = fields(value, ['lineId', 'owner', 'adoption'], at)
  const owner = fields(v.owner, ['login', 'nodeId'], `${at}.owner`)
  const adoption = fields(v.adoption, ['comment', 'authorNodeId'], `${at}.adoption`)
  const comment = fields(
    adoption.comment,
    ['url', 'bodySha256', 'updatedAt'],
    `${at}.adoption.comment`,
  )
  return {
    lineId: lineId(v.lineId, `${at}.lineId`),
    owner: {
      login: string(owner.login, `${at}.owner.login`),
      nodeId: string(owner.nodeId, `${at}.owner.nodeId`),
    },
    adoption: {
      comment: {
        url: string(comment.url, `${at}.adoption.comment.url`),
        bodySha256: digest(comment.bodySha256, `${at}.adoption.comment.bodySha256`),
        updatedAt: string(comment.updatedAt, `${at}.adoption.comment.updatedAt`),
      },
      authorNodeId: string(adoption.authorNodeId, `${at}.adoption.authorNodeId`),
    },
  }
}

/**
 * Strictly parses the identity file text. Duplicate keys, unknown keys, missing keys, wrong
 * types, duplicate or unsorted lineIds are all refused with an `IntegrationError`.
 */
export function parseOwnerIdentityManifest(source: string): OwnerIdentityManifest {
  let value: unknown
  try {
    value = strictJson(source, OWNER_IDENTITY_PATH)
  } catch (error) {
    if (error instanceof InputError) throw new IntegrationError('input-error', error.message)
    throw error
  }
  const v = fields(value, ['schemaVersion', 'repository', 'owners'], 'owner-identity')
  const repository = fields(v.repository, ['name', 'nodeId'], 'repository')
  const owners = array(v.owners, 'owners').map(parseFact)
  owners.forEach((fact, index) => {
    const previous = owners[index - 1]
    if (previous === undefined) return
    if (previous.lineId === fact.lineId)
      throw new IntegrationError('input-error', `owners[${index}].lineId duplicates ${fact.lineId}`)
    if (previous.lineId > fact.lineId)
      throw new IntegrationError('input-error', `owners[${index}].lineId is not sorted`)
  })
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    repository: {
      name: string(repository.name, 'repository.name'),
      nodeId: string(repository.nodeId, 'repository.nodeId'),
    },
    owners,
  }
}

/**
 * Finds identity entries that disagree with the same-tree line table: a lineId the table does
 * not list, or an owner login that is not byte-equal to the table owner. A table line without
 * an entry is not drift.
 */
export function ownerIdentityDrift(
  manifest: OwnerIdentityManifest,
  lines: DeliveryLines,
): OwnerIdentityDrift[] {
  const found: OwnerIdentityDrift[] = []
  manifest.owners.forEach((fact, index) => {
    const at = `owners[${index}]`
    const line = lines.lines.find(candidate => candidate.id === fact.lineId)
    if (line === undefined)
      found.push({
        code: 'owner-identity-drift',
        at,
        message: `line ${fact.lineId} is not in ${LINES_PATH}`,
      })
    else if (line.owner !== fact.owner.login)
      found.push({
        code: 'owner-identity-drift',
        at,
        message: `line ${fact.lineId} owner ${line.owner} differs from identity login ${fact.owner.login}`,
      })
  })
  return found
}
