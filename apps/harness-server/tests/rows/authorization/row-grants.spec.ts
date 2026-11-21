import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { DISPATCH_COMPONENT } from '../../../src/rows/authorization/grants.ts'
import { installRowGrant, rowGrantInstalled } from '../../../src/rows/authorization/row-grants.ts'

const installing = {
  name: 'installs-the-grant',
  apply: (ctx: Context) => installRowGrant(ctx, DISPATCH_COMPONENT),
}

describe('a grant a row installs', () => {
  it('is installed while the scope of the row lives, and is gone when the scope is disposed', async () => {
    const root = new Context()
    expect(rowGrantInstalled(root, DISPATCH_COMPONENT)).toBe(false)
    const row = await root.plugin(installing)
    expect(rowGrantInstalled(root, DISPATCH_COMPONENT)).toBe(true)
    expect(rowGrantInstalled(row.ctx, DISPATCH_COMPONENT)).toBe(true)
    await row.dispose()
    expect(rowGrantInstalled(root, DISPATCH_COMPONENT)).toBe(false)
  })

  it('stays installed until the last scope that installed it is disposed', async () => {
    const root = new Context()
    const first = await root.plugin({ ...installing, name: 'first' })
    const second = await root.plugin({ ...installing, name: 'second' })
    await first.dispose()
    expect(rowGrantInstalled(root, DISPATCH_COMPONENT)).toBe(true)
    await second.dispose()
    expect(rowGrantInstalled(root, DISPATCH_COMPONENT)).toBe(false)
  })

  it('is installed on one tree only', async () => {
    const root = new Context()
    await root.plugin(installing)
    expect(rowGrantInstalled(new Context(), DISPATCH_COMPONENT)).toBe(false)
    expect(rowGrantInstalled(root, 'agent-host')).toBe(false)
  })
})
