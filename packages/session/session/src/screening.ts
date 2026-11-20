import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  commandInput,
  judgeIntakeBlocks,
  originalContent,
  parseInputSourceName,
  screenInput,
  type IntakeProcessor,
  type RoutedInput,
  type SessionAccess,
  type SessionCommand,
  type SessionFailure,
} from '@omne-harness/session-contract'
import type { SessionDependencies } from './dependencies.ts'
import { messageOf, OWNERS, unavailable } from './failures.ts'

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>
type Message = Ordinary['message']
type Screened = Outcome<SessionCommand, SessionFailure>
type Sources<P> = Pick<SessionDependencies<P>, 'sources' | 'admission'>

const FIELD = { accept: 'value', interrupt: 'urgent', create: 'creation.initial' } as const

function withMessage(command: SessionCommand, message: Message): SessionCommand {
  if (command.kind === 'accept' && command.input.value.kind === 'ordinary')
    return { ...command, input: { ...command.input, value: { ...command.input.value, message } } }
  if (command.kind === 'interrupt')
    return { ...command, input: { ...command.input, urgent: { ...command.input.urgent, message } } }
  return command
}

function current<T>(owner: 'sources' | 'admission', what: string, read: () => T | null) {
  try {
    const value = read()
    return value === null ? fail(unavailable(OWNERS[owner], `${what} is absent`)) : succeed(value)
  } catch (error) {
    return fail(unavailable(OWNERS[owner], `${what} cannot be read: ${messageOf(error)}`))
  }
}

/** The processors this input goes through: none when its source is declared unscreened. */
function processorsOf<P>(
  dependencies: Sources<P>,
  input: Ordinary,
): Outcome<readonly IntakeProcessor<P>[], SessionFailure> {
  const sources = current('sources', 'the registry of input sources', () =>
    dependencies.sources.current(),
  )
  if ('failure' in sources) return sources
  const name = parseInputSourceName(input.source)
  const found = name === null ? null : sources.ok.lookup(name)
  if (found === null || found.kind === 'absent')
    return fail(unavailable(OWNERS.sources, `the input source ${input.source} is not registered`))
  const { accepts } = found.declaration
  if (accepts.subject !== 'member' && !accepts.screened) return succeed([])
  return current('admission', 'the list of processors before intake', () =>
    dependencies.admission.current(),
  )
}

/** The command to commit: its input as the processors before intake left it (SE-37, SE-38). */
export async function screenCommand<P>(
  dependencies: Sources<P>,
  access: SessionAccess<P>,
  command: SessionCommand,
): Promise<Screened> {
  const input = commandInput(command)
  if (input === null) return succeed(command)
  const field = `${FIELD[command.kind as keyof typeof FIELD]}.message`
  const original = originalContent(input.message)
  const refused = judgeIntakeBlocks(original)
  if (refused?.kind === 'inline')
    return fail({
      kind: 'invalid',
      field: `${field}.blocks[${refused.index}]`,
      reason: 'a block of inline bytes is not accepted: upload the media and send its reference',
    })
  let effective = original
  if (command.kind !== 'create') {
    const processors = processorsOf(dependencies, input)
    if ('failure' in processors) return processors
    const request = { input: input.input, operation: command.input.operation }
    const screened = await screenInput({
      processors: processors.ok,
      original,
      source: input.source,
      request,
      access,
    })
    if (screened.kind === 'blocked') {
      const index = original.blocks.findIndex(block => block.id === screened.block)
      return fail({
        kind: 'invalid',
        field: index < 0 ? field : `${field}.blocks[${index}]`,
        reason: `${screened.processor}: ${screened.reason}`,
      })
    }
    if (screened.kind === 'unavailable')
      return fail(
        unavailable(OWNERS.admission, `processor ${screened.processor}: ${screened.diagnostic}`),
      )
    effective = screened.effective
  }
  const unmeasured = judgeIntakeBlocks(effective)
  if (unmeasured !== null)
    return fail(
      unavailable(
        OWNERS.admission,
        `no processor before intake measured the content block ${unmeasured.block} refers to`,
      ),
    )
  return succeed(command.kind === 'create' ? command : withMessage(command, effective))
}
