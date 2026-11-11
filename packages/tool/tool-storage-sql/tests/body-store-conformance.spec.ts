// The ToolBodyStore suite against the SQL body store over the SQLite test provider. The store
// clock is a manual clock the suite moves; `crash` closes the storage and reopens the same files
// with a new adapter, so process state is lost and only the committed rows remain.
import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createManualInstantClock,
  instantAt,
  runConformanceCase,
  toolBodyStoreConformance,
  type ToolBodyStoreFixture,
} from '@omne-harness/tool-contract/testing'
import { createSqlToolBodyStore, type SqlToolBodyStore } from '../src/index.ts'
import { openApp, TENANT_A, TENANT_B, type App } from './fixtures/app.ts'

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

async function fixture(): Promise<ToolBodyStoreFixture> {
  const permitKey = { secret: randomBytes(32) }
  const clock = createManualInstantClock(instantAt(0))
  let app = await openApp({ keep: true })
  opened.push(app)
  const over = (current: App): SqlToolBodyStore =>
    createSqlToolBodyStore({ ...current.options, permitKey, clock })
  let store = over(app)
  return {
    get store() {
      return store
    },
    key: permitKey,
    tenant: TENANT_A,
    otherTenant: TENANT_B,
    setStoreClock: now => clock.set(now),
    crash: async () => {
      const directory = app.directory
      app.close()
      app = await openApp({ directory })
      opened.push(app)
      store = over(app)
    },
  }
}

describe('ToolBodyStore conformance on the SQL body store', () => {
  const cases = toolBodyStoreConformance()
  it('has cases', () => {
    expect(cases.length).toBeGreaterThan(0)
  })
  it.each(cases)('$clause $name', async conformance => {
    expect(await runConformanceCase(conformance, await fixture())).toEqual({ kind: 'passed' })
  })
})

it('the store declares itself durable: a production assembly may use it', async () => {
  const app = await openApp()
  opened.push(app)
  expect(
    createSqlToolBodyStore({
      ...app.options,
      permitKey: { secret: randomBytes(32) },
      clock: createManualInstantClock(instantAt(0)),
    }).durability,
  ).toBe('durable')
})
