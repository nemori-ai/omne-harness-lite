// @vitest-environment happy-dom
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { act, cleanup, render, screen } from '@testing-library/react'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { sessionProtocol } from '@omne-harness/session-protocol'
import type { ShellLogin } from '@omne-harness/shell-contract'
import { workspaceProtocol } from '@omne-harness/workspace-protocol'
import { afterEach, describe, expect, it } from 'vitest'
import { assembly } from '../src/page/assembly.tsx'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { DesktopShell, shellPlugin } from '../src/page/shell/service.ts'
import { createShellState } from '../src/page/shell/state.ts'
import { domainProtocols } from '../src/shared/protocols.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const WORKSPACE_PARTS = new Set(['workspace-ui'])

afterEach(cleanup)

const settle = () =>
  act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })

const login: ShellLogin = {
  state: () => 'signed-in',
  subscribe: () => () => undefined,
  login: async () => 'signed-in',
  logout: async () => 'signed-out',
}

// A session client that never answers: the session list stays loading, which is all it needs.
const silent = () =>
  new Proxy({}, { get: (_, name) => (name === 'observe' ? {} : () => new Promise(() => {})) })

const workspaceClient = () => ({
  list: async () => ({
    outcome: 'succeeded',
    body: { workspaces: [{ workspace: 'wsp_blog', type: 'filesystem', standing: 'owner' }] },
  }),
  describe: async () => ({
    outcome: 'succeeded',
    body: {
      workspace: 'wsp_blog',
      type: 'filesystem',
      standing: 'owner',
      instances: [
        {
          instance: 'wsi_main',
          address: '/srv/blog',
          availability: { kind: 'available', directory: '/srv/blog', basis: 'b' },
        },
      ],
    },
  }),
})

async function mounted(modules: readonly Plugin.Object[], withWorkspace: boolean) {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(shellPlugin(createShellState(login)))
  await serveProtocol(root, sessionProtocol, silent())
  if (withWorkspace) await serveProtocol(root, workspaceProtocol, workspaceClient())
  for (const module of modules) await root.plugin(module)
  const shell = root.get('shell') as unknown as DesktopShell
  const sidebar = shell.items('sidebar').find(item => item.id === 'session-list')!
  render(<>{sidebar.render({ scope: TENANT })}</>)
  await settle()
  return shell
}

const sessionParts = (keep: (name: string) => boolean) =>
  assembly.modules.filter(module => {
    const name = module.name ?? ''
    return name === 'session-ui' || (WORKSPACE_PARTS.has(name) && keep(name))
  })

describe('the desktop assembly and the workspace', () => {
  it('lists the workspace module and its protocol, and no plugin that hands things over', () => {
    const names = assembly.modules.map(module => module.name ?? '')
    expect(names).toContain('workspace-ui')
    expect(names.filter(name => name.startsWith('hand-over'))).toEqual([])
    expect(domainProtocols).toContain(workspaceProtocol)
  })

  it('with the workspace: a new session can be started in an instance, and the page is there', async () => {
    const shell = await mounted(
      sessionParts(() => true),
      true,
    )
    expect(await screen.findByRole('combobox', { name: '新会话的工作区' })).toBeTruthy()
    expect(shell.items('pages').map(page => page.id)).toEqual([
      'conversation',
      'history-search',
      'workspaces',
    ])
  })

  it('without the workspace module and protocol: the session interface is as before', async () => {
    const shell = await mounted(
      sessionParts(() => false),
      false,
    )
    expect(screen.getByRole('button', { name: '新建会话' })).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: '新会话的工作区' })).toBeNull()
    expect(shell.items('pages').map(page => page.id)).toEqual(['conversation', 'history-search'])
  })

  it('the module listed but the protocol not mounted: the session interface is as before, and the workspaces page is there as what it lacks', async () => {
    const shell = await mounted(
      sessionParts(() => true),
      false,
    )
    expect(screen.queryByRole('combobox', { name: '新会话的工作区' })).toBeNull()
    expect(shell.items('pages').map(page => page.id)).toEqual([
      'conversation',
      'history-search',
      'workspaces',
    ])
    expect(shell.lacks('pages', 'conversation')).toEqual([])
    expect(shell.lacks('pages', 'workspaces')).toEqual([{ kind: 'connecting' }])
    expect(shell.adoption('workspace-ui')).toMatchObject({
      kind: 'unavailable',
      missing: [{ slot: 'workspace', reference: { anyOf: ['workspace/v1'] } }],
    })
  })
})
