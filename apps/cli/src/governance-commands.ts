import { identityProtocol } from '@omne-harness/identity-protocol'
import {
  encodeTenantText,
  readAccountIdText,
  readLoginStateIdText,
  readOrganizationIdText,
  readTenantText,
  type TenantId,
} from '@omne-harness/public-contract'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  missingOption,
  serverOption,
  text,
  unrecognized,
  usageError,
  type Option,
  refusedRequest,
} from './command-support.ts'
import {
  removeLoginState,
  writeLoginState,
  type LoginState,
  type LoginStateRemove,
  type LoginStateWrite,
} from './login-state.ts'
import type { CallResult, Link } from './link.ts'
import { readOptions } from './options.ts'
import { report, type RequestEcho } from './report.ts'

interface Context {
  readonly messageId: string
  readonly tenant: TenantId
  readonly state: LoginState
  readonly directory: string
  readonly newId: () => string
}

interface Built {
  readonly send: (link: Link) => Promise<CallResult>
  readonly echo: RequestEcho
  readonly local?: (result: CallResult) => string | undefined
}

type Prepared = undefined | string | ((context: Context) => Built | string)

interface GovernanceCommand {
  readonly name: string
  readonly summary: string
  readonly required: readonly string[]
  readonly optional: readonly string[]
  readonly prepare: (values: Option) => Prepared
}

function respondedWith(result: CallResult, ...outcomes: readonly string[]): boolean {
  return result.kind === 'response' && outcomes.includes(result.outcome)
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

function actingEcho(context: Context): RequestEcho {
  return { messageId: context.messageId, tenant: encodeTenantText(context.tenant) }
}

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
      send: link => link.call(identityProtocol, name, {}, context.messageId),
      echo: { messageId: context.messageId },
    }),
  }
}

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
      send: link => link.call(identityProtocol, name, {}, context.messageId),
      echo: actingEcho(context),
    }),
  }
}

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
      send: link =>
        link.call(
          identityProtocol,
          name,
          { invitationId: values.get('--invitation-id') ?? '', expectedState: 'open' },
          context.messageId,
        ),
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
      send: link =>
        link.call(
          identityProtocol,
          'create-organization',
          {
            createCallId,
            name: values.get('--name') ?? '',
            governanceModelId: values.get('--governance-model-id') ?? '',
          },
          context.messageId,
        ),
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
    send: link =>
      link.call(
        identityProtocol,
        'query-create-organization',
        {
          targetCreateCallId: values.get('--target-create-call-id') ?? '',
          name: values.get('--name') ?? '',
          governanceModelId: values.get('--governance-model-id') ?? '',
        },
        context.messageId,
      ),
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
      send: link =>
        link.call(
          identityProtocol,
          'issue-member-invitation',
          {
            invitedLoginIdentifier: values.get('--invited-login-identifier') ?? '',
            ...(duration === undefined ? {} : { duration }),
          },
          context.messageId,
        ),
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
    send: link =>
      link.call(
        identityProtocol,
        'query-invitation',
        { invitationId: values.get('--invitation-id') ?? '' },
        context.messageId,
      ),
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
      send: link =>
        link.call(
          identityProtocol,
          'query-organization-members',
          {
            organizationId,
            ...(removed === undefined ? {} : { includeRemoved: removed === 'true' }),
          },
          context.messageId,
        ),
      echo: actingEcho(context),
    })
  },
}

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
      return context => ({
        send: link =>
          change
            ? link.call(
                identityProtocol,
                'change-member-role',
                { organizationId, accountId, expectedRole, targetRole },
                context.messageId,
              )
            : link.call(
                identityProtocol,
                'remove-member',
                { organizationId, accountId, expectedRole },
                context.messageId,
              ),
        echo: actingEcho(context),
      })
    },
  }
}

const switchCurrentTenant: GovernanceCommand = {
  name: 'switch-current-tenant',
  summary: 'Switch the current tenant of this login.',
  required: ['--tenant-id'],
  optional: [],
  prepare: values => {
    const tenantId = readTenantText(values.get('--tenant-id') ?? '')
    if (tenantId === undefined) return undefined
    return context => ({
      send: link =>
        link.call(identityProtocol, 'switch-current-tenant', { tenantId }, context.messageId),
      echo: actingEcho(context),
      local: result => {
        if (!respondedWith(result, 'succeeded') || result.kind !== 'response') return undefined
        const switched = text(result.body, 'tenantId')
        if (readTenantText(switched) === undefined)
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
        send: link =>
          link.call(identityProtocol, 'revoke-login', { targetLoginId }, context.messageId),
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

  const loaded = loadLogin(read.values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const built = prepared({
    messageId: environment.services.newId(),
    tenant: loaded.tenant,
    state: loaded.state,
    directory: loaded.directory,
    newId: environment.services.newId,
  })
  if (typeof built === 'string') return usageError(output, built)

  const result = await built.send(loaded.link)
  if (result.kind === 'rejected') return usageError(output, refusedRequest(name, result.rejection))
  const failure = built.local?.(result)
  const code = report(name, result, built.echo, output)
  if (failure === undefined) return code
  output.stderr(failure)
  return 1
}

function placeholder(option: string): string {
  if (option === '--tenant-id') return '<tenant>'
  if (option.endsWith('-id') || option.endsWith('-identifier')) return '<id>'
  if (option.endsWith('-role')) return '<role>'
  return '<name>'
}

function usageOf(command: GovernanceCommand): string {
  return command.required.map(option => `${option} ${placeholder(option)}`).join(' ')
}

export const governanceCommands: readonly CommandSpec[] = commands.map(command => ({
  name: command.name,
  usage: usageOf(command),
  summary: command.summary,
  run: (args, output, environment) => runGovernance(command, args, output, environment),
}))
