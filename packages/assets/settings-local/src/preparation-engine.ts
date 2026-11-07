import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  SettingsPrepareResult,
  SettingsPreparedCommit,
  SettingsPreparedCommitResult,
  SettingsCancelChange,
  SettingsCancelResult,
  SettingsFailure,
} from '@omne-harness/settings'
import type { IntentCommand, IntentIdentity } from './intent-schema.ts'
import { intentCommandDigest } from './intent-records.ts'
import { PreparationSql, PreparationRolledBack } from './preparation-sql.ts'
import { PreparationCustody } from './preparation-custody.ts'
import {
  preparationPlanSchema,
  preparationReference,
  attemptBinding,
  operationObservation,
  type ObservedIntent,
  type IntentObservation,
} from './preparation-observation.ts'
import { accessGrantSchema, failureSchema } from './schema.ts'
import { equal } from './encoding.ts'
import type { SettingsPreparationOptions } from './preparation-types.ts'
const unknown = (identity: IntentIdentity) => ({
  kind: 'unknown' as const,
  operation: identity.operation,
})
function known(root: ObservedIntent) {
  const result = operationObservation(root)
  return result.kind === 'committed' || result.kind === 'aborted' ? result : undefined
}
function existingPreparation(
  root: IntentObservation,
  intent: IntentCommand,
): SettingsPrepareResult | undefined {
  if (root.kind !== 'found') return undefined
  if (
    root.intent.kind !== intent.kind ||
    intentCommandDigest(root.intent) !== intentCommandDigest(intent)
  )
    return { kind: 'rejected', reason: 'operation_conflict' }
  return known(root) ?? prepared(root)
}
function prepared(root: ObservedIntent) {
  const attempt = root.attempt
  if (attempt === null) return undefined
  return attempt.status.state === 'prepared' || attempt.status.state === 'submitted'
    ? { kind: 'prepared' as const, preparation: preparationReference(root, attempt.attemptId) }
    : undefined
}
export class PreparationEngine<Context> {
  readonly sql: PreparationSql<Context>
  readonly custody: PreparationCustody<Context>
  readonly options: SettingsPreparationOptions<Context>
  constructor(options: SettingsPreparationOptions<Context>) {
    this.options = options
    this.sql = new PreparationSql(options)
    this.custody = new PreparationCustody(this.sql)
  }
  async authorize(
    context: Context,
    operation: IntentIdentity['operation'],
    action: Parameters<SettingsPreparationOptions<Context>['access']['authorize']>[1]['action'],
  ): Promise<IntentIdentity | SettingsFailure> {
    const result = await this.options.access.authorize(context, {
      scope: this.options.domain.scope,
      target: operation.target,
      action,
    })
    if (result.kind === 'rejected') return failureSchema.parse(result)
    const grant = accessGrantSchema.parse(result)
    if (!equal(grant.scope, this.options.domain.scope) || !equal(grant.target, operation.target))
      return { kind: 'rejected', reason: 'forbidden' }
    return { domain: this.options.domain, principalRef: grant.principalRef, operation }
  }
  private async seal(root: ObservedIntent, attemptId: string) {
    const binding = attemptBinding(root, attemptId)
    await this.sql.write({ kind: 'seal', binding })
    await this.custody.settle(binding)
  }
  async prepare(context: Context, intent: IntentCommand): Promise<SettingsPrepareResult> {
    const operation = { target: intent.command.target, operationId: intent.command.operationId }
    const identity = await this.authorize(
      context,
      operation,
      intent.kind === 'change' ? 'prepare' : 'maintenance',
    )
    if ('kind' in identity) return identity
    const previous = await this.sql.root(identity)
    const recognized = existingPreparation(previous, intent)
    if (recognized) return recognized
    const captured = await this.options.plan(context, { identity, intent })
    if (captured.kind === 'rejected') return failureSchema.parse(captured)
    const plan = preparationPlanSchema.parse(captured)
    if (!equal(plan.basis.target, operation.target))
      throw new Error('Preparation plan target mismatch')
    await this.allocate(identity, intent, previous, plan)
    const root = await this.sql.root(identity)
    if (root.kind !== 'found') return unknown(identity)
    const original = known(root)
    if (original) return original
    const attempt = root.attempt
    if (attempt === null) return unknown(identity)
    if (!equal(attempt.plan, plan.basis)) {
      await this.seal(root, attempt.attemptId)
      return { kind: 'rejected', reason: 'basis_changed' }
    }
    return this.prepareAttempt(context, root, plan)
  }
  private async allocate(
    identity: IntentIdentity,
    intent: IntentCommand,
    previous: IntentObservation,
    plan: ReturnType<typeof preparationPlanSchema.parse>,
  ) {
    const attemptId =
      previous.kind === 'found' && previous.attempt ? previous.attempt.attemptId : randomUUID()
    const binding = {
      identity,
      attemptId,
      commandKind: intent.kind,
      commandDigest: intentCommandDigest(intent),
    }
    await this.sql.write({
      kind: 'checkpoint',
      binding,
      command: {
        kind: 'allocate',
        input: { identity, intent, purpose: plan.purpose, attemptId, plan: plan.basis },
      },
    })
  }
  private async prepareAttempt(
    context: Context,
    root: ObservedIntent,
    plan: ReturnType<typeof preparationPlanSchema.parse>,
  ): Promise<SettingsPrepareResult> {
    const attempt = root.attempt
    if (attempt === null) return unknown(root.identity)
    const binding = attemptBinding(root, attempt.attemptId)
    const failure = await this.custody.reserve(context, binding, plan)
    if (failure) {
      if (failure.reason === 'unavailable')
        throw new Error('Settings source reservation unavailable')
      await this.seal(root, attempt.attemptId)
      return failure
    }
    const response = await this.sql.write(
      { kind: 'ready', binding },
      this.options.currentCommands(context, { phase: 'ready', binding }),
    )
    const rejected = failureSchema.safeParse(
      z.object({ result: z.unknown() }).parse(response).result,
    )
    if (rejected.success) {
      if (rejected.data.reason === 'basis_changed') await this.seal(root, attempt.attemptId)
      return rejected.data
    }
    return this.afterReady(root, attempt.attemptId)
  }
  private async afterReady(
    root: ObservedIntent,
    attemptId: string,
  ): Promise<SettingsPrepareResult> {
    const found = await this.sql.root(root.identity)
    if (found.kind !== 'found') return unknown(root.identity)
    const original = known(found)
    if (original) {
      await this.custody.settle(attemptBinding(root, attemptId))
      return original
    }
    return found.attempt?.attemptId === attemptId
      ? (prepared(found) ?? unknown(root.identity))
      : unknown(root.identity)
  }
  async commit(
    context: Context,
    input: SettingsPreparedCommit,
  ): Promise<SettingsPreparedCommitResult> {
    const ref = input.preparation
    const identity = await this.authorize(context, ref.operation, 'commit')
    if ('kind' in identity) return identity
    const root = await this.sql.root(identity)
    if (root.kind !== 'found' || intentCommandDigest(root.intent) !== ref.commandDigest)
      return { kind: 'rejected', reason: 'operation_conflict' }
    const exact = await this.sql.read({
      kind: 'attempt',
      input: { identity, attemptId: ref.attemptId },
    })
    if (z.object({ kind: z.enum(['found', 'not_found']) }).parse(exact).kind !== 'found')
      return { kind: 'rejected', reason: 'operation_conflict' }
    const original = known(root)
    if (original) return original
    if (root.attempt?.attemptId !== ref.attemptId || root.attempt.status.state === 'preparing')
      return { kind: 'rejected', reason: 'basis_changed' }
    return this.commitPrepared(context, root, ref.attemptId)
  }
  private async commitPrepared(
    context: Context,
    root: ObservedIntent,
    attemptId: string,
  ): Promise<SettingsPreparedCommitResult> {
    const binding = attemptBinding(root, attemptId)
    try {
      await this.sql.write(
        { kind: 'commit', binding },
        this.options.currentCommands(context, { phase: 'commit', binding }),
      )
    } catch (error) {
      if (!(error instanceof PreparationRolledBack)) throw error
      await this.seal(root, attemptId)
      const sealed = await this.sql.root(root.identity)
      return sealed.kind === 'found'
        ? (known(sealed) ?? { kind: 'rejected', reason: 'unavailable' })
        : unknown(root.identity)
    }
    await this.custody.settle(binding)
    const found = await this.sql.root(root.identity)
    if (found.kind === 'not_found') return unknown(root.identity)
    return (
      known(found) ??
      (found.attempt === null
        ? { kind: 'rejected', reason: 'basis_changed' }
        : unknown(root.identity))
    )
  }
  async cancel(context: Context, input: SettingsCancelChange): Promise<SettingsCancelResult> {
    const identity = await this.authorize(context, input.operation, 'cancel')
    if ('kind' in identity) return identity
    const root = await this.sql.root(identity)
    if (root.kind === 'not_found') return root
    const original = known(root)
    if (original) return original
    const id = root.attempt?.attemptId ?? null
    await this.sql.write({
      kind: 'cancel',
      binding: {
        identity,
        attemptId: id,
        commandKind: root.intent.kind,
        commandDigest: intentCommandDigest(root.intent),
      },
    })
    if (id !== null) await this.custody.settle(attemptBinding(root, id))
    const found = await this.sql.root(identity)
    return found.kind === 'found' ? (known(found) ?? unknown(identity)) : unknown(identity)
  }
}
