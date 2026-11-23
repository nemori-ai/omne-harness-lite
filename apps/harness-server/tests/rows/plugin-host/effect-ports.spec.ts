import { declare, empty, install, type Contract, type Registry } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import { serverPointsOf } from '../../../src/rows/plugin-host/effect-ports.ts'

const contract = (name: string, kind: Contract['item']['kind'], binding: Contract['binding']) =>
  ({
    name,
    tree: 'server',
    arity: 'keyed-one',
    keyFrom: null,
    key: 'a name',
    gives: 'nothing',
    item: { kind, fields: {} },
    resolve: 'most-specific',
    binding,
    onError: 'nothing',
    version: 1,
    revision: 1,
    keys: 'private',
    conformance: null,
    summary: `The ${name} point.`,
  }) satisfies Contract

function registryWith(contracts: readonly Contract[]): Registry {
  const made = install(
    empty,
    { fiber: 'test', generation: 1 },
    contracts.map(each => declare(each)),
  )
  if (made.kind !== 'installed') throw new Error(JSON.stringify(made))
  return made.registry
}

describe('the points of the server tree, as a plugin member is checked against them', () => {
  const registry = registryWith([
    contract('skill.skills', 'data', 'run'),
    contract('agent.agents', 'data', 'run'),
    contract('tool.cards', 'data', 'run'),
    contract('loop.steps', 'effect', 'build'),
  ])
  const listing = (creation: 'none' | 'data' | 'directory') => ({
    category: 'c',
    display: { title: 't', summary: 's' },
    creation,
    point: 'p',
  })
  const categories = {
    atPoint: (point: string) =>
      point === 'skill.skills'
        ? listing('directory')
        : point === 'agent.agents'
          ? listing('none')
          : undefined,
  }

  it('the point of a category takes what the category is made from; another takes data or code as declared', () => {
    expect(serverPointsOf(registry, categories)).toEqual([
      { name: 'agent.agents', side: 'server', takes: 'data', when: 'running' },
      { name: 'loop.steps', side: 'server', takes: 'code', when: 'build' },
      { name: 'skill.skills', side: 'server', takes: 'directory', when: 'running' },
      { name: 'tool.cards', side: 'server', takes: 'data', when: 'running' },
    ])
  })

  it('gives none when the tree is not there', () => {
    expect(serverPointsOf(undefined, categories)).toEqual([])
  })
})
