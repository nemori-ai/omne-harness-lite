import { once } from 'node:events'
import { sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { beforeAll, expect, it } from 'vitest'
import { z } from 'zod'
import { GOVERNANCE_PUBLICATIONS } from '../../../dist/rows/governance/current-publications.js'
import { toolPermissionReleaseParticipant } from '../../../dist/rows/governance/permission-materials.js'
import { PERMISSION_RELEASES } from '../../../dist/rows/governance/permission-protocol.js'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import {
  locateReleasePackages,
  type ToolReleaseSnapshot,
} from '../../../src/entry/tool-release-manifest.ts'
import { toolAssetPublication } from '../../../src/rows/governance/tool-assets.ts'

type Probe = Readonly<{
  outcome: unknown
  provided: readonly Readonly<{ key: unknown; value: string }>[]
  resolved: readonly string[]
}>

const MEMBER = fileURLToPath(new URL('../../..', import.meta.url))
const PROBE = new URL('./release-participant-probe.mjs', import.meta.url)

let release: Extract<ToolReleaseSnapshot, { kind: 'trusted' }>
let moduleUrl: URL

beforeAll(async () => {
  const loaded = await loadProductionRelease()
  if (loaded.kind !== 'trusted') throw new Error(`the release is ${loaded.diagnostic}`)
  release = loaded
  moduleUrl = new URL(toolPermissionReleaseParticipant(release).moduleUrl)
})

async function probe(href: string): Promise<Probe> {
  const worker = new Worker(PROBE, { workerData: { href } })
  try {
    const [message] = (await once(worker, 'message')) as [Probe]
    return message
  } finally {
    await worker.terminate()
  }
}

it('provides the same release facts, byte for byte, as the trusted release of the main thread', async () => {
  const { entries } = release.manifest
  const { outcome, provided } = await probe(moduleUrl.href)
  expect(outcome).toEqual({ kind: 'participated', response: null })
  expect(provided).toEqual([
    {
      key: PERMISSION_RELEASES,
      value: JSON.stringify(entries.flatMap(entry => entry.governance.interpretations)),
    },
    {
      key: GOVERNANCE_PUBLICATIONS,
      value: JSON.stringify(
        z.json().parse(
          entries.map(entry => ({
            publication: { kind: 'asset', reference: toolAssetPublication(entry).publicationRef },
            declaration: entry.governance.declaration,
          })),
        ),
      ),
    },
  ])
})

it('answers unsupported and provides nothing when the pinned generation differs in one digit', async () => {
  const other = new URL(moduleUrl)
  const pinned = other.searchParams.get('release') ?? ''
  other.searchParams.set('release', `${pinned.slice(0, -1)}${pinned.endsWith('0') ? '1' : '0'}`)
  expect(await probe(other.href)).toMatchObject({
    outcome: { kind: 'unsupported', basis: { reason: 'tool-release-unavailable' } },
    provided: [],
  })
})

it('loads no module of a release tool package', async () => {
  const roots = Object.values(await locateReleasePackages(MEMBER))
  const { resolved } = await probe(moduleUrl.href)
  const inRelease = resolved
    .filter(url => url.startsWith('file:'))
    .map(url => fileURLToPath(url))
    .filter(path => roots.some(root => path.startsWith(`${root}${sep}`)))
  expect(inRelease).toEqual([])
})
