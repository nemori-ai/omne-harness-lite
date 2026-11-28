import type { CreationDetail } from '@omne-harness/assets-protocol'
import type { JsonValue } from '@omne-harness/json-text'
import {
  Button,
  Field,
  InlineNotice,
  Input,
  LoadingState,
  RadioGroup,
  RadioGroupItem,
  Switch,
  Textarea,
} from '@omne-harness/ui-kit'
import { useId, useMemo, useState, type ChangeEvent, type JSX } from 'react'
import type { LocalFile } from '../model/assets-driver.ts'
import { bodyOfFields, bodyOfText, type Entered } from '../model/create-body.ts'
import type { Creating } from '../model/creation.ts'
import type { CategoryGovernance } from '../model/governance.ts'
import { formOf, type FormField } from '../model/value-control.ts'
import { assetsCreate, assetsCreateSubmit } from '../parts.ts'
import { NoticeLine } from './notice.tsx'

type Creatable = Exclude<CreationDetail, { kind: 'none' }>
type Limits = Extract<CreationDetail, { kind: 'directory' }>['limits']

export type CreateFormProps = Readonly<{
  view: CategoryGovernance
  creation: Creatable
  hint: string | null
  creating: Creating
  listed: (name: string) => boolean
}>

const busy = (creating: Creating): boolean =>
  creating.kind === 'sending' || creating.kind === 'unknown'

/** The form a category's creation asks for; the server's answer is the only judgment. */
export function CreateForm({ view, creation, hint, creating, listed }: CreateFormProps) {
  const [name, setName] = useState('')
  const id = useId()
  const trimmed = name.trim()
  const blocked = busy(creating) || trimmed === ''
  return (
    <form
      className="assets-create"
      aria-label="新建"
      {...assetsCreate.props}
      onSubmit={event => event.preventDefault()}
    >
      {hint !== null && <p className="assets-create-hint">{hint}</p>}
      <Field id={`${id}-name`} label="名字（必填）">
        <Input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} />
      </Field>
      {trimmed !== '' && listed(trimmed) && (
        <p className="assets-create-note">{`已有同名的 ${trimmed}：提交后会成为它的新版本。`}</p>
      )}
      {creation.kind === 'data' ? (
        <DataBody
          schema={creation.schema}
          blocked={blocked}
          submit={body => view.createFromData(trimmed, body)}
        />
      ) : (
        <DirectoryBody
          limits={creation.limits}
          blocked={blocked}
          submit={files => view.createFromDirectory(trimmed, files)}
        />
      )}
      <CreatingLine creating={creating} confirm={view.confirmCreate} />
    </form>
  )
}

function FieldControl({
  field,
  value,
  set,
}: {
  readonly field: FormField
  readonly value: string | boolean | undefined
  readonly set: (value: string | boolean) => void
}): JSX.Element {
  const id = useId()
  const label = `${field.title ?? field.key}${field.required ? '（必填）' : ''}`
  const control = field.control
  switch (control.kind) {
    case 'switch':
      return (
        <label className="assets-create-switch">
          <Switch checked={value === true} onCheckedChange={set} aria-label={label} />
          <span>{label}</span>
        </label>
      )
    case 'pick':
      return (
        <fieldset className="assets-create-pick">
          <legend>{label}</legend>
          <RadioGroup value={typeof value === 'string' ? value : ''} onValueChange={set}>
            {control.values.map(choice => (
              <label key={choice}>
                <RadioGroupItem value={choice} aria-label={choice} />
                <span>{choice}</span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      )
    case 'text':
    case 'number':
      return (
        <Field id={id} label={label}>
          <Input
            id={id}
            inputMode={control.kind === 'number' ? 'decimal' : 'text'}
            value={typeof value === 'string' ? value : ''}
            onChange={event => set(event.target.value)}
          />
        </Field>
      )
  }
}

function DataBody({
  schema,
  blocked,
  submit,
}: {
  readonly schema: JsonValue
  readonly blocked: boolean
  readonly submit: (body: JsonValue) => void
}) {
  const form = useMemo(() => formOf(schema), [schema])
  const [entered, setEntered] = useState<Entered>({})
  const [text, setText] = useState('{}')
  const read = form.kind === 'fields' ? bodyOfFields(form.fields, entered) : bodyOfText(text)
  return (
    <>
      {form.kind === 'fields' ? (
        form.fields.map(field => (
          <FieldControl
            key={field.key}
            field={field}
            value={entered[field.key]}
            set={value => setEntered(current => ({ ...current, [field.key]: value }))}
          />
        ))
      ) : (
        <Textarea
          aria-label="正文（JSON）"
          value={text}
          onChange={event => setText(event.target.value)}
        />
      )}
      {read.kind === 'invalid' && <p className="assets-create-note">{read.reason}</p>}
      <Button
        {...assetsCreateSubmit.props}
        disabled={blocked || read.kind === 'invalid'}
        onClick={() => read.kind === 'body' && submit(read.body)}
      >
        提交
      </Button>
    </>
  )
}

const DIRECTORY = { webkitdirectory: '' } as Record<string, string>

/** The path of a file inside the picked directory, without the directory's own name. */
function inside(file: File): string {
  const path = file.webkitRelativePath === '' ? file.name : file.webkitRelativePath
  return path.split('/').slice(1).join('/') || file.name
}

type Picked =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'read'; files: readonly LocalFile[] }>
  | Readonly<{ kind: 'unreadable'; paths: readonly string[] }>

async function pickedOf(list: readonly File[]): Promise<Picked> {
  const read = await Promise.all(
    list.map(file =>
      file.arrayBuffer().then(
        buffer => ({ path: inside(file), bytes: new Uint8Array(buffer) }),
        () => inside(file),
      ),
    ),
  )
  const unreadable = read.filter(item => typeof item === 'string')
  if (unreadable.length > 0) return { kind: 'unreadable', paths: unreadable }
  return { kind: 'read', files: read.filter(item => typeof item !== 'string') }
}

function overLimits(files: readonly LocalFile[], limits: Limits): readonly string[] {
  const total = files.reduce((sum, file) => sum + file.bytes.length, 0)
  const over: string[] = []
  if (files.length > limits.files) over.push(`文件数超过这一类的上限 ${limits.files} 个`)
  for (const file of files)
    if (file.bytes.length > limits.fileBytes)
      over.push(`${file.path} 超过单个文件的上限 ${limits.fileBytes} 字节`)
  if (total > limits.totalBytes) over.push(`总字节超过这一类的上限 ${limits.totalBytes} 字节`)
  return over
}

function DirectoryBody({
  limits,
  blocked,
  submit,
}: {
  readonly limits: Limits
  readonly blocked: boolean
  readonly submit: (files: readonly LocalFile[]) => void
}) {
  const [picked, setPicked] = useState<Picked>({ kind: 'none' })
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const list = [...(event.target.files ?? [])]
    setPicked({ kind: 'reading' })
    void pickedOf(list).then(setPicked)
  }
  const files = picked.kind === 'read' ? picked.files : []
  const total = files.reduce((sum, file) => sum + file.bytes.length, 0)
  const over = overLimits(files, limits)
  return (
    <>
      <Input type="file" multiple aria-label="选择目录" onChange={choose} {...DIRECTORY} />
      {picked.kind === 'reading' && <LoadingState label="正在读取目录……" />}
      {picked.kind === 'unreadable' && (
        <NoticeLine
          notice={{ kind: 'refused', text: `这些条目读不了，没有提交：${picked.paths.join('、')}` }}
        />
      )}
      {picked.kind === 'read' && (
        <p className="assets-create-note">{`${files.length} 个文件，共 ${total} 字节`}</p>
      )}
      {over.length > 0 && (
        <NoticeLine
          notice={{
            kind: 'unavailable',
            text: `${over.join('；')}。服务端多半不收；仍可以提交，以服务端的答复为准。`,
          }}
        />
      )}
      <Button
        {...assetsCreateSubmit.props}
        disabled={blocked || picked.kind !== 'read'}
        onClick={() => submit(files)}
      >
        提交
      </Button>
    </>
  )
}

function CreatingLine({
  creating,
  confirm,
}: {
  readonly creating: Creating
  readonly confirm: () => void
}) {
  switch (creating.kind) {
    case 'none':
      return null
    case 'sending': {
      const { request, received } = creating
      if (request.kind === 'data') return <LoadingState label="正在提交……" />
      const total = request.manifest.reduce((sum, file) => sum + file.bytes, 0)
      return <LoadingState label={`正在上传……服务端已收 ${received} / ${total} 字节`} />
    }
    case 'done':
      return (
        <InlineNotice tone="good">
          <p>{creating.text}</p>
        </InlineNotice>
      )
    case 'refused':
      return <NoticeLine notice={creating.notice} />
    case 'unknown':
      return (
        <NoticeLine
          notice={creating.notice}
          action={creating.confirming ? undefined : { label: '认回', onClick: confirm }}
        />
      )
  }
}
