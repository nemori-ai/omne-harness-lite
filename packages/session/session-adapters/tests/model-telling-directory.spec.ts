import { expect, it } from 'vitest'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import { createModelTelling } from '../src/cordis/model-telling.ts'
import type { StepDirectoryInput } from '../src/cordis/working-directory-step.ts'

const access = memoryAccess('telling-directory')
const book = { ...access, tenantText: 'tenant', published: null }
const STEP = [{ facts: [{ kind: 'step.begun' }] }] as never
const OTHER = [{ facts: [{ kind: 'message' }] }] as never

function telling() {
  const refreshed: StepDirectoryInput<string>[] = []
  const actions = createModelTelling<string, typeof book>({
    storage: undefined as never,
    combination: undefined as never,
    generations: undefined as never,
    read: async () => ({ ok: null }),
    directory: {
      refresh: async input => {
        refreshed.push(input)
        return { kind: 'refreshed' }
      },
    },
  })
  const before = (snapshot: WorkSnapshot | null, appended: never = STEP) =>
    actions.beforeStep(book, undefined as never, access, { snapshot, commands: [] }, appended)
  return { before, refreshed }
}

const scoped = (ended: unknown) =>
  ({ contextScopes: [{ generation: '1', scope: 'scope-1', ended }] }) as unknown as WorkSnapshot

const failed = (diagnostic: string) => ({
  kind: 'answer',
  value: { failure: { kind: 'unavailable', owner: 'session-log-journal', diagnostic } },
})

it('settles the working directory of the open scope of the session, for the writer of the step', async () => {
  const { before, refreshed } = telling()
  const snapshot = scoped(null)
  expect(await before(snapshot)).toBeNull()
  expect(refreshed).toEqual([
    {
      principal: access.principal,
      tenant: access.tenant,
      session: access.session,
      scope: { ref: 'scope-1' },
      snapshot,
    },
  ])
  expect(await before(snapshot, OTHER)).toBeNull()
  expect(refreshed).toHaveLength(1)
})

it('fails the step without settling anything when there is no snapshot or no open scope', async () => {
  const { before, refreshed } = telling()
  expect(await before(null)).toEqual(
    failed('no Session snapshot to take the working directory from'),
  )
  expect(await before(scoped({ commit: 'ended' }))).toEqual(
    failed('the session has no open context scope'),
  )
  expect(refreshed).toEqual([])
})
