import { describe, expect, it } from 'vitest'
import {
  deriveSessionOperation,
  type SessionTodos,
  type SessionRevision,
} from '@omne-harness/session-contract'
import { sessionId } from '@omne-harness/session-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createBoundTodoItems,
  type TodoBindingPorts,
} from '../../../src/rows/tool-bindings/todo-items.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'
import { fixtureTenant } from '../../entry/support.ts'

async function setup(command: string, business: object) {
  const world = await forwardWorld()
  const calls: { method: string; input: unknown }[] = []
  const work: SessionTodos<unknown> = {
    addTodo: async input => {
      calls.push({ method: 'add', input })
      return { failure: { kind: 'commit-unknown', operation: input.operation } }
    },
    removeTodo: async input => {
      calls.push({ method: 'remove', input })
      return { failure: { kind: 'todo-not-found', item: input.item } }
    },
    markTodoComplete: async input => {
      calls.push({ method: 'mark_complete', input })
      return { failure: { kind: 'todo-not-found', item: input.item } }
    },
    listTodos: async input => {
      calls.push({ method: 'list', input })
      return { ok: { revision: '1' as SessionRevision, items: [], next: null } }
    },
  }
  const ports: TodoBindingPorts = {
    verifier: () => world.fixture.root.get('principalVerifier'),
    work: () => work,
  }
  const wire = JSON.stringify({ command, params: business })
  const parent = {
    principal: world.principal,
    tenant: world.tenant,
    call: world.call,
    request: {
      ...world.request('TodoItems'),
      command,
      arguments: { original: wire, effective: wire, complete: true },
    },
  }
  let live = true
  return {
    ...world,
    parent,
    ports,
    calls,
    work,
    binding: createBoundTodoItems(parent, ports, () => live),
    finish: () => {
      live = false
    },
  }
}

describe('TodoItems production Session binding', () => {
  it('reports an intake-only failure as unavailable rather than a successful Todo reply', async () => {
    const w = await setup('add', { text: 'one' })
    try {
      w.work.addTodo = async () => ({
        failure: { kind: 'limited', resource: 'pending-inputs', limit: 1 },
      })
      expect(await w.binding.add({ text: 'one' })).toEqual({
        failure: {
          kind: 'unavailable',
          owner: 'todo-items',
          diagnostic: 'Session returned an unexpected Todo failure: limited',
        },
      })
    } finally {
      await w.close()
    }
  })
  it('derives the operation from the fixed tenant, Session and Tool call, including an unknown retry', async () => {
    const w = await setup('add', { text: 'Keep  exact  text' })
    try {
      const one = await w.binding.add({ text: 'Keep  exact  text' })
      const two = await w.binding.add({ text: 'Keep  exact  text' })
      expect(two).toEqual(one)
      const tenant = tenantCodec.encode(w.tenant)
      if (!tenant.ok) throw new Error('fixture tenant')
      const operation = deriveSessionOperation({
        kind: 'todo-tool-call',
        tenant: tenant.value,
        session: sessionId('forward-test'),
        call: w.call,
      })
      expect(one).toEqual({ failure: { kind: 'commit-unknown', operation } })
      expect(w.calls).toHaveLength(2)
      expect(w.calls[0]?.input).toEqual({
        principal: w.principal,
        tenant: w.tenant,
        session: 'forward-test',
        operation,
        text: 'Keep  exact  text',
      })
      expect(w.calls[1]).toEqual(w.calls[0])
    } finally {
      await w.close()
    }
  })

  it('cannot change the fixed command, text or add an operation identity', async () => {
    const w = await setup('add', { text: 'one' })
    try {
      expect(await w.binding.add({ text: 'two' })).toMatchObject({ failure: { kind: 'denied' } })
      expect(await w.binding.remove({ item: 'one' })).toMatchObject({ failure: { kind: 'denied' } })
      expect(
        await w.binding.add({ text: 'one', operation: 'caller-chosen' } as { text: string }),
      ).toMatchObject({ failure: { kind: 'denied' } })
      expect(w.calls).toEqual([])
    } finally {
      await w.close()
    }
  })

  it('rejects a foreign tenant and a retained capability after execution finishes', async () => {
    const w = await setup('add', { text: 'one' })
    try {
      const foreign = createBoundTodoItems(
        { ...w.parent, tenant: fixtureTenant('b') },
        w.ports,
        () => true,
      )
      expect(await foreign.add({ text: 'one' })).toMatchObject({ failure: { kind: 'denied' } })
      w.finish()
      expect(await w.binding.add({ text: 'one' })).toMatchObject({
        failure: { kind: 'unavailable' },
      })
      expect(w.calls).toEqual([])
    } finally {
      await w.close()
    }
  })

  it('normalizes list defaults but does not change a supplied limit or cursor', async () => {
    const w = await setup('list', {})
    try {
      expect(await w.binding.list({ after: null, limit: 50 })).toEqual({
        ok: { revision: '1', items: [], next: null },
      })
      expect(w.calls[0]).toEqual({
        method: 'list',
        input: {
          principal: w.principal,
          tenant: w.tenant,
          session: 'forward-test',
          after: null,
          limit: 50,
        },
      })
      expect(await w.binding.list({ after: null, limit: 100 })).toMatchObject({
        failure: { kind: 'denied' },
      })
      expect(w.calls).toHaveLength(1)
    } finally {
      await w.close()
    }
  })

  it.each(['remove', 'mark_complete'])(
    'routes %s to the original Session and preserves the domain refusal',
    async command => {
      const w = await setup(command, { item: 'removed' })
      try {
        const answer =
          command === 'remove'
            ? await w.binding.remove({ item: 'removed' })
            : await w.binding.markComplete({ item: 'removed' })
        expect(answer).toEqual({ failure: { kind: 'todo-not-found', item: 'removed' } })
        expect(w.calls[0]).toMatchObject({
          method: command,
          input: { session: 'forward-test', item: 'removed' },
        })
      } finally {
        await w.close()
      }
    },
  )

  it('keeps the operation uncertain if a mutation port throws after it may have committed', async () => {
    const w = await setup('add', { text: 'one' })
    try {
      w.work.addTodo = async input => {
        w.calls.push({ method: 'add', input })
        throw new Error('ack lost')
      }
      const answer = await w.binding.add({ text: 'one' })
      expect(answer).toMatchObject({ failure: { kind: 'commit-unknown' } })
      expect(w.calls).toHaveLength(1)
      const first = w.calls[0]
      if (first === undefined) throw new Error('The mutation was not called')
      expect(answer).toEqual({
        failure: {
          kind: 'commit-unknown',
          operation: (first.input as { operation: string }).operation,
        },
      })
    } finally {
      await w.close()
    }
  })

  it('does not call Session when its current port is absent', async () => {
    const w = await setup('add', { text: 'one' })
    try {
      const bound = createBoundTodoItems(
        w.parent,
        { ...w.ports, work: () => undefined },
        () => true,
      )
      expect(await bound.add({ text: 'one' })).toMatchObject({ failure: { kind: 'unavailable' } })
      expect(w.calls).toEqual([])
    } finally {
      await w.close()
    }
  })
})
