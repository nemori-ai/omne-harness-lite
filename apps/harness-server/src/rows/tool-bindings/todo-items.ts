import type { Context } from '@deepseek-ai/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { readJsonText } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  deriveSessionOperation,
  type SessionFailure,
  type SessionId,
  type SessionRevision,
  type SessionTodos,
  type TodoItemId,
  type TodoPageCursor,
} from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import {
  commandArguments,
  type CallAccess,
  type ToolExecutionScope,
} from '@omne-harness/tool-contract/provider'
import {
  attachTodoItems,
  type BoundTodoItems,
  type TodoAuthorCursor,
  type TodoAuthorFailure,
  type TodoAuthorReply,
} from '@omne-harness/tool-definitions'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { verifySessionWork } from '../tool-runtime/session-work.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>
export type TodoBindingPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  work(): SessionTodos<unknown> | undefined
}>
const unavailable = (diagnostic: string): TodoAuthorReply => ({
  failure: { kind: 'unavailable', owner: 'todo-items', diagnostic },
})
const denied = (): TodoAuthorReply => ({ failure: { kind: 'denied', action: 'todo-items' } })

function failure(value: SessionFailure): TodoAuthorFailure {
  switch (value.kind) {
    case 'denied':
    case 'invalid':
    case 'todo-not-found':
    case 'conflict':
    case 'changed':
    case 'commit-unknown':
    case 'unavailable':
    case 'quarantined':
    case 'frozen':
      return value
    case 'archived':
      return { kind: 'archived' }
    case 'not-ready':
      return { kind: 'not-ready' }
    case 'unsupported':
    case 'terminal':
    case 'stale-advance':
    case 'no-input':
    case 'run-active':
    case 'login-required':
      return {
        kind: 'unavailable',
        owner: 'todo-items',
        diagnostic: `Session returned an unexpected Todo failure: ${value.kind}`,
      }
  }
}

function fixedArguments(parent: Parent): unknown {
  const selected = commandArguments(
    parent.request.availability.definition,
    parent.request.command,
    parent.request.arguments,
  )
  if ('failure' in selected || !selected.ok.complete || selected.ok.effective === null) return null
  const parsed = readJsonText(selected.ok.effective, {
    maxBytes: 65_536,
    maxDepth: 16,
    maxItems: 1024,
    maxMembers: 32,
    maxStringLength: 32_768,
    maxNumberLength: 64,
  })
  if (parsed.kind !== 'ok' || parsed.value.kind !== 'object') return null
  const value: unknown = JSON.parse(selected.ok.effective)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  if (parent.request.command !== 'list') return value
  return {
    ...value,
    after: Object.hasOwn(value, 'after') ? Reflect.get(value, 'after') : null,
    limit: Object.hasOwn(value, 'limit') ? Reflect.get(value, 'limit') : 50,
  }
}

/** DTO cursor text is checked for ownership and revision again by Session.listTodos. */
function cursorOf(cursor: TodoAuthorCursor | null): TodoPageCursor | null {
  return cursor === null
    ? null
    : {
        tenant: cursor.tenant,
        session: cursor.session as SessionId,
        revision: cursor.revision as SessionRevision,
        after: cursor.after as TodoItemId,
      }
}

export function createBoundTodoItems(
  parent: Parent,
  ports: TodoBindingPorts,
  live: () => boolean,
): BoundTodoItems {
  const original = fixedArguments(parent)
  const run = async (
    command: string,
    business: unknown,
    apply: (
      work: SessionTodos<unknown>,
      access: CallAccess<unknown> & { session: SessionId },
    ) => Promise<TodoAuthorReply>,
  ): Promise<TodoAuthorReply> => {
    if (!live()) return unavailable('The Todo execution has ended.')
    if (
      original === null ||
      command !== parent.request.command ||
      canonicalDigest(original) !== canonicalDigest(business)
    )
      return denied()
    try {
      const verified = await verifySessionWork(ports.verifier(), parent.principal, parent.tenant)
      if (!live()) return unavailable('The Todo execution has ended.')
      if (verified.kind === 'denied') return denied()
      if (verified.kind === 'unavailable') return unavailable(verified.diagnostic)
      const work = ports.work()
      if (work === undefined) return unavailable('The current Session work port is absent.')
      return await apply(work, {
        principal: parent.principal,
        tenant: parent.tenant,
        call: parent.call,
        session: verified.session as SessionId,
      })
    } catch {
      return unavailable('The current Session dependency did not answer.')
    }
  }
  const mutate = (
    command: 'add' | 'remove' | 'mark_complete',
    business: { text: string } | { item: string },
  ) =>
    run(command, business, async (work, access) => {
      const tenant = tenantCodec.encode(access.tenant)
      if (!tenant.ok) return denied()
      const operation = deriveSessionOperation({
        kind: 'todo-tool-call',
        tenant: tenant.value,
        session: access.session,
        call: parent.call,
      })
      const input = {
        principal: access.principal,
        tenant: access.tenant,
        session: access.session,
        operation,
      }
      try {
        const answer =
          'text' in business
            ? await work.addTodo({ ...input, text: business.text })
            : command === 'remove'
              ? await work.removeTodo({ ...input, item: business.item as TodoItemId })
              : await work.markTodoComplete({ ...input, item: business.item as TodoItemId })
        return 'failure' in answer ? { failure: failure(answer.failure) } : answer
      } catch {
        return { failure: { kind: 'commit-unknown', operation } }
      }
    })
  return {
    add: business => mutate('add', business),
    remove: business => mutate('remove', business),
    markComplete: business => mutate('mark_complete', business),
    list: business =>
      run('list', business, async (work, access) => {
        const answer = await work.listTodos({
          principal: access.principal,
          tenant: access.tenant,
          session: access.session,
          after: cursorOf(business.after),
          limit: business.limit,
        })
        return 'failure' in answer ? { failure: failure(answer.failure) } : answer
      }),
  }
}

export function bindReleaseTodoItems(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  let active = true
  const coordinator = ctx.intercept(sessionKey, { caller: 'coordinator' })
  const value = createBoundTodoItems(
    parent,
    {
      verifier: () => toolRuntimeHolder(ctx).verifier(),
      work: () => coordinator.get(sessionKey, false)?.work,
    },
    () => active && !scope.context.signal.aborted,
  )
  const attached = attachTodoItems(scope, value)
  return {
    ...attached,
    finish(exit) {
      active = false
      return attached.finish(exit)
    },
  }
}
