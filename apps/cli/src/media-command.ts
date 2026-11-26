import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { mediaProtocol, type MediaProtocol } from '@omne-harness/media-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { BodyOf } from '@omne-harness/sdk/core'
import type { CliOutput, CommandEnvironment, CommandSpec, ExitCode } from './cli-types.ts'
import {
  loadLogin,
  localFailure,
  missingOption,
  serverOption,
  unrecognized,
  usageError,
  type Option,
} from './command-support.ts'
import type { CallResult, Link } from './link.ts'
import { readOptions } from './options.ts'
import { report, type RequestEcho } from './report.ts'

type Operations = MediaProtocol['operations']
type Reference = BodyOf<Operations['describe-media']>['ref']
type Context = Readonly<{ name: string; link: Link; tenant: TenantId; newId: () => string }>
type Sender = Omit<Context, 'name'>
export type MediaReference = Reference
/** What an action ends with: a result to print with what it repeats, or the exit a local fault gives. */
type Ending =
  | Readonly<{ result: CallResult | undefined; echo: RequestEcho; uncertain?: string }>
  | Readonly<{ local: string }>
  | Readonly<{ usage: string }>

const PAGE_BYTES = 262_144
const TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
}
const digestOf = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const succeeded = (
  result: CallResult | undefined,
): result is Extract<CallResult, { kind: 'response' }> =>
  result?.kind === 'response' && result.outcome === 'succeeded'

function call<K extends keyof Operations & string>(
  context: Sender,
  operation: K,
  body: BodyOf<Operations[K]>,
) {
  return context.link.call(mediaProtocol, operation, body, context.newId())
}

/** The reference a person pastes from the output of `put`. Whether it is one is the contract's to say. */
function referenceOf(text: string): Reference {
  try {
    return JSON.parse(text) as Reference
  } catch {
    return text as unknown as Reference
  }
}

/** Sends the parts from the one the server says is next; the first that is not taken stops it. */
async function sendParts(
  context: Sender,
  upload: string,
  bytes: Uint8Array,
  from: Readonly<{ nextSequence: number; partBytes: number }>,
): Promise<{ result: CallResult | undefined } | null> {
  const { partBytes } = from
  for (let sequence = from.nextSequence; sequence * partBytes < bytes.byteLength; sequence += 1) {
    const part = bytes.subarray(sequence * partBytes, (sequence + 1) * partBytes)
    const { tenant } = context
    const result = await call(context, 'append-upload-part', { tenant, upload, sequence, part })
    if (!succeeded(result)) return { result }
  }
  return null
}

export type ReadFile =
  | Readonly<{ file: string; mediaType: string; bytes: Uint8Array }>
  | Readonly<{ usage: string }>
  | Readonly<{ local: string }>

export async function readUpload(file: string, mediaType?: string): Promise<ReadFile> {
  const type = mediaType ?? TYPES[extname(file).toLowerCase()]
  if (type === undefined)
    return { usage: `the name of the file ${file} says no type; give --media-type` }
  const bytes = await readFile(file).catch(() => undefined)
  if (bytes === undefined) return { local: `cannot read ${file}; nothing was sent` }
  return { file, mediaType: type, bytes }
}

/** Begins, sends the parts and commits; the answer that stopped it, or the reference committed. */
async function sendUpload(
  context: Sender,
  read: Extract<ReadFile, { file: string }>,
  upload: string,
): Promise<Readonly<{ result: CallResult | undefined; ref: Reference | null }>> {
  const { tenant } = context
  const { mediaType, bytes } = read
  const plain = { tenant, upload, mediaType, bytes: bytes.byteLength }
  let begun = await call(context, 'begin-upload', { ...plain, name: basename(read.file) })
  if (begun?.kind === 'response' && begun.outcome === 'protocol-rejected')
    begun = await call(context, 'begin-upload', plain)
  if (!succeeded(begun)) return { result: begun, ref: null }
  const { status } = begun.body as {
    status: { kind: string; nextSequence: number; partBytes: number }
  }
  // An upload already committed takes no part; committing again answers its reference.
  const stopped =
    status.kind === 'uploading' ? await sendParts(context, upload, bytes, status) : null
  if (stopped !== null) return { result: stopped.result, ref: null }
  const digest = digestOf(bytes)
  const committed = await call(context, 'commit-upload', { tenant, upload, digest })
  const ref = succeeded(committed) ? (committed.body as { ref: Reference }).ref : null
  return { result: committed, ref }
}

async function prepareUpload(
  context: Sender,
  ref: Reference,
): Promise<
  | Readonly<{ ready: true }>
  | Readonly<{ result: CallResult | undefined }>
  | Readonly<{ unready: string }>
> {
  const result = await call(context, 'prepare-media', { tenant: context.tenant, ref })
  if (!succeeded(result)) return { result }
  const { preprocess } = result.body as { preprocess: { kind: string; reason?: string } }
  if (preprocess.kind === 'not-needed' || preprocess.kind === 'done') return { ready: true }
  return { unready: preprocess.reason ?? preprocess.kind }
}

function attachmentKind(mediaType: string): 'image' | 'voice' | 'file' {
  if (mediaType.startsWith('image/')) return 'image'
  return mediaType.startsWith('audio/') ? 'voice' : 'file'
}

type Attachment = Readonly<{ kind: 'image' | 'voice' | 'file'; ref: Reference }>
type Attached =
  | Readonly<{ attachments: Attachment[] }>
  | Readonly<{ stop: CallResult | Readonly<{ local: string }> | undefined; refused: string | null }>

export async function attachUploads(
  sender: Sender,
  files: readonly Extract<ReadFile, { file: string }>[],
): Promise<Attached> {
  const attachments: Attachment[] = []
  for (const read of files) {
    const { result, ref } = await sendUpload(sender, read, sender.newId())
    if (ref === null) return { stop: result, refused: read.file }
    const prepared = await prepareUpload(sender, ref)
    if ('result' in prepared) return { stop: prepared.result, refused: read.file }
    if ('unready' in prepared) {
      const local = `the attachment ${read.file} is not ready (its preprocessing: ${prepared.unready}); the input was not sent`
      return { stop: { local }, refused: null }
    }
    attachments.push({ kind: attachmentKind(read.mediaType), ref })
  }
  return { attachments }
}

async function put(context: Context, values: Option): Promise<Ending> {
  const file = values.get('--file') ?? ''
  const read = await readUpload(file, values.get('--media-type'))
  if (!('file' in read)) return read
  const upload = values.get('--upload') ?? context.newId()
  const { result } = await sendUpload(context, read, upload)
  return {
    result,
    echo: { upload, file },
    uncertain: `omne ${context.name}: to go on with this upload, run the same command with --upload ${upload}\n`,
  }
}

async function get(context: Context, values: Option): Promise<Ending> {
  const ref = referenceOf(values.get('--ref') ?? '')
  const out = values.get('--out') ?? ''
  const pages: Buffer[] = []
  let mediaType = ''
  for (let offset: number | null = 0; offset !== null;) {
    const page = await call(context, 'read-media-page', {
      tenant: context.tenant,
      ref,
      offset,
      limit: PAGE_BYTES,
    })
    if (!succeeded(page)) return { result: page, echo: { out } }
    const body = page.body as { part: string; next: number | null; mediaType: string }
    pages.push(Buffer.from(body.part, 'base64'))
    mediaType = body.mediaType
    offset = body.next
  }
  const bytes = Buffer.concat(pages)
  const written = await writeFile(out, bytes).then(
    () => true,
    () => false,
  )
  if (!written) return { local: `cannot write ${out}` }
  const body = { bytes: bytes.byteLength, mediaType, digest: digestOf(bytes) }
  return { result: { kind: 'response', outcome: 'succeeded', body }, echo: { out } }
}

async function describe(context: Context, values: Option): Promise<Ending> {
  const ref = referenceOf(values.get('--ref') ?? '')
  return {
    result: await call(context, 'describe-media', { tenant: context.tenant, ref }),
    echo: {},
  }
}

type Spec = Readonly<{
  options: readonly string[]
  required: readonly string[]
  run: (context: Context, values: Option) => Promise<Ending>
}>
const SPECS: Readonly<Record<string, Spec>> = {
  put: { options: ['--file', '--media-type', '--upload'], required: ['--file'], run: put },
  get: { options: ['--ref', '--out'], required: ['--ref', '--out'], run: get },
  describe: { options: ['--ref'], required: ['--ref'], run: describe },
}

/** The action and its options as given; a string is the usage error. */
function invocationOf(
  args: readonly string[],
): Readonly<{ name: string; spec: Spec; values: Option }> | string {
  const [action = '', ...rest] = args
  const name = `media ${action}`
  const spec = Object.hasOwn(SPECS, action) ? SPECS[action] : undefined
  if (spec === undefined) return unrecognized('media')
  const options = readOptions(rest, {
    accepted: [serverOption, ...spec.options],
    required: spec.required,
  })
  if (options.kind === 'unrecognized') return unrecognized(name)
  if (options.kind === 'missing') return missingOption(name, options.option)
  return { name, spec, values: options.values }
}

async function runMedia(
  args: readonly string[],
  output: CliOutput,
  environment: CommandEnvironment,
): Promise<ExitCode> {
  const invocation = invocationOf(args)
  if (typeof invocation === 'string') return usageError(output, invocation)
  const { name, spec, values } = invocation
  const loaded = loadLogin(values, output, environment)
  if (loaded.kind === 'exit') return loaded.code
  const { link, tenant } = loaded
  const ending = await spec.run({ name, link, tenant, newId: environment.services.newId }, values)
  if ('usage' in ending) return usageError(output, `omne ${name}: ${ending.usage}\n`)
  if ('local' in ending) return localFailure(output, `omne ${name}: ${ending.local}\n`)
  if (ending.result === undefined) return usageError(output, unrecognized(name))
  const echo = { tenant: encodeTenantText(tenant), ...ending.echo }
  const code = report(name, ending.result, echo, output)
  if (code === 5 && ending.uncertain !== undefined) output.stderr(ending.uncertain)
  return code
}

export const mediaCommand: CommandSpec = {
  name: 'media',
  usage: 'put|get|describe',
  summary:
    'Put a file into the media of the acting tenant and print its content reference (put --file <path>, --media-type <type> when the name says none; --upload <name> goes on with an upload), read one back to a file (get --ref <JSON> --out <path>), or describe one (describe --ref <JSON>).',
  run: runMedia,
}
