import {
  createGovernanceClient,
  parseTenantText,
  readAccountIdText,
  readLoginStateIdText,
  readOrganizationIdText,
  tenantText,
  type CallerResult,
  type GovernanceRequest,
  type ProofInput,
  type TenantId,
} from '@omne-harness/sdk'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  attempt,
  loadLogin,
  missingOption,
  serverOption,
  text,
  unrecognized,
  usageError,
  type Option,
} from './command-support.ts'
import {
  removeLoginState,
  writeLoginState,
  type LoginState,
  type LoginStateRemove,
  type LoginStateWrite,
} from './login-state.ts'
import { readOptions } from './options.ts'
import { report, type RequestEcho } from './report.ts'

/** What a command may use once the login is loaded: the proof, the acting tenant, and the state file. */
interface Context {
  readonly messageId: string
  readonly proof: ProofInput
  readonly tenant: TenantId
  readonly state: LoginState
  readonly directory: string
  readonly newId: () => string
}

interface Built {
  readonly request: GovernanceRequest
  readonly echo: RequestEcho
  /**
   * Changes the local state after the response is read. Returns the text for standard error when
   * the change failed. The command then exits 1 after it has printed the result.
   */
  readonly local?: (result: CallerResult) => string | undefined
}

/**
 * The answer of a command to its option values: `undefined` is an unrecognized argument, a text is
 * the usage message to print, and a function builds the request once the login is known.
 */
type Prepared = undefined | string | ((context: Context) => Built | string)

interface GovernanceCommand {
  readonly name: string
  readonly summary: string
  readonly required: readonly string[]
  readonly optional: readonly string[]
  /** Checks the values that need no state. */
  readonly prepare: (values: Option) => Prepared
}

function respondedWith(result: CallerResult, ...outcomes: readonly string[]): boolean {
  return result.kind === 'response' && outcomes.includes(result.message.outcome)
}

function reason(code: string | undefined): string {
  return code === undefined ? '' : `: ${code}`
}

function writeFailure(name: string, saved: LoginStateWrite): string | undefined {
  return saved.kind === 'written'
    ? undefined
    : `omne ${name}: cannot write login state ${saved.path}${reason(saved.code)}\n`
}

function removeFailure(name: string, removed: LoginStateRemove): string | undefined {
  return removed.kind === 'removed'
    ? undefined
    : `omne ${name}: cannot remove login state ${removed.path}${reason(removed.code)}\n`
}

const protocolVersion = 'governance-public/1'

/** The echo of a command that acts for the tenant of the login. */
function actingEcho(context: Context): RequestEcho {
  return { messageId: context.messageId, tenant: tenantText(context.tenant) }
}

/** A command that sends an empty body and does not name a tenant. */
function plain(
  name:
    | 'query-own-valid-logins'
    | 'query-current-tenant'
    | 'query-own-memberships'
    | 'query-received-invitations',
  summary: string,
): GovernanceCommand {
  return {
    name,
    summary,
    required: [],
    optional: [],
    prepare: () => context => ({
      request: {
        protocolVersion,
        messageId: context.messageId,
        operation: name,
        proof: context.proof,
        body: {},
      },
      echo: { messageId: context.messageId },
    }),
  }
}

/** A command that sends an empty body for the tenant of the login. */
function acting(
  name: 'query-issued-invitations' | 'leave-organization',
  summary: string,
): GovernanceCommand {
  return {
    name,
    summary,
    required: [],
    optional: [],
    prepare: () => context => ({
      request: {
        protocolVersion,
        messageId: context.messageId,
        operation: name,
        proof: context.proof,
        actingTenant: context.tenant,
        body: {},
      },
      echo: actingEcho(context),
    }),
  }
}

/** The three answers to an open invitation share one shape. */
function invitationAnswer(
  name: 'accept-member-invitation' | 'reject-member-invitation' | 'withdraw-member-invitation',
  summary: string,
): GovernanceCommand {
  return {
    name,
    summary,
    required: ['--invitation-id'],
    optional: [],
    prepare: values => context => ({
      request: {
        protocolVersion,
        messageId: context.messageId,
        operation: name,
        proof: context.proof,
        actingTenant: context.tenant,
        body: { invitationId: values.get('--invitation-id') ?? '', expectedState: 'open' },
      },
      echo: actingEcho(context),
    }),
  }
}

const createOrganization: GovernanceCommand = {
  name: 'create-organization',
  summary: 'Create an organization.',
  required: ['--name', '--governance-model-id'],
  optional: ['--create-call-id'],
  prepare: values => context => {
    const createCallId = values.get('--create-call-id') ?? context.newId()
    return {
      request: {
        protocolVersion,
        messageId: context.messageId,
        operation: 'create-organization',
        proof: context.proof,
        actingTenant: context.tenant,
        body: {
          createCallId,
          name: values.get('--name') ?? '',
          governanceModelId: values.get('--governance-model-id') ?? '',
        },
      },
      echo: { ...actingEcho(context), createCallId },
    }
  },
}

const queryCreateOrganization: GovernanceCommand = {
  name: 'query-create-organization',
  summary: 'Ask what an earlier create-organization call did.',
  required: ['--target-create-call-id', '--name', '--governance-model-id'],
  optional: [],
  prepare: values => context => ({
    request: {
      protocolVersion,
      messageId: context.messageId,
      operation: 'query-create-organization',
      proof: context.proof,
      body: {
        targetCreateCallId: values.get('--target-create-call-id') ?? '',
        name: values.get('--name') ?? '',
        governanceModelId: values.get('--governance-model-id') ?? '',
      },
    },
    echo: { messageId: context.messageId },
  }),
}

const issueMemberInvitation: GovernanceCommand = {
  name: 'issue-member-invitation',
  summary: 'Invite an account to the organization of the acting tenant.',
  required: ['--invited-login-identifier'],
  optional: ['--duration'],
  prepare: values => context => {
    const duration = values.get('--duration')
    return {
      request: {
        protocolVersion,
        messageId: context.messageId,
        operation: 'issue-member-invitation',
        proof: context.proof,
        actingTenant: context.tenant,
        body: {
          invitedLoginIdentifier: values.get('--invited-login-identifier') ?? '',
          ...(duration === undefined ? {} : { duration }),
        },
      },
      echo: actingEcho(context),
    }
  },
}

const queryInvitation: GovernanceCommand = {
  name: 'query-invitation',
  summary: 'Read one invitation.',
  required: ['--invitation-id'],
  optional: [],
  prepare: values => context => ({
    request: {
      protocolVersion,
      messageId: context.messageId,
      operation: 'query-invitation',
      proof: context.proof,
      actingTenant: context.tenant,
      body: { invitationId: values.get('--invitation-id') ?? '' },
    },
    echo: actingEcho(context),
  }),
}

const queryOrganizationMembers: GovernanceCommand = {
  name: 'query-organization-members',
  summary: 'List the members of an organization.',
  required: ['--organization-id'],
  optional: ['--include-removed'],
  prepare: values => {
    const organizationId = readOrganizationIdText(values.get('--organization-id') ?? '')
    const removed = values.get('--include-removed')
    if (organizationId === undefined) return undefined
    if (removed !== undefined && removed !== 'true' && removed !== 'false') return undefined
    return context => ({
      request: {
        protocolVersion,
        messageId: context.messageId,
        operation: 'query-organization-members',
        proof: context.proof,
        actingTenant: context.tenant,
        body: {
          organizationId,
          ...(removed === undefined ? {} : { includeRemoved: removed === 'true' }),
        },
      },
      echo: actingEcho(context),
    })
  },
}

/** `remove-member` and `change-member-role` name the member by organization and account. */
function memberChange(name: 'remove-member' | 'change-member-role'): GovernanceCommand {
  const change = name === 'change-member-role'
  return {
    name,
    summary: change ? 'Change the role of a member.' : 'Remove a member from an organization.',
    required: [
      '--organization-id',
      '--account-id',
      '--expected-role',
      ...(change ? ['--target-role'] : []),
    ],
    optional: [],
    prepare: values => {
      const organizationId = readOrganizationIdText(values.get('--organization-id') ?? '')
      const accountId = readAccountIdText(values.get('--account-id') ?? '')
      if (organizationId === undefined || accountId === undefined) return undefined
      const expectedRole = values.get('--expected-role') ?? ''
      const targetRole = values.get('--target-role') ?? ''
      return context => {
        const head = {
          protocolVersion,
          messageId: context.messageId,
          proof: context.proof,
          actingTenant: context.tenant,
        } as const
        return {
          request: change
            ? {
                ...head,
                operation: 'change-member-role',
                body: { organizationId, accountId, expectedRole, targetRole },
              }
            : {
                ...head,
                operation: 'remove-member',
                body: { organizationId, accountId, expectedRole },
              },
          echo: actingEcho(context),
        }
      }
    },
  }
}

/** Switching the tenant changes the tenant that the login file holds, once the server agrees. */
const switchCurrentTenant: GovernanceCommand = {
  name: 'switch-current-tenant',
  summary: 'Switch the current tenant of this login.',
  required: ['--tenant-id'],
  optional: [],
  prepare: values => {
    const tenantId = parseTenantText(values.get('--tenant-id') ?? '')
    if (tenantId === undefined) return undefined
    return context => ({
      request: {
        protocolVersion,
        messageId: context.messageId,
        operation: 'switch-current-tenant',
        proof: context.proof,
        actingTenant: context.tenant,
        body: { tenantId },
      },
      echo: actingEcho(context),
      local: result => {
        if (!respondedWith(result, 'succeeded') || result.kind !== 'response') return undefined
        const switched = text(result.message.body, 'tenantId')
        if (parseTenantText(switched) === undefined)
          return 'omne switch-current-tenant: the response names no valid tenant\n'
        return writeFailure(
          'switch-current-tenant',
          writeLoginState(context.directory, { ...context.state, tenantId: switched }),
        )
      },
    })
  },
}

const unknownLoginId =
  'omne revoke-login: the login id of this login is unknown\nRun omne login again, or add --target-login <id>.\n'

/**
 * Without `--target-login` the target is this login, by the `loginId` that `login` saved. When the
 * target is this login and the server ends it or finds it already ended, the file is removed.
 */
const revokeLogin: GovernanceCommand = {
  name: 'revoke-login',
  summary: 'Revoke a login. Without --target-login, log out of this one.',
  required: [],
  optional: ['--target-login'],
  prepare: values => {
    const given = values.get('--target-login')
    if (given !== undefined && readLoginStateIdText(given) === undefined) return undefined
    return context => {
      const targetText = given ?? context.state.loginId
      const targetLoginId = readLoginStateIdText(targetText ?? '')
      if (targetText === undefined || targetLoginId === undefined) return unknownLoginId
      const own = given === undefined || given === context.state.loginId
      return {
        request: {
          protocolVersion,
          messageId: context.messageId,
          operation: 'revoke-login',
          proof: context.proof,
          body: { targetLoginId },
        },
        echo: { messageId: context.messageId, targetLoginId: targetText },
        local: result =>
          own && respondedWith(result, 'succeeded', 'no-change')
            ? removeFailure('revoke-login', removeLoginState(context.directory))
            : undefined,
      }
    }
  },
}

const commands: readonly GovernanceCommand[] = [
  createOrganization,
  queryCreateOrganization,
  issueMemberInvitation,
  invitationAnswer('accept-member-invitation', 'Accept an invitation.'),
  invitationAnswer('reject-member-invitation', 'Reject an invitation.'),
  invitationAnswer('withdraw-member-invitation', 'Withdraw an invitation that this tenant issued.'),
  queryInvitation,
  plain('query-received-invitations', 'List the invitations this account received.'),
  acting('query-issued-invitations', 'List the invitations this tenant issued.'),
  plain('query-own-memberships', 'List the memberships of this account.'),
  queryOrganizationMembers,
  acting('leave-organization', 'Leave the organization of the acting tenant.'),
  memberChange('remove-member'),
  memberChange('change-member-role'),
  switchCurrentTenant,
  plain('query-current-tenant', 'Read the current tenant of this login.'),
  revokeLogin,
  plain('query-own-valid-logins', 'List the valid logins of this account.'),
]

async function runGovernance(
  command: GovernanceCommand,
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const { name } = command
  const read = readOptions(args, {
    accepted: [...command.required, ...command.optional, serverOption],
    required: command.required,
  })
  if (read.kind === 'unrecognized') return usageError(output, unrecognized(name))
  if (read.kind === 'missing') return usageError(output, missingOption(name, read.option))
  const prepared = command.prepare(read.values)
  if (prepared === undefined) return usageError(output, unrecognized(name))
  if (typeof prepared === 'string') return usageError(output, prepared)

  const loaded = loadLogin(read.values, output, environment, 'governance')
  if (loaded.kind === 'exit') return loaded.code
  const built = prepared({
    messageId: environment.services.newId(),
    proof: { kind: 'present', value: loaded.state.loginProof },
    tenant: loaded.tenant,
    state: loaded.state,
    directory: loaded.directory,
    newId: environment.services.newId,
  })
  if (typeof built === 'string') return usageError(output, built)

  const client = createGovernanceClient({ transport: loaded.opened.transport })
  const result = await attempt(() => client.submit(built.request))
  if (result === undefined) return usageError(output, unrecognized(name))
  const failure = built.local?.(result)
  const code = report(name, result, built.echo, output)
  if (failure === undefined) return code
  output.stderr(failure)
  return 1
}

/** The help names the value of an option by what it holds: an id, a tenant text, a role, or a name. */
function placeholder(option: string): string {
  if (option === '--tenant-id') return '<tenant>'
  if (option.endsWith('-id') || option.endsWith('-identifier')) return '<id>'
  if (option.endsWith('-role')) return '<role>'
  return '<name>'
}

function usageOf(command: GovernanceCommand): string {
  return command.required.map(option => `${option} ${placeholder(option)}`).join(' ')
}

/** The governance commands, in the order the help lists them. Each is named for its operation. */
export const governanceCommands: readonly CommandSpec[] = commands.map(command => ({
  name: command.name,
  usage: usageOf(command),
  summary: command.summary,
  run: (args, output, environment) => runGovernance(command, args, output, environment),
}))
