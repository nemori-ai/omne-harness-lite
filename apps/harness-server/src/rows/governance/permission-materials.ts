import { GOVERNANCE_PUBLICATIONS } from './current-publications.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { assetsPublicationFact } from '@omne-harness/assets-local'
import { settingsAssetsProjectionFact } from '@omne-harness/settings-local'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { GOVERNED_PARTICIPANT, governedProtocol } from './governed-capabilities.ts'
import {
  DECISION_PARTICIPANT,
  PERMISSION_CURRENT,
  PERMISSION_RELEASES,
  PERMISSION_SUPPORT,
  SUPPORT_PARTICIPANT,
} from './permission-protocol.ts'

export function permissionSqlParticipants(): SqlMaterialCatalog['participants'] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  return [
    {
      ...SUPPORT_PARTICIPANT,
      file: 'permission-support-participant',
      requiresFacts: [PERMISSION_RELEASES],
      providesFacts: [PERMISSION_SUPPORT],
    },
    {
      ...DECISION_PARTICIPANT,
      file: 'permission-decision-participant',
      requiresFacts: [PERMISSION_SUPPORT, PERMISSION_CURRENT],
      providesFacts: [],
    },
  ].map(({ file, ...participant }) => {
    const url = new URL(`./${file}.${extension}`, import.meta.url)
    return {
      ...participant,
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
      ownedTables: [],
      readTables: [],
      allowedFunctions: [],
      grouping: 'groupable',
    }
  })
}

export function toolPermissionReleaseParticipant(
  release: Extract<ToolRelease, { kind: 'trusted' }>,
): SqlMaterialCatalog['participants'][number] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./tool-release-participant.${extension}`, import.meta.url)
  const url = new URL(file)
  url.searchParams.set('release', release.generation)
  return {
    participant: GOVERNED_PARTICIPANT,
    protocol: governedProtocol(release.generation),
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(file)).digest('hex'),
    ownedTables: [],
    readTables: [],
    requiresFacts: [assetsPublicationFact, settingsAssetsProjectionFact],
    providesFacts: [PERMISSION_RELEASES, GOVERNANCE_PUBLICATIONS],
    allowedFunctions: [],
    grouping: 'groupable',
  }
}
