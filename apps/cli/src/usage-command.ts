import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { BodyOf } from '@omne-harness/sdk/core'
import { usageProtocol, type UsageProtocol } from '@omne-harness/usage-protocol'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  instantOption,
  loadLogin,
  missingOption,
  serverOption,
  tenantOption,
  unrecognized,
  usageError,
  type Option,
  refusedRequest,
} from './command-support.ts'
import { readOptions } from './options.ts'
import { report } from './report.ts'

type Operations = UsageProtocol['operations']
type Name = keyof Operations
type Scope = BodyOf<Operations['query-usage']>['scope']
type Range = BodyOf<Operations['query-usage']>['range']
type Query = BodyOf<Operations['query-usage']>

const BUCKETS: readonly string[] = ['none', 'hour', 'day', 'week', 'month']
const DIMENSIONS: readonly string[] = ['source', 'model', 'provider', 'purpose', 'tool']
const LIMIT = /^[1-9][0-9]*$/

type Read = Readonly<{
  accepted: readonly string[]
  required: readonly string[]
  body: (values: Option, tenant: TenantId) => BodyOf<Operations[Name]> | undefined
}>

const scopeOf = (values: Option): Scope => {
  const session = values.get('--session')
  return session === undefined ? { kind: 'tenant' } : { kind: 'session', session }
}

function rangeOf(values: Option): Range | undefined {
  const from = instantOption(values, '--since')
  const to = instantOption(values, '--before')
  return from === undefined || from === null || to === undefined || to === null
    ? undefined
    : { from, to }
}

function groupByOf(values: Option): Query['groupBy'] | undefined {
  const given = values.get('--group-by')
  if (given === undefined) return []
  const dimensions = given.split(',')
  return dimensions.every(item => DIMENSIONS.includes(item))
    ? (dimensions as Query['groupBy'][number][])
    : undefined
}

/** Each read and what it asks; `--tenant` names the tenant, else the login's own is asked. */
const READS: Readonly<Record<Name, Read>> = {
  'query-usage': {
    accepted: ['--session', '--since', '--before', '--zone', '--bucket', '--group-by'],
    required: ['--since', '--before', '--zone'],
    body: (values, tenant) => {
      const range = rangeOf(values)
      const bucket = values.get('--bucket') ?? 'none'
      const groupBy = groupByOf(values)
      if (range === undefined || !BUCKETS.includes(bucket) || groupBy === undefined)
        return undefined
      return {
        tenant,
        scope: scopeOf(values),
        range,
        zone: values.get('--zone') ?? '',
        bucket: bucket as Query['bucket'],
        groupBy,
      }
    },
  },
  'list-usage-records': {
    accepted: ['--session', '--since', '--before', '--after', '--limit'],
    required: ['--since', '--before'],
    body: (values, tenant) => {
      const range = rangeOf(values)
      const limit = values.get('--limit') ?? '100'
      if (range === undefined || !LIMIT.test(limit)) return undefined
      return {
        tenant,
        scope: scopeOf(values),
        range,
        after: values.get('--after') ?? null,
        limit: Number(limit),
      }
    },
  },
  'read-context-occupancy': {
    accepted: ['--session'],
    required: ['--session'],
    body: (values, tenant) => ({ tenant, session: values.get('--session') ?? '' }),
  },
}

async function runUsage(
  name: Name,
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const asked = READS[name]
  const read = readOptions(args, {
    accepted: [...asked.accepted, '--tenant', serverOption],
    required: asked.required,
  })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))
  const given = tenantOption(read.values)
  if (given === null) return usageError(output, unrecognized(name))
  const loaded = loadLogin(read.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const tenant = given ?? loaded.tenant
  const body = asked.body(read.values, tenant)
  if (body === undefined) return usageError(output, unrecognized(name))
  const messageId = environment.services.newId()
  const result = await loaded.link.call(usageProtocol, name, body as never, messageId)
  if (result.kind === 'rejected') return usageError(output, refusedRequest(name, result.rejection))
  return report(name, result, { messageId, tenant: encodeTenantText(tenant) }, output)
}

const command = (name: Name, usage: string, summary: string): CommandSpec => ({
  name,
  usage,
  summary,
  run: (args, output, environment) => runUsage(name, args, output, environment),
})

export const usageCommands: readonly CommandSpec[] = [
  command(
    'query-usage',
    '--since <instant> --before <instant> --zone <tz> [--session <id>] [--bucket <b>] [--group-by <d,d>]',
    'Sum the usage and cost of a tenant or one session from --since up to --before: buckets none, hour, day, week or month in the IANA zone, split by up to two of source, model, provider, purpose and tool. --tenant names another tenant.',
  ),
  command(
    'list-usage-records',
    '--since <instant> --before <instant> [--session <id>] [--after <cursor>] [--limit <n>]',
    'List the usage records one by one, at most --limit (default 100) a page; each carries only numbers and names. --tenant names another tenant.',
  ),
  command(
    'read-context-occupancy',
    '--session <id> [--tenant <tenant>]',
    'Read how much of the context window the latest main request of a session used, with its moment and model.',
  ),
]
