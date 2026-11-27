import {
  InlineNotice,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import { modelProviderModels, modelProviderModelsRow } from '../parts.ts'
import { bodyOf, useAssetEntry, type AssetPort, type AssetView, type KeyRow } from './asset-body.ts'
import {
  MODEL_REASONING_EFFORTS,
  MODEL_SWITCHES,
  catalogOf,
  groupsOf,
  rowsOf,
  withEntry,
  withSwitch,
  type CatalogKind,
  type CatalogRow,
  type ModelRow,
  type Own,
} from './models-table.ts'

const MODALITIES: Readonly<Record<string, string>> = {
  text: '文字',
  image: '图片',
  audio: '声音',
  video: '视频',
  file: '文件',
}
const PROVIDER_DEFAULT = 'provider-default'
const KIND_TITLES: Readonly<Record<CatalogKind, string>> = {
  llm: '聊天',
  decisions: '判定',
}
const LOCKED: Readonly<Record<string, string>> = {
  locked: '这两项被上层锁定，这里不能改。',
}
const NOT_EDITABLE = '这一层不能改这两项。'

const modalities = (kinds: readonly string[]) =>
  kinds.map(kind => MODALITIES[kind] ?? kind).join('、')

const UNSET: Own = { kind: 'unset' }
const ownOf = (row: KeyRow): Own => (row.view.own as Own | undefined) ?? UNSET

type Wired = Readonly<{ view: AssetView; switches: KeyRow; efforts: KeyRow }>

function ModelLine({ row, wired }: Readonly<{ row: ModelRow; wired: Wired }>): JSX.Element {
  const { view, switches, efforts } = wired
  // The settings machine takes no change while the row is being written or read again.
  const locked = (setting: KeyRow) =>
    setting.view.editable?.kind === 'no' ||
    setting.write?.kind === 'submitting' ||
    setting.read?.kind === 'reading'
  const pick = (value: string) =>
    view.setValue(
      efforts.key ?? '',
      withEntry(ownOf(efforts), row.model, value === PROVIDER_DEFAULT ? undefined : value),
    )
  return (
    <TableRow {...modelProviderModelsRow.props}>
      <TableCell>
        <div className="omne-model-row-title">{row.title}</div>
        {row.title !== row.model && <div className="omne-model-row-fact">{row.model}</div>}
      </TableCell>
      <TableCell>
        <div className="omne-model-row-fact">{`收：${modalities(row.input)} · 发：${modalities(row.output)}`}</div>
        <Limit row={row} />
      </TableCell>
      <TableCell>
        <Switch
          checked={row.on}
          disabled={locked(switches)}
          aria-label={`启用 ${row.title}`}
          onCheckedChange={on =>
            view.setValue(switches.key ?? '', withSwitch(ownOf(switches), row.kind, row.model, on))
          }
        />
        <div className="omne-model-row-fact">
          {row.onFrom === 'tenant' ? '这一层设的' : '发行缺省'}
        </div>
      </TableCell>
      <TableCell>
        {row.kind !== 'llm' ? null : row.efforts.length === 0 ? (
          <span className="omne-model-row-fact">不能调推理强度</span>
        ) : (
          <>
            <div className="omne-model-row-fact">{row.efforts.join('、')}</div>
            <Select
              value={row.effort ?? PROVIDER_DEFAULT}
              onValueChange={pick}
              disabled={locked(efforts)}
            >
              <SelectTrigger aria-label={`${row.title} 的缺省推理强度`} size="sm">
                <SelectValue>{row.effort ?? '供应商默认'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PROVIDER_DEFAULT}>供应商默认</SelectItem>
                {row.efforts.map(effort => (
                  <SelectItem key={effort} value={effort}>
                    {effort}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {row.unsupported !== undefined && (
              <div className="omne-model-row-fact">{`存的是 ${row.unsupported}，这个模型现在不支持，按供应商默认`}</div>
            )}
          </>
        )}
      </TableCell>
    </TableRow>
  )
}

/** The limit a person reads of a model: the window of a chat model, the questions of a decisions model. */
function Limit({ row }: Readonly<{ row: ModelRow }>): JSX.Element | null {
  if (row.kind === 'llm') return <div className="omne-model-row-fact">{`窗口 ${row.window}`}</div>
  if (row.maxQuestions === undefined) return null
  return <div className="omne-model-row-fact">{`每次至多 ${row.maxQuestions} 题`}</div>
}

// A write this block made that did not land: the settings machine's words; an unknown one can be asked again.
function WriteNotice({ setting, view }: Readonly<{ setting: KeyRow; view: AssetView }>) {
  const { write } = setting
  if (write?.notice === undefined) return null
  const again =
    write.kind === 'unknown'
      ? { action: { label: '再确认', onClick: () => view.confirm(setting.key ?? '') } }
      : {}
  return (
    <InlineNotice tone={write.kind === 'refused' ? 'danger' : 'caution'} {...again}>
      {write.notice.text}
    </InlineNotice>
  )
}

function LockNote({ setting }: Readonly<{ setting: KeyRow }>) {
  const { editable } = setting.view
  if (editable?.kind !== 'no') return null
  return <p className="omne-model-note">{LOCKED[editable.reason ?? ''] ?? NOT_EDITABLE}</p>
}

function Block({ children }: Readonly<{ children: JSX.Element }>): JSX.Element {
  return (
    <Section id="model-provider-models" title="模型" {...modelProviderModels.props}>
      {children}
    </Section>
  )
}

type BlockProps = Readonly<{ port: AssetPort; tenant: string; category: string; name: string }>

/** The models a provider is fitted for: which are on, and the effort each takes when a session chose none. */
export function ModelsBlock({ port, tenant, category, name }: BlockProps): JSX.Element | null {
  const { view, entry } = useAssetEntry(port, tenant, category, name)
  const body = bodyOf(entry)
  if (body === undefined) return null
  const catalog = catalogOf(body)
  if (catalog === undefined)
    return (
      <Block>
        <p className="omne-model-note">读不出这家的模型目录。</p>
      </Block>
    )
  const settings = entry?.settings ?? []
  const switches = settings.find(setting => setting.view.item === MODEL_SWITCHES)
  const efforts = settings.find(setting => setting.view.item === MODEL_REASONING_EFFORTS)
  if (switches === undefined || efforts === undefined)
    return (
      <Block>
        <p className="omne-model-note">读不出这家的模型设置。</p>
      </Block>
    )
  return <ModelsTable catalog={catalog} wired={{ view, switches, efforts }} />
}

function ModelsTable({
  catalog,
  wired,
}: Readonly<{ catalog: readonly CatalogRow[]; wired: Wired }>) {
  const { view, switches, efforts } = wired
  return (
    <Block>
      <>
        <LockNote setting={switches} />
        <WriteNotice setting={switches} view={view} />
        <WriteNotice setting={efforts} view={view} />
        {groupsOf(rowsOf(catalog, ownOf(switches), ownOf(efforts))).map(group => (
          <div key={group.kind} className="omne-model-group">
            <h4 className="omne-model-group-title">{KIND_TITLES[group.kind]}</h4>
            <Table aria-label={KIND_TITLES[group.kind]}>
              <TableBody>
                {group.rows.map(row => (
                  <ModelLine key={row.model} row={row} wired={wired} />
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </>
    </Block>
  )
}
