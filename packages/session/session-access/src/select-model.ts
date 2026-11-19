import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import { commitCall, readCall, refused, UNAVAILABLE, type Answer, type Body } from './answers.ts'
import type { BackgroundCallPorts } from './background-calls.ts'
import { controlOperation } from './derivation.ts'
import type { ModelTargetCheck, ModelTargets } from './ports.ts'

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
  })
  if (target.kind === 'unavailable') return UNAVAILABLE
  if (target.kind === 'refused') return { outcome: 'invalid', body: { reason: target.reason } }
  const result = await commitCall(() =>
    faces.management.change({
      ...access,
      operation: controlOperation(caller.login, tenantText, access.session, controlId),
      declaration: { kind: 'model', name: model, basis: target.basis },
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('failure' in result) return refused('select-model', result.failure)
  return { outcome: 'succeeded', body: { controlId, model, credential: target.credential } }
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
  return {
    outcome: 'succeeded',
    body: { model: read.ok.selection.name, revision: read.ok.revision },
  }
}
