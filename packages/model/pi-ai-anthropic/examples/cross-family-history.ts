import { openTokenizerExecutor } from './support.ts'
import { type ModelProfile, type Parameter } from '@omne-harness/model-contract'
import { projectReplay } from '@omne-harness/model-contract/provider'
import {
  anthropicTokenizerResources,
  createAnthropicFamily,
  officialAnthropicProfiles,
} from '@omne-harness/pi-ai-anthropic'
import {
  createOpenAiFamily,
  officialOpenAiProfiles,
  openAiTokenizerResources,
} from '@omne-harness/pi-ai-openai'
import { replayFormatsOf } from '@omne-harness/pi-ai-transport'
import {
  assembleReply,
  closeTransport,
  declarationOf,
  executeOnce,
  exampleAdoption,
  fixRequest,
  openTransport,
  profileOf,
  RETRY_POLICY,
} from './support.ts'

const OPENAI_MODEL = 'openai/gpt-5.6-luna'
const ANTHROPIC_MODEL = 'anthropic/claude-opus-5.5'

const SHOWN = { toHuman: true, toModel: true }
const LIMITS = {
  toolArguments: {
    maxBytes: 65_536,
    maxDepth: 32,
    maxItems: 1_024,
    maxMembers: 256,
    maxStringLength: 65_536,
    maxNumberLength: 64,
  },
  maxReasoningText: 1_048_576,
}
const margin = { percent: '10', source: exampleAdoption('margin-policy') }

const executor = await openTokenizerExecutor([
  openAiTokenizerResources(),
  anthropicTokenizerResources(),
])
try {
  const openai = createOpenAiFamily({
    tokenizer: openAiTokenizerResources(),
    executor,
    limits: LIMITS,
    margin,
  })
  const anthropic = createAnthropicFamily({
    tokenizer: anthropicTokenizerResources(),
    executor,
    limits: LIMITS,
    margin,
  })
  const families = [openai, anthropic]
  const official = { retryPolicy: RETRY_POLICY, compactionTriggerPercent: '80' }
  const profiles = {
    openai: profileOf(officialOpenAiProfiles(official), OPENAI_MODEL),
    anthropic: profileOf(officialAnthropicProfiles(official), ANTHROPIC_MODEL),
  }

  function parametersAt(effort: 'low' | 'high'): readonly Parameter[] {
    return [
      { kind: 'reasoning-effort', value: effort },
      { kind: 'max-output-tokens', value: '2048' },
    ]
  }
  const OPENAI_PARAMETERS = parametersAt('high')
  const ANTHROPIC_PARAMETERS = parametersAt('low')

  const ROUNDS: readonly Readonly<{
    profile: ModelProfile
    parameters: readonly Parameter[]
    question: string
  }>[] = [
    {
      profile: profiles.openai,
      parameters: OPENAI_PARAMETERS,
      question:
        'A shop sells 3 pens for 2 dollars. How many pens can you buy with 14 dollars? Reply with the number only.',
    },
    {
      profile: profiles.anthropic,
      parameters: ANTHROPIC_PARAMETERS,
      question:
        'Multiply your number by 4 and subtract 17. Is the result a prime number? Reply with the result, then yes or no.',
    },
    {
      profile: profiles.openai,
      parameters: OPENAI_PARAMETERS,
      question: 'Write that result in base 5. Reply with the digits only.',
    },
    {
      profile: profiles.anthropic,
      parameters: ANTHROPIC_PARAMETERS,
      question:
        'Read those digits as a base 10 number. What is the sum of its distinct prime factors? Reply with the sum only.',
    },
  ]

  const history: unknown[] = []
  const producedIn = new Map<string, number>()

  const open = openTransport(families)
  try {
    for (const [at, round] of ROUNDS.entries()) {
      const number = at + 1
      const model = round.profile.definition.suppliers[0].model
      console.log(`\nround ${number}: ${model}`)
      history.push({
        id: `msg_example-user-question-${number}`,
        role: 'user',
        blocks: [{ kind: 'text', id: 'b1', visibility: SHOWN, text: round.question }],
      })
      const request = await fixRequest(families, round.profile, {
        system: [],
        messages: history,
        tools: [],
        toolChoice: 'auto',
        parameters: round.parameters,
      })

      const formats = replayFormatsOf(families, request.suppliers[0].adoption)
      if (formats === null) throw new Error(`no replay formats for ${model}`)
      const projection = projectReplay({
        messages: request.messages,
        declaration: request.declarations[0],
        formats: new Set(formats.accepts),
        off: false,
        resent: new Set(),
      })
      const carried: number[] = []
      const omitted: number[] = []
      for (const treatment of projection.treatments) {
        const from = producedIn.get(treatment.message) ?? 0
        if (treatment.continuable) {
          console.log(`replay: round ${from} carries parts [${treatment.carry.join(', ')}]`)
          if (treatment.carry.length > 0) carried.push(from)
        } else {
          console.log(
            `replay: round ${from} leaves out parts [${treatment.omit.join(', ')}], thinking ${treatment.thinking}`,
          )
          if (treatment.omit.length > 0) omitted.push(from)
        }
      }
      for (const diagnostic of projection.diagnostics)
        console.log(
          `replay diagnostic: round ${producedIn.get(diagnostic.message) ?? 0} scope ${diagnostic.scope} format ${diagnostic.format} omitted ${diagnostic.omittedParts}`,
        )
      console.log(`replay summary: carried [${carried.join(', ')}] omitted [${omitted.join(', ')}]`)

      const result = await executeOnce(open, request)
      if (!result.completed) break
      console.log(`reply state: round ${number} ${result.states > 0 ? 'yes' : 'no'}`)
      const id = `msg_example-assistant-round-${number}`
      const reply = assembleReply(id, result.facts, {
        scope: declarationOf(round.profile).produces,
        format: formats.produces,
      })
      producedIn.set(id, number)
      history.push(JSON.parse(JSON.stringify(reply)))
    }
  } finally {
    await closeTransport(open)
  }
} catch (error) {
  await executor.close()
  throw error
}
const closed = await executor.close()
if ('failure' in closed) throw new Error(JSON.stringify(closed.failure))
