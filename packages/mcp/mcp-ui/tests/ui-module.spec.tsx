// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { definePoint, serviceKey, type AttachedEntry } from '@omne-harness/shell-contract'
import { createMcpUiModule, type McpGovernance } from '../src/cordis.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { TENANT, fakeGovernance, readOf } from './fixtures/fake-governance.tsx'
import { startShell, type ReferenceShell } from './fixtures/reference-shell.ts'

beforeAll(stubAnimation)

afterEach(cleanup)

const page = definePoint<Readonly<{ host: string }>>({
  name: 'test.category-page',
  subject: { encode: subject => subject.host, decode: host => ({ host }) },
})
const governanceKey = serviceKey<McpGovernance>('test.governance')
const mcpUiModule = createMcpUiModule({ page, governance: governanceKey })

const entries = (shell: ReferenceShell, scope?: string): AttachedEntry[] => {
  shell.tenant = scope
  let laid: readonly AttachedEntry[] = []
  page.slot(shell, { host: 'assets' }, layout => {
    laid = layout
    return null
  })
  return [...laid]
}

it('UI1 the port present: one MCP page at the category-page point, labelled by MCP itself', async () => {
  const { root, shell } = await startShell()
  root.reflect.provide(governanceKey, fakeGovernance(readOf()).governance)
  await root.plugin(mcpUiModule)
  expect(entries(shell).map(({ id, label }) => ({ id, label }))).toEqual([
    { id: 'mcp', label: 'MCP' },
  ])
  expect(shell.items('pages')).toEqual([])
})

it('UI2 the page draws from the port the module was given, for the scope the shell gives', async () => {
  const { root, shell } = await startShell()
  const fake = fakeGovernance(readOf())
  root.reflect.provide(governanceKey, fake.governance)
  await root.plugin(mcpUiModule)
  render(<>{entries(shell, TENANT)[0]!.node}</>)
  expect(fake.opened).toEqual([`mcp ${TENANT}`])
  expect(screen.getByText(/MCP 还没有接进这个应用/)).toBeTruthy()
})

it('UI3 no scope yet: nothing is drawn and the port is not opened', async () => {
  const { root, shell } = await startShell()
  const fake = fakeGovernance(readOf())
  root.reflect.provide(governanceKey, fake.governance)
  await root.plugin(mcpUiModule)
  const view = render(<>{entries(shell)[0]!.node}</>)
  expect(view.container.textContent).toBe('')
  expect(fake.opened).toEqual([])
})

it('UI4 the port absent: the module waits; it comes: the page is placed; it goes: the page goes', async () => {
  const { root, shell } = await startShell()
  await root.plugin(mcpUiModule)
  expect(entries(shell)).toEqual([])
  let withdraw: () => void = () => undefined
  await act(async () => {
    withdraw = root.reflect.provide(governanceKey, fakeGovernance(readOf()).governance)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(entries(shell).map(entry => entry.id)).toEqual(['mcp'])
  await act(async () => {
    withdraw()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(entries(shell)).toEqual([])
})
