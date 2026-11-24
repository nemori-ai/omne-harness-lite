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
  rowsOf,
  withEntry,
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
const LOCKED: Readonly<Record<string, string>> = {
  locked: '这两项被上层锁定，这里不能改。',
}
const NOT_EDITABLE = '这一层不能改这两项。'

const modalities = (kinds: readonly string[]) =>
  kinds.map(kind => MODALITIES[kind] ?? kind).join('、')

function ownOf(row: KeyRow): Own {
  const own = row.view.own as Own | undefined
  return own?.kind === 'set' ? own : { kind: 'unset' }
}

type Wired = Readonly<{ view: AssetView; switches: KeyRow; efforts: KeyRow }>

function ModelLine({ row, wired }: Readonly<{ row: ModelRow; wired: Wired }>): JSX.Element {
  const { view, switches, efforts } = wired
  const locked = (setting: KeyRow) =>
    setting.view.editable?.kind === 'no' || setting.write?.kind === 'submitting'
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
        <div className="omne-model-row-fact">{`窗口 ${row.window}`}</div>
      </TableCell>
      <TableCell>
        <Switch
          checked={row.on}
          disabled={locked(switches)}
          aria-label={`启用 ${row.title}`}
          onCheckedChange={on =>
            view.setValue(switches.key ?? '', withEntry(ownOf(switches), row.model, on))
          }
        />
        <div className="omne-model-row-fact">
          {row.onFrom === 'tenant' ? '这一层设的' : '发行缺省'}
        </div>
      </TableCell>
      <TableCell>
        {row.efforts.length === 0 ? (
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

function WriteNotice({ setting, view }: Readonly<{ setting: KeyRow; view: AssetView }>) {
  const { write } = setting
  if (write?.notice === undefined) return null
  if (write.kind === 'unknown')
    return (
      <InlineNotice
        tone="caution"
        action={{ label: '再确认', onClick: () => view.confirm(setting.key ?? '') }}
      >
        {write.notice.text}
      </InlineNotice>
    )
  return write.kind === 'refused' ? <InlineNotice>{write.notice.text}</InlineNotice> : null
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
  const editable = switches.view.editable
  const wired = { view, switches, efforts }
  return (
    <Block>
      <>
        {editable?.kind === 'no' && (
          <p className="omne-model-note">{LOCKED[editable.reason ?? ''] ?? NOT_EDITABLE}</p>
        )}
        <WriteNotice setting={switches} view={view} />
        <WriteNotice setting={efforts} view={view} />
        <Table>
          <TableBody>
            {rowsOf(catalog, ownOf(switches), ownOf(efforts)).map(row => (
              <ModelLine key={row.model} row={row} wired={wired} />
            ))}
          </TableBody>
        </Table>
      </>
    </Block>
  )
}
