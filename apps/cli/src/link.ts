import type { OperationContract, ProtocolContract } from '@omne-harness/public-contract'
import {
  ClientRequestError,
  createClient,
  type BodyOf,
  type CallReport,
  type Credentials,
  type Transport,
} from '@omne-harness/sdk/core'
import type { CommandEnvironment } from './cli-types.ts'

export type CallResult =
  | { readonly kind: 'response'; readonly outcome: string; readonly body: unknown }
  | { readonly kind: 'uncertain' }
  | { readonly kind: 'unavailable' }

export type Login = { readonly proof: string; readonly tenant: string }

export interface Link {
  readonly origin: string
  /** Resolves to undefined when the body does not fit the contract: a usage error. */
  call<P extends ProtocolContract, K extends keyof P['operations'] & string>(
    protocol: P,
    operation: K,
    body: BodyOf<P['operations'][K]>,
    messageId: string,
  ): Promise<CallResult | undefined>
}

export type Opened = { readonly kind: 'link'; readonly link: Link } | { readonly kind: 'refused' }

type Wire = Extract<CallReport, { kind: 'answered' }>['body']
type Invoke = (body: unknown, options: { messageId: string }) => Promise<{ outcome: string }>

const loopbackHosts: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost'])

function isLoopbackOrigin(origin: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  return (
    parsed.protocol === 'http:' &&
    loopbackHosts.has(parsed.hostname) &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.pathname === '/' &&
    parsed.search === '' &&
    parsed.hash === ''
  )
}

function plain(value: Wire): unknown {
  switch (value.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return value.value
    case 'number':
      return Number(value.lexeme)
    case 'array':
      return value.items.map(plain)
    case 'object':
      return Object.fromEntries(value.entries.map(entry => [entry.key, plain(entry.value)]))
  }
}

function credentialsOf(
  identity: OperationContract['identity'],
  login: Login | undefined,
): Credentials {
  if (identity === 'none' || login === undefined) return {}
  return identity === 'login'
    ? { proof: login.proof }
    : { proof: login.proof, tenant: login.tenant }
}

/**
 * The answer body is kept as the wire carried it, so the command prints what the server said and
 * not what a local codec made of it. The client still decides whether the answer fits the contract.
 */
export function openLink(environment: CommandEnvironment, origin: string, login?: Login): Opened {
  if (!isLoopbackOrigin(origin)) return { kind: 'refused' }
  let credentials: Credentials = {}
  let answered: Wire | undefined
  let inner: Transport
  try {
    inner = environment.services.createTransport(origin, () => credentials)
  } catch {
    return { kind: 'refused' }
  }
  const transport: Transport = {
    async call(request) {
      const report = await inner.call(request)
      answered = report.kind === 'answered' ? report.body : undefined
      return report
    },
    observe: request => inner.observe(request),
  }

  const link: Link = {
    origin: new URL(origin).origin,
    async call(protocol, operation, body, messageId) {
      credentials = credentialsOf(protocol.operations[operation]!.identity, login)
      answered = undefined
      const client = createClient(protocol, transport) as unknown as Record<string, Invoke>
      let answer: { outcome: string }
      try {
        answer = await client[operation]!(body, { messageId })
      } catch (error) {
        if (error instanceof ClientRequestError) return undefined
        throw error
      }
      if (answer.outcome === 'unavailable') return { kind: 'unavailable' }
      if (answer.outcome === 'uncertain' || answered === undefined) return { kind: 'uncertain' }
      return { kind: 'response', outcome: answer.outcome, body: plain(answered) }
    },
  }
  return { kind: 'link', link }
}
