import { describe, expect, it } from 'vitest'
import type { ResidentKey, ResidentTool } from '@omne-harness/session-contract'
import { creation, evidence, operationId, refused } from '@omne-harness/session-contract/testing'
import { decodeEntries, fromJsonValue, toJsonValue } from '../src/entries.ts'
import { scene } from './scene.ts'

const definition = toJsonValue({ name: 'kept__docs', commands: [{ name: 'ask' }] })
const keptTool: ResidentTool = {
  capability: 'kept__docs',
  version: 'sha256:docs-1',
  shape: toJsonValue({ name: 'kept__docs', commands: ['ask'] }),
  admitted: evidence('kept__docs@1'),
  definition,
}
const keyedTool: ResidentTool = {
  capability: 'Files',
  version: '1',
  shape: toJsonValue({ name: 'Files' }),
  admitted: evidence('Files@1'),
}
const key = (name: string) => name as ResidentKey

describe('a resident tool that carries its whole definition', () => {
  it('needs no binding key: the keys cover the residents of the registry only', async () => {
    const s = scene()
    await s.create(
      creation({
        residentAdoption: {
          residents: [keyedTool, keptTool],
          keys: [{ capability: 'Files', key: key('files') }],
        },
      }),
    )
    expect((await s.read()).residents).toEqual([keyedTool, keptTool])
  })

  it('a key for it is refused', async () => {
    const s = scene()
    const answer = await s.commit({
      kind: 'create',
      input: {
        ...s.base,
        operation: operationId('create'),
        creation: creation({
          residentAdoption: {
            residents: [keptTool],
            keys: [{ capability: 'kept__docs', key: key('docs') }],
          },
        }),
      },
    })
    expect(refused(answer, 'create')).toEqual(
      expect.objectContaining({ field: expect.stringContaining('residentAdoption') }),
    )
  })

  it('is stored once: the creation names the resident entry that holds the definition, and reads back whole', async () => {
    const s = scene()
    await s.create(creation({ residentAdoption: { residents: [keptTool], keys: [] } }))
    const history = s.port.controls.entriesOf(s.access.tenant, s.access.session)
    const row = history.find(entry => entry.kind === 'session.created')!
    const stored = fromJsonValue(row.payload) as {
      initialAdoption: { newResidents: { definition: unknown }[] }
    }
    expect(stored.initialAdoption.newResidents[0]!.definition).toBe(
      '=session.tool-resident-admitted',
    )
    const decoded = decodeEntries(history, null).flatMap(value => ('ok' in value ? [value.ok] : []))
    const made = decoded.find(entry => entry.kind === 'session.created')
    if (made?.kind !== 'session.created') throw new Error('session.created')
    expect(made.initialAdoption.newResidents).toEqual([keptTool])
  })
})
