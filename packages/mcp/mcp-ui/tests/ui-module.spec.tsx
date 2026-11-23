// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { definePoint, partsOn, serviceKey, type AttachedEntry } from '@omne-harness/shell-contract'
import { provideOn } from '@omne-harness/shell-contract/testing'
import { createMcpUiModule, type McpGovernance } from '../src/cordis.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { TENANT, fakeGovernance, readOf } from './fixtures/fake-governance.tsx'
import { startShell as startBare, type ReferenceShell } from './fixtures/reference-shell.ts'

beforeAll(stubAnimation)

afterEach(cleanup)

const page = definePoint<Readonly<{ host: string }>>({
  name: 'test.category-page',
  subject: { encode: subject => subject.host, decode: host => ({ host }) },
})

/** The host of these points is not on this tree: the case stands in for it and declares them. */
async function startShell() {
  const started = await startBare()
  for (const point of [page]) point.declare(started.shell)
  return started
}
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
  await provideOn(root, governanceKey, fakeGovernance(readOf()).governance)
  await root.plugin(mcpUiModule)
  expect(entries(shell).map(({ id, label }) => ({ id, label }))).toEqual([
    { id: 'mcp', label: 'MCP' },
  ])
  expect(shell.items('pages')).toEqual([])
})

it('UI2 the page draws from the port the module was given, for the scope the shell gives', async () => {
  const { root, shell } = await startShell()
  const fake = fakeGovernance(readOf())
  await provideOn(root, governanceKey, fake.governance)
  await root.plugin(mcpUiModule)
  render(<>{entries(shell, TENANT)[0]!.node}</>)
  expect(fake.opened).toEqual([`mcp ${TENANT}`])
  expect(screen.getByText(/MCP 还没有接进这个应用/)).toBeTruthy()
})

it('UI3 no scope yet: nothing is drawn and the port is not opened', async () => {
  const { root, shell } = await startShell()
  const fake = fakeGovernance(readOf())
  await provideOn(root, governanceKey, fake.governance)
  await root.plugin(mcpUiModule)
  const view = render(<>{entries(shell)[0]!.node}</>)
  expect(view.container.textContent).toBe('')
  expect(fake.opened).toEqual([])
})

it('UI4 the port absent: the module is not adopted; it comes: the page is placed; it goes: the page goes', async () => {
  const { root, shell } = await startShell()
  await root.plugin(mcpUiModule)
  expect(entries(shell)).toEqual([])
  expect(shell.adoption('mcp-ui')).toMatchObject({ kind: 'unavailable' })
  let provided: Awaited<ReturnType<typeof provideOn>> | undefined
  await act(async () => {
    provided = await provideOn(root, governanceKey, fakeGovernance(readOf()).governance)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(entries(shell).map(entry => entry.id)).toEqual(['mcp'])
  await act(async () => {
    await provided?.dispose()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(entries(shell)).toEqual([])
})

it('M4 declares its three parts', async () => {
  const { root, shell } = await startShell()
  await provideOn(root, governanceKey, fakeGovernance(readOf()).governance)
  await root.plugin(mcpUiModule)
  const read = partsOn(shell.registry())
  expect(read.kind === 'read' && read.conflicts).toEqual([])
  expect(read.kind === 'read' && read.parts.map(part => [part.name, part.within])).toEqual([
    ['mcp.endpoint', 'mcp.page'],
    ['mcp.endpoint.permission', 'mcp.endpoint'],
    ['mcp.page', 'assets.panel'],
  ])
})
