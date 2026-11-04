// `omne credential set|show|unset` (SPEC「模型凭据命令」): the model credential of the acting tenant,
// through the three governance operations `bind-model-credential`, `describe-model-credential` and
// `unbind-model-credential`. The secret comes from standard input or a hidden prompt, never from
// the command line. It goes into the request and nowhere else.
import {
  createGovernanceClient,
  tenantText,
  type CallerResult,
  type GovernanceRequest,
} from '@omne-harness/sdk'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  attempt,
  loadLogin,
  localFailure,
  missingOption,
  serverOption,
  text,
  unrecognized,
  usageError,
} from './command-support.ts'
import { readOptions } from './options.ts'
import { exitCodeOf, report, type RequestEcho } from './report.ts'

const protocolVersion = 'governance-public/1'
const JSON_SWITCH = '--json'

type Action = 'set' | 'show' | 'unset'

function isAction(value: string | undefined): value is Action {
  return value === 'set' || value === 'show' || value === 'unset'
}

/** The human summary of `show`. A non-success result names its outcome only. */
function summary(result: CallerResult): string {
  if (result.kind === 'uncertain') return 'Result: uncertain\n'
  const { outcome, body } = result.message
  if (outcome !== 'succeeded') return `Result: ${outcome}\n`
  const state = text(body, 'state')
  if (state === 'unbound') return 'Model credential: not set\n'
  const lines = [
    state === 'usable' ? 'Model credential: set' : 'Model credential: set, but it cannot be read',
    `Tenant: ${text(body, 'tenantId')}`,
  ]
  const at = text(body, 'configuredAt')
  lines.push(`Configured at: ${at === '' ? 'not recorded' : at}`)
  return `${lines.join('\n')}\n`
}

function writeSummary(name: string, result: CallerResult, output: CliOutput): ExitCode {
  const code = exitCodeOf(result)
  try {
    output.stdout(summary(result))
  } catch {
    output.stderr(`omne ${name}: cannot write standard output\n`)
    return 1
  }
  if (code === 5) output.stderr(`omne ${name}: result uncertain\n`)
  return code
}

async function runCredential(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const [action, ...rest] = args
  if (!isAction(action)) return usageError(output, unrecognized('credential'))
  const name = `credential ${action}`
  const read = readOptions(rest, {
    accepted: [serverOption],
    required: [],
    ...(action === 'show' ? { switches: [JSON_SWITCH] } : {}),
  })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))

  const loaded = loadLogin(read.values, output, environment, 'governance')
  if (loaded.kind === 'exit') return loaded.code
  const messageId = environment.services.newId()
  const head = {
    protocolVersion,
    messageId,
    proof: { kind: 'present', value: loaded.state.loginProof },
    actingTenant: loaded.tenant,
  } as const
  let request: GovernanceRequest
  if (action === 'set') {
    const secret = await environment.services.readCredential(output.stderr)
    if (secret.kind === 'failure') return localFailure(output, secret.message)
    if (secret.value === '') return usageError(output, 'omne: empty credential\n')
    request = { ...head, operation: 'bind-model-credential', body: { secret: secret.value } }
  } else
    request = {
      ...head,
      operation: action === 'show' ? 'describe-model-credential' : 'unbind-model-credential',
      body: {},
    }

  const client = createGovernanceClient({ transport: loaded.opened.transport })
  const result = await attempt(() => client.submit(request))
  if (result === undefined) return usageError(output, unrecognized(name))
  const echo: RequestEcho = { messageId, tenant: tenantText(loaded.tenant) }
  if (action === 'show' && !read.values.has(JSON_SWITCH)) return writeSummary(name, result, output)
  return report(name, result, echo, output)
}

export const credentialCommand: CommandSpec = {
  name: 'credential',
  usage: 'set|show|unset',
  summary: 'Set, show or unset the model credential of the acting tenant.',
  run: runCredential,
}
