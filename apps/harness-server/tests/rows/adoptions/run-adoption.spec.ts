// @module-tag slow
// Starts the rows that hold the table and the adoption source, and asks what a run that starts now adopts.
import type { Adoption, RunId, WorkSnapshot } from '@omne-harness/session-contract'
import { describe, expect, it } from 'vitest'
import { HELD_DEFINITION_OWNER } from '../../../src/rows/agent-adoptions/held-definitions.ts'
import { access, candidateOf, mappingConfig, withLiveTree } from './support.ts'

const run = 'run-1' as RunId

/** A session that stands at one candidate of a definition; it keeps no resident and has no workspace. */
const standingAt = (name: string, adopted: Adoption): WorkSnapshot =>
  ({
    definition: { name, adopted },
    residents: [],
    residentKeys: [],
    creation: { workspace: null, workspaceAttachment: null },
    declarations: [],
  }) as unknown as WorkSnapshot

describe('what a run that starts now adopts', () => {
  it(
    'is the candidate the session stands at while the table still gives it, and the one of the table when it gives another',
    { tags: ['slow'] },
    async () => {
      const { value } = await withLiveTree(mappingConfig(), async ({ source }) => ({
        same: await source.forRun(access, { work: standingAt('alpha', candidateOf('alpha')), run }),
        stale: await source.forRun(access, {
          work: standingAt('alpha', {
            ...candidateOf('alpha'),
            digest: 'sha256:before-the-upgrade',
          }),
          run,
        }),
      }))
      expect(value.same).toEqual({ ok: { kind: 'adopt', candidate: candidateOf('alpha') } })
      expect(value.stale).toEqual({ ok: { kind: 'adopt', candidate: candidateOf('alpha') } })
    },
  )

  it(
    'is not known, and the run does not start, for a definition the deployment does not bring while the assets of the tenant cannot be read',
    { tags: ['slow'] },
    async () => {
      const held = {
        owner: HELD_DEFINITION_OWNER,
        name: 'reviewer',
        revision: 'AgentDefinition/reviewer',
        digest: 'sha256:v1',
      }
      const { value } = await withLiveTree(mappingConfig(), ({ source }) =>
        source.forRun(access, { work: standingAt('reviewer', held), run }),
      )
      expect(value).toMatchObject({
        failure: { kind: 'unavailable', diagnostic: 'the assets of the tenant cannot be read' },
      })
    },
  )
})
