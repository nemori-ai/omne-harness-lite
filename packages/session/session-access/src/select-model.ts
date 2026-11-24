import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import { commitCall, readCall, refused, UNAVAILABLE, type Answer, type Body } from './answers.ts'
import type { BackgroundCallPorts } from './background-calls.ts'
import { controlOperation } from './derivation.ts'
import type { ModelTargetCheck, ModelTargets } from './ports.ts'

const NAMED_BLOCKS = 16

export type SelectModelPorts = BackgroundCallPorts &
  Readonly<{ targets: () => ModelTargets | undefined }>

async function checked(
  targets: ModelTargets,
  input: Parameters<ModelTargets['check']>[0],
): Promise<ModelTargetCheck> {
  try {
    return await targets.check(input)
  } catch {
    return { kind: 'unavailable' }
  }
}

// The target is judged before anything is committed; the control identity derives the operation.
export async function selectModel(
  ports: SelectModelPorts,
  login: LoginIdentity,
  body: Body<'select-model'>,
): Promise<Answer<'select-model'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, tenantText, faces } = admitted
  const caller = ports.factOf(access.principal)
  const targets = ports.targets()
  if (caller === undefined || targets === undefined) return UNAVAILABLE
  const { controlId, model } = body
  const target = await checked(targets, {
    principal: access.principal,
    tenant: access.tenant,
    route: model,
    session: access.session,
  })
  if (target.kind === 'unavailable') return UNAVAILABLE
  if (target.kind === 'refused') {
    const { reason, blocks } = target
    const named = blocks === undefined ? {} : { blocks: blocks.slice(0, NAMED_BLOCKS) }
    return { outcome: 'invalid', body: { reason, ...named } }
  }
  const { reasoningEffort } = body
  if (reasoningEffort !== undefined && !target.reasoningEfforts?.includes(reasoningEffort))
    return { outcome: 'invalid', body: { reason: 'excluded', detail: 'unsupported-effort' } }
  const effort = reasoningEffort === undefined ? {} : { reasoningEffort }
  const result = await commitCall(() =>
    faces.management.change({
      ...access,
      operation: controlOperation(caller.login, tenantText, access.session, controlId),
      declaration: { kind: 'model', name: model, ...effort, basis: target.basis },
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('failure' in result) return refused('select-model', result.failure)
  return {
    outcome: 'succeeded',
    body: { controlId, model, ...effort, credential: target.credential },
  }
}

/** The model the session stands at now, as Session holds it: its log is the authority. */
export async function readModelSelection(
  ports: Pick<SelectModelPorts, 'admit'>,
  login: LoginIdentity,
  body: Body<'read-model-selection'>,
): Promise<Answer<'read-model-selection'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, faces } = admitted
  const read = await readCall(() => faces.work.readModelSelection(access))
  if (read === 'basis-unavailable') return UNAVAILABLE
  if ('failure' in read) return refused('read-model-selection', read.failure)
  const { name, reasoningEffort } = read.ok.selection
  return {
    outcome: 'succeeded',
    body: {
      model: name,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      revision: read.ok.revision,
    },
  }
}
