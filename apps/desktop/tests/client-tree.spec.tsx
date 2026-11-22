// @vitest-environment happy-dom
import { Context } from '@deepseek-ai/cordis'
import { serverPointsContract } from '@omne-harness/client-assembly'
import { deployment, render, tree } from '@omne-harness/dynamis'
import type { ShellLogin } from '@omne-harness/shell-contract'
import { servePoint, serveProtocol } from '@omne-harness/shell-contract/testing'
import { expect, it, vi } from 'vitest'
import { assembly } from '../src/page/assembly.tsx'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { shellPlugin } from '../src/page/shell/service.ts'
import { createShellState } from '../src/page/shell/state.ts'
import { quietConnection } from './support/shell-setup.tsx'

const login: ShellLogin = {
  state: () => 'signed-in',
  subscribe: () => () => undefined,
  login: async () => 'signed-in',
  logout: async () => 'signed-out',
}

// A client that never answers: every module loads, which is all the tree needs.
const silent = () =>
  new Proxy({}, { get: (_, name) => (name === 'observe' ? {} : () => new Promise(() => {})) })

const settle = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

async function clientTree() {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(shellPlugin(createShellState(login)))
  root.reflect.provide('connection', quietConnection)
  await servePoint(root, serverPointsContract, {
    keys: () => undefined,
    subscribe: () => () => undefined,
  })
  for (const protocol of assembly.protocols) await serveProtocol(root, protocol, silent())
  for (const module of assembly.modules) await root.plugin(module)
  await settle()
  return tree(root.dynamis.registry(), deployment)
}

it('桌面装配的整棵客户端树：三个外壳位置与 13 个界面拓展点都声明了，问题一栏是空的（FE-I39）', async () => {
  const client = await clientTree()
  expect(client.problems).toEqual([])
  await expect(`${render(client.root)}\n`).toMatchFileSnapshot('./client-tree.txt')
})

it('每个点由一个宿主声明，点的名字以宿主开头', async () => {
  const client = await clientTree()
  const points: string[] = []
  const walk = (node: (typeof client)['root']): void => {
    if (node.kind === 'point') points.push(node.label)
    node.children.forEach(walk)
  }
  walk(client.root)
  expect(points.toSorted()).toEqual([
    'assets.category',
    'assets.category-page',
    'assets.governance',
    'assets.holding',
    'connection.protocols',
    'connection.server-points',
    'dynamis.points',
    'human-intervention.release-detail',
    'model.choices',
    'notification.inbox-sections',
    'session.block',
    'session.block-reads-source',
    'session.call-detail',
    'session.composer-attachments',
    'session.composer-intake',
    'session.dock',
    'session.side',
    'session.status',
    'shell.gate',
    'shell.pages',
    'shell.parts',
    'shell.sidebar',
    'usage.presentation',
    'usage.widget',
    'workspace.choices',
  ])
})

it('往没有声明的点上放东西：它不生效，树的问题一栏写出这个点', async () => {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(shellPlugin(createShellState(login)))
  await root.plugin({
    name: 'forgetful',
    inject: ['shell'],
    apply: ctx =>
      ctx.shell.contribute('attached', {
        id: 'x',
        order: 0,
        anchor: 'ghost.point',
        render: () => null,
      }),
  })
  expect(root.shell.items('attached')).toEqual([])
  expect(tree(root.dynamis.registry(), deployment).problems).toEqual([
    { kind: 'stray', point: 'ghost.point', detail: 'forgetful' },
  ])
})

it('树上每出现一个问题，外壳往日志里记一条错误，同一个问题只记一次', async () => {
  const root = new Context()
  const logged = vi.spyOn(root.logger, 'error').mockImplementation(() => undefined)
  await root.plugin(DynamisService)
  await root.plugin(shellPlugin(createShellState(login)))
  const stray = (name: string, id: string) =>
    root.plugin({
      name,
      inject: ['shell'],
      apply: ctx =>
        ctx.shell.contribute('attached', {
          id,
          order: 0,
          anchor: 'ghost.point',
          render: () => null,
        }),
    })
  await stray('forgetful', 'x')
  await stray('other', 'y')
  const problems = logged.mock.calls.map(([text]) => text).filter(text => text.includes('ghost'))
  expect(problems).toEqual(['shell: the point ghost.point has a problem (stray): forgetful'])
})
