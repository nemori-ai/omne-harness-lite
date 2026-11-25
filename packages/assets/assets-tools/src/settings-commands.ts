import { digestBytes } from '@omne-harness/assets'
import type { Handler, Ready } from './commands.ts'
import type { HeldSetting, HeldSettings, SettingWritten } from './port.ts'
import {
  columns,
  conflict,
  denied,
  done,
  invalid,
  unavailable,
  unknown,
  type Answer,
} from './results.ts'
import { noCategory, notHeld } from './text.ts'

type Ordinary = Extract<HeldSetting, { kind: 'ordinary' }>
type Reading = 'settings' | 'configure'
type Change = Parameters<HeldSettings['write']>[0]['change']

const VALUE_SHOWN_MAX = 200
const SOURCE: Readonly<Record<NonNullable<Ordinary['source']>, string>> = {
  tenant: 'set here',
  organization: 'from the organization',
  default: 'default',
}
const CONFIGURED = { yes: 'set', no: 'not set', unknown: 'not known whether set' } as const
const NOT_WRITABLE = {
  locked: 'locked by the organization',
  'prohibited-above': 'prohibited by the organization',
  'not-a-source': 'this layer does not set it',
  'out-of-bound': 'the value is outside what the organization allows',
} as const
const BY_A_PERSON =
  'configure writes or clears an ordinary setting. A secret or a permission is set by a person, on the settings page or on a card.'
const GIVE_ONE = 'give value to write the setting, or clear: true to clear what this layer set.'
const NOT_KNOWN =
  'it is not known whether this took effect; send the same command again with the same id: a value this layer already has is not written twice'

const json = (value: unknown) => JSON.stringify(value) ?? 'null'

function shown(value: unknown): string {
  const points = [...json(value)]
  return points.length <= VALUE_SHOWN_MAX
    ? points.join('')
    : `${points.slice(0, VALUE_SHOWN_MAX).join('')}...`
}

function typeOf(schema: unknown): string {
  const read = (key: string): unknown =>
    typeof schema === 'object' && schema !== null ? Reflect.get(schema, key) : undefined
  const choices = read('enum')
  if (Array.isArray(choices)) return choices.map(json).join('|')
  const type = read('type')
  return typeof type === 'string' ? type : 'json'
}

const notWritable = (setting: Ordinary, why: keyof typeof NOT_WRITABLE) =>
  `${setting.item} cannot be written here: ${NOT_WRITABLE[why]}`

function rowOf(setting: HeldSetting): readonly string[] {
  if (setting.kind === 'secret') return [setting.item, 'secret', CONFIGURED[setting.configured]]
  if (setting.kind === 'permission') return [setting.item, 'permission', 'not read here']
  const { effective, source, writable } = setting
  return [
    setting.item,
    effective.kind === 'set' ? shown(effective.value) : 'unset',
    source === null ? '' : SOURCE[source],
    typeOf(setting.schema),
    writable === 'yes' ? '' : `cannot be written here: ${NOT_WRITABLE[writable]}`,
  ]
}

/** The settings of one held asset as the tenant layer has them now, or why they cannot be read. */
async function held(
  { source, faces }: Ready,
  command: Reading,
  asset: Readonly<{ category: string; name: string }>,
): Promise<Readonly<{ face: HeldSettings; items: readonly HeldSetting[] }> | Answer> {
  if (faces.categories.describe(asset.category) === undefined)
    return invalid(noCategory(faces.categories, asset.category))
  let face: HeldSettings | undefined
  let read: Awaited<ReturnType<HeldSettings['list']>> = 'unavailable'
  try {
    face = source.settings()
    if (face !== undefined) read = await face.list(asset)
  } catch {
    read = 'unavailable'
  }
  if (face === undefined || read === 'unavailable') return unavailable(command)
  if (read === 'denied') return denied()
  if (read === 'not-held') return invalid(notHeld(asset.category, asset.name))
  return { face, items: read }
}

export const settings: Handler<'settings'> = async (ready, { category, name }) => {
  const read = await held(ready, 'settings', { category, name })
  if (!('items' in read)) return read
  const body =
    read.items.length === 0
      ? ['It has no setting.']
      : [...columns(read.items.map(rowOf)), BY_A_PERSON]
  return done(`settings ${category} ${name}`, body, ready.source.revision())
}

// AS-28: only an ordinary item is written; a secret or a permission is refused before any write.
function writableOf(
  asset: Readonly<{ category: string; name: string }>,
  items: readonly HeldSetting[],
  item: string,
): Ordinary | Answer {
  const found = items.find(one => one.item === item)
  if (found === undefined) {
    const ordinary = items.filter(one => one.kind === 'ordinary').map(one => one.item)
    const listed =
      ordinary.length === 0
        ? 'It has no ordinary setting.'
        : `Ordinary settings: ${ordinary.join(', ')}.`
    return invalid(`${asset.category} ${asset.name} has no setting "${item}". ${listed}`)
  }
  if (found.kind === 'secret')
    return invalid(
      `${item} is a secret. Its value is not written through this tool: ask the user to set it on the settings page.`,
    )
  if (found.kind === 'permission')
    return invalid(
      `${item} is a permission. It is not read or written through this tool: the user decides it on a card or on the settings page.`,
    )
  return found.writable === 'yes'
    ? found
    : invalid(`${notWritable(found, found.writable)}. Nothing was changed.`)
}

const already = (setting: Ordinary, change: Change): boolean =>
  change.kind === 'clear'
    ? setting.own.kind === 'unset'
    : setting.own.kind === 'set' && json(setting.own.value) === json(change.value)

function refused(
  asset: Readonly<{ category: string; name: string }>,
  setting: Ordinary,
  outcome: Exclude<SettingWritten, 'written' | 'no-change'>,
): Answer {
  switch (outcome) {
    case 'denied':
      return denied()
    case 'gone':
      return invalid(notHeld(asset.category, asset.name))
    case 'invalid':
      return invalid(
        `the value does not fit ${setting.item}: its schema is ${json(setting.schema)}. Nothing was changed.`,
      )
    case 'conflict':
      return conflict(
        `${setting.item} changed while this was being written; read settings, then send the command again with a new id.`,
      )
    case 'unavailable':
      return unavailable('configure')
    case 'unknown':
      return unknown('configure', NOT_KNOWN)
    default:
      return invalid(`${notWritable(setting, outcome)}. Nothing was changed.`)
  }
}

export const configure: Handler<'configure'> = async (ready, params) => {
  const { id, category, name, item, value, clear } = params
  if ((value === undefined) === (clear !== true)) return invalid(GIVE_ONE)
  const change: Change = clear === true ? { kind: 'clear' } : { kind: 'set', value }
  const asset = { category, name }
  const read = await held(ready, 'configure', asset)
  if (!('items' in read)) return read
  const setting = writableOf(asset, read.items, item)
  if (!('kind' in setting)) return setting
  const said = change.kind === 'clear' ? { cleared: true } : { value }
  const receipt = (changed: boolean) => json({ id, category, name, item, ...said, changed })
  const revision = () => ready.source.revision()
  if (already(setting, change))
    return done('configure', [receipt(false), 'this layer already has it so.'], revision())
  const facts = json([id, category, name, item, change, setting.revision])
  const operation = `configure/${digestBytes(new TextEncoder().encode(facts))}`
  let outcome: SettingWritten
  try {
    outcome = await read.face.write({ asset, item, operation, revision: setting.revision, change })
  } catch {
    outcome = 'unknown'
  }
  if (outcome === 'written')
    return done('configure', [receipt(true), 'written. settings shows the value now.'], revision())
  if (outcome === 'no-change')
    return done('configure', [receipt(false), 'this layer already has it so.'], revision())
  return refused(asset, setting, outcome)
}
