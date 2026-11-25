import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  bringsOrigin,
  commandInput,
  keepsTheWords,
  judgeIntakeBlocks,
  originalContent,
  parseInputSourceName,
  screenInput,
  type IntakeProcessor,
  type Resolution,
  type RoutedInput,
  type SenderView,
  type SessionAccess,
  type SessionCommand,
  type SessionFailure,
} from '@omne-harness/session-contract'
import type { SessionDependencies } from './dependencies.ts'
import { messageOf, OWNERS, unavailable } from './failures.ts'

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>
type Message = Ordinary['message']
type Screened = Outcome<SessionCommand, SessionFailure>
type Sources<P> = Pick<SessionDependencies<P>, 'sources' | 'admission' | 'resolver'>

const FIELD = { accept: 'value', interrupt: 'urgent', create: 'creation.initial' } as const

function withMessage(command: SessionCommand, message: Message): SessionCommand {
  if (command.kind === 'accept' && command.input.value.kind === 'ordinary')
    return { ...command, input: { ...command.input, value: { ...command.input.value, message } } }
  if (command.kind === 'interrupt')
    return { ...command, input: { ...command.input, urgent: { ...command.input.urgent, message } } }
  return command
}

function current<T>(
  owner: 'sources' | 'admission' | 'resolver',
  what: string,
  read: () => T | null,
) {
  try {
    const value = read()
    return value === null ? fail(unavailable(OWNERS[owner], `${what} is absent`)) : succeed(value)
  } catch (error) {
    return fail(unavailable(OWNERS[owner], `${what} cannot be read: ${messageOf(error)}`))
  }
}

function acceptsOf<P>(dependencies: Sources<P>, input: Ordinary) {
  const sources = current('sources', 'the registry of input sources', () =>
    dependencies.sources.current(),
  )
  if ('failure' in sources) return sources
  const name = parseInputSourceName(input.source)
  const found = name === null ? null : sources.ok.lookup(name)
  if (found === null || found.kind === 'absent')
    return fail(unavailable(OWNERS.sources, `the input source ${input.source} is not registered`))
  return succeed(found.declaration.accepts)
}

/** The processors this input goes through: none where none are registered, or its source is unscreened. */
function processorsOf<P>(
  dependencies: Sources<P>,
  input: Ordinary,
): Outcome<readonly IntakeProcessor<P>[], SessionFailure> {
  const processors = current('admission', 'the list of processors before intake', () =>
    dependencies.admission.current(),
  )
  // With nothing to run the source need not be known here: the commit judges it.
  if ('ok' in processors && processors.ok.length === 0) return processors
  const accepts = acceptsOf(dependencies, input)
  if ('failure' in accepts) return accepts
  return accepts.ok.subject !== 'member' && !accepts.ok.screened ? succeed([]) : processors
}

/** The input as the processors of its source left it; a block names the block it refused. */
async function processed<P>(
  dependencies: Sources<P>,
  access: SessionAccess<P>,
  operation: SessionCommand['input']['operation'],
  input: Ordinary,
  field: string,
  start: Message,
): Promise<Outcome<Message, SessionFailure>> {
  const processors = processorsOf(dependencies, input)
  if ('failure' in processors) return processors
  const original = originalContent(input.message)
  const screened = await screenInput({
    processors: processors.ok,
    start,
    original,
    source: input.source,
    request: { input: input.input, operation },
    access,
  })
  if (screened.kind === 'screened') return succeed(screened.effective)
  const { processor } = screened
  if (screened.kind === 'unavailable')
    return fail(unavailable(OWNERS.admission, `processor ${processor}: ${screened.diagnostic}`))
  const index = original.blocks.findIndex(block => block.id === screened.block)
  return fail({
    kind: 'invalid',
    field: index < 0 ? field : `${field}.blocks[${index}]`,
    reason: `${processor}: ${screened.reason}`,
  })
}

const MEMBER_ONLY = Object.freeze(succeed(null))

async function answerOf(resolve: () => Promise<Resolution>): Promise<Resolution> {
  try {
    return await resolve()
  } catch (error) {
    return { kind: 'unavailable', diagnostic: `threw: ${messageOf(error)}` }
  }
}

type Resolver<P> = Exclude<
  ReturnType<NonNullable<Sources<P>['resolver']>['current']>,
  'none' | null
>

function outcomeOf(
  answer: Resolution,
  original: Message,
  field: string,
): Outcome<Message | null, SessionFailure> {
  switch (answer.kind) {
    case 'input':
      return keepsTheWords(original, answer.effective)
        ? succeed(answer.effective)
        : fail(unavailable(OWNERS.resolver, 'the resolver changed the words it was given'))
    case 'refused':
      return fail({ kind: 'invalid', field, reason: answer.reason })
    case 'operation': {
      const { name, args, asked } = answer
      return fail({ kind: 'unsupported', request: { name, args, asked } })
    }
    case 'unavailable':
      return fail(unavailable(OWNERS.resolver, answer.diagnostic))
  }
}

function resolverFor<P>(
  dependencies: Sources<P>,
  input: Ordinary,
): Outcome<Resolver<P> | null, SessionFailure> {
  const declared = dependencies.resolver
  if (declared === undefined) return MEMBER_ONLY
  const resolver = current('resolver', 'the utterance resolver', () => declared.current())
  if ('ok' in resolver && resolver.ok === 'none') return MEMBER_ONLY
  const accepts = acceptsOf(dependencies, input)
  if ('failure' in accepts) return accepts
  if (accepts.ok.subject !== 'member') return MEMBER_ONLY
  if ('failure' in resolver) return resolver
  return resolver.ok === 'none' ? MEMBER_ONLY : succeed(resolver.ok)
}

/** A member's words as the resolver read them; a refusal is not queued and an operation is not a message. */
async function resolved<P>(
  dependencies: Sources<P>,
  access: SessionAccess<P>,
  command: SessionCommand,
  input: Ordinary,
  field: string,
): Promise<Outcome<Message | null, SessionFailure>> {
  const found = resolverFor(dependencies, input)
  if ('failure' in found) return found
  const resolver = found.ok
  if (resolver === null) return MEMBER_ONLY
  const original = originalContent(input.message)
  const { seen } = command.input as Readonly<{ seen?: SenderView }>
  const answer = await answerOf(() =>
    resolver.resolve({
      original,
      seen: seen ?? null,
      source: input.source,
      request: { input: input.input, operation: command.input.operation },
      access,
    }),
  )
  return outcomeOf(answer, original, field)
}

/** The command to commit: its input as the resolver and the processors before intake left it (SE-37, SE-38). */
export async function screenCommand<P>(
  dependencies: Sources<P>,
  access: SessionAccess<P>,
  command: SessionCommand,
): Promise<Screened> {
  const input = commandInput(command)
  if (input === null) return succeed(command)
  const field = `${FIELD[command.kind as keyof typeof FIELD]}.message`
  if (bringsOrigin(input.message))
    return fail({
      kind: 'invalid',
      field,
      reason: 'a text says where it came from only when intake says so',
    })
  const original = originalContent(input.message)
  const inline = judgeIntakeBlocks(original)
  if (inline?.kind === 'inline')
    return fail({
      kind: 'invalid',
      field: `${field}.blocks[${inline.index}]`,
      reason: 'a block of inline bytes is not accepted: upload the media and send its reference',
    })
  // The first input of a new session goes through no processor: it carries words only.
  const words =
    command.kind === 'create'
      ? MEMBER_ONLY
      : await resolved(dependencies, access, command, input, field)
  if ('failure' in words) return words
  const effective =
    command.kind === 'create'
      ? succeed(original)
      : await processed(
          dependencies,
          access,
          command.input.operation,
          input,
          field,
          words.ok ?? original,
        )
  if ('failure' in effective) return effective
  const unmeasured = judgeIntakeBlocks(effective.ok)
  if (unmeasured !== null)
    return fail(
      unavailable(
        OWNERS.admission,
        `no processor before intake measured the content block ${unmeasured.block} refers to`,
      ),
    )
  return succeed(withMessage(command, effective.ok))
}
