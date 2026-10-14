/**
 * Render a data object to XML text against a schema.
 *
 * The output is meant to be read by a language model, so the shape is fixed and
 * predictable: attributes in declaration order, one child element per line,
 * every element opened and closed on its own line, and a self-closing root when
 * there is nothing inside. Text is always escaped; markup is produced only by
 * this module or by nested objects that render themselves through `toXml`.
 */

import { assertXmlName, escapeXmlAttribute, escapeXmlContent } from './escape.ts'
import {
  applyFieldOverride,
  nestedFormattingOptions,
  resolveFormattingOptions,
  type FormattingOptions,
  type NestedFormattingOptions,
  type ResolvedFormattingOptions,
} from './options.ts'
import type { FieldPresentation, FieldSpec, FieldSpecs, IncludeWhen, XmlSchema } from './types.ts'

/** An object that renders itself; nested values implementing it are embedded verbatim. */
export interface XmlFormattable {
  toXml(options?: NestedFormattingOptions): string
}

/** Whether `value` renders itself through `toXml`. Arrays never do. */
export function isXmlFormattable(value: unknown): value is XmlFormattable {
  return isObjectValue(value) && 'toXml' in value && typeof value.toXml === 'function'
}

type Attribute = readonly [name: string, value: string]

/** Render `value` as the XML element described by `schema`. */
export function formatXml(value: object, schema: XmlSchema, options?: FormattingOptions): string {
  const resolved = resolveFormattingOptions(options)
  const tag = assertXmlName(schema.tag, 'tag')
  const fields = selectFields(schema, resolved)

  const attrs: Attribute[] = []
  const elements: string[] = []
  let content: string | undefined

  for (const [path, declared] of Object.entries(fields)) {
    const spec = applyFieldOverride(declared, resolved.fieldOverrides[path])
    const fieldValue = readPath(value, path)
    if (!shouldInclude(fieldValue, spec.includeWhen ?? 'always')) continue

    const name = assertXmlName(spec.xmlName ?? lastSegment(path), 'field')
    const rendered = renderValue(fieldValue, spec, resolved)
    const shape = classify(fieldValue, spec)

    switch (spec.presentation ?? 'element') {
      case 'attr':
        attrs.push([name, rendered])
        break
      case 'element':
        // Self-rendering values already carry their own tags; wrapping them again
        // would double the element.
        elements.push(
          shape.selfTagged
            ? rendered
            : renderElement(name, rendered, spec, resolved, shape.preformatted),
        )
        break
      case 'content':
        content = rendered
        break
    }
  }

  return assemble(tag, attrs, elements, content, resolved)
}

// ---------------------------------------------------------------------------
// Field selection and value access
// ---------------------------------------------------------------------------

function selectFields(schema: XmlSchema, options: ResolvedFormattingOptions): FieldSpecs {
  const optional = schema.optionalFields ?? {}
  const declared = new Set([...Object.keys(schema.requiredFields), ...Object.keys(optional)])

  const unknownExtra = [...options.extraFields].filter(name => !Object.hasOwn(optional, name))
  if (unknownExtra.length > 0) {
    throw new Error(
      `extraFields not declared as optionalFields of <${schema.tag}>: ${unknownExtra.join(', ')}`,
    )
  }
  const unknownOverride = Object.keys(options.fieldOverrides).filter(name => !declared.has(name))
  if (unknownOverride.length > 0) {
    throw new Error(`fieldOverrides not declared by <${schema.tag}>: ${unknownOverride.join(', ')}`)
  }

  // Required fields first, then the selected optional fields in declaration
  // order, so the same selection always renders the same text.
  const selected: Record<string, FieldSpec> = { ...schema.requiredFields }
  for (const [name, spec] of Object.entries(optional)) {
    if (options.extraFields.has(name) && !Object.hasOwn(selected, name)) {
      Object.defineProperty(selected, name, {
        value: spec,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
  }
  return selected
}

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1)
}

function readPath(root: object, path: string): unknown {
  let current: unknown = root
  for (const part of path.split('.')) {
    if (current === null || current === undefined) return undefined
    if (current instanceof Map) {
      current = current.get(part)
    } else if (typeof current === 'object' || typeof current === 'function') {
      if (!Object.hasOwn(current, part) && part !== '__proto__') return undefined
      current = Reflect.get(current, part)
    } else {
      return undefined
    }
  }
  return current
}

function shouldInclude(value: unknown, when: IncludeWhen): boolean {
  switch (when) {
    case 'always':
      return true
    case 'not_nullish':
      return value !== null && value !== undefined
    case 'not_empty':
      return value !== null && value !== undefined && !isEmpty(value)
  }
}

function isEmpty(value: unknown): boolean {
  if (typeof value === 'string' || Array.isArray(value)) return value.length === 0
  if (value instanceof Map || value instanceof Set) return value.size === 0
  if (isRecordValue(value)) return Object.keys(value).length === 0
  return false
}

// ---------------------------------------------------------------------------
// Value rendering
// ---------------------------------------------------------------------------

interface ValueShape {
  /** The rendered text is XML that must be indented but not escaped. */
  readonly preformatted: boolean
  /** The rendered text already carries its own element tags. */
  readonly selfTagged: boolean
}

function elementFields(spec: FieldSpec): {
  readonly attrs?: Readonly<Record<string, string>>
  readonly itemTag?: string
  readonly itemFields?: Readonly<Record<string, FieldPresentation>>
} {
  switch (spec.presentation) {
    case 'attr':
    case 'content':
      return {}
    case 'element':
    case undefined: {
      const fields: {
        attrs?: Readonly<Record<string, string>>
        itemTag?: string
        itemFields?: Readonly<Record<string, FieldPresentation>>
      } = {}
      if (spec.attrs !== undefined) fields.attrs = spec.attrs
      if (spec.itemTag !== undefined) fields.itemTag = spec.itemTag
      if (spec.itemFields !== undefined) fields.itemFields = spec.itemFields
      return fields
    }
  }
  return {}
}

function listItems(value: unknown): readonly unknown[] | undefined {
  if (Array.isArray(value)) return value
  if (value instanceof Set) return [...value]
  return undefined
}

function classify(value: unknown, spec: FieldSpec): ValueShape {
  if (isXmlFormattable(value)) return { preformatted: true, selfTagged: true }
  const items = listItems(value)
  if (items !== undefined && items.length > 0) {
    if (items.every(item => isXmlFormattable(item))) return { preformatted: true, selfTagged: true }
    if (items.every(item => isObjectValue(item))) return { preformatted: true, selfTagged: false }
    return { preformatted: elementFields(spec).itemTag !== undefined, selfTagged: false }
  }
  return { preformatted: false, selfTagged: false }
}

function renderValue(value: unknown, spec: FieldSpec, options: ResolvedFormattingOptions): string {
  const items = listItems(value)
  if (items !== undefined) {
    if (items.length > 0 && items.every(item => isObjectValue(item)))
      return renderObjectList(items, spec, options)
    if (elementFields(spec).itemTag !== undefined)
      return renderTaggedList(items, elementFields(spec).itemTag ?? 'item', options)
    return items.map(item => stringify(item, options)).join(', ')
  }
  if (isXmlFormattable(value)) return value.toXml(nestedFormattingOptions(options))
  if (value instanceof Map || isRecordValue(value)) return renderPairs(entriesOf(value), options)
  return stringify(value, options)
}

/** Text of a scalar: nullish is empty, dates go through `formatDate`, booleans are lowercase. */
function stringify(value: unknown, options: ResolvedFormattingOptions): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return options.formatDate(value)
  return String(value)
}

function renderTaggedList(
  items: readonly unknown[],
  itemTag: string,
  options: ResolvedFormattingOptions,
): string {
  const tag = assertXmlName(itemTag, 'item tag')
  return items
    .map(item => `<${tag}>${escapeXmlContent(stringify(item, options))}</${tag}>`)
    .join('\n')
}

function renderObjectList(
  items: readonly unknown[],
  spec: FieldSpec,
  options: ResolvedFormattingOptions,
): string {
  const element = elementFields(spec)
  const itemTag = assertXmlName(element.itemTag ?? 'item', 'item tag')
  return items
    .map(item =>
      isXmlFormattable(item)
        ? item.toXml(nestedFormattingOptions(options))
        : renderObjectItem(item, itemTag, element.itemFields, options),
    )
    .join('\n')
}

function renderObjectItem(
  item: unknown,
  itemTag: string,
  itemFields: Readonly<Record<string, FieldPresentation>> | undefined,
  options: ResolvedFormattingOptions,
): string {
  const prefix = ' '.repeat(options.indentSize)
  const attrs: Attribute[] = []
  const elements: string[] = []
  let content: string | undefined

  for (const [name, fieldValue] of entriesOf(item)) {
    if (fieldValue === null || fieldValue === undefined) continue
    const rendered = renderItemField(fieldValue, options)
    const presentation = itemFields?.[name] ?? defaultItemPresentation(fieldValue, rendered)
    switch (presentation) {
      case 'attr':
        attrs.push([assertXmlName(name, 'item field'), rendered])
        break
      case 'element': {
        const elementName = assertXmlName(name, 'item field')
        elements.push(
          `<${elementName}>\n${indent(escapeXmlContent(rendered), prefix)}\n</${elementName}>`,
        )
        break
      }
      case 'content':
        content = rendered
        break
    }
  }

  return wrap(itemTag, attrs, elements, content, prefix)
}

function defaultItemPresentation(value: unknown, rendered: string): FieldPresentation {
  const scalar =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  return scalar && codePointLength(rendered) < 50 ? 'attr' : 'element'
}

/** Text of one property of an object item; nested objects flatten to `key: value; ...`. */
function renderItemField(value: unknown, options: ResolvedFormattingOptions): string {
  if (Array.isArray(value)) return value.map(item => stringify(item, options)).join(', ')
  if (value instanceof Map || isRecordValue(value)) {
    return entriesOf(value)
      .filter(([, nested]) => nested !== null && nested !== undefined)
      .map(
        ([key, nested]) =>
          `${key}: ${Array.isArray(nested) ? nested.map(v => stringify(v, options)).join(', ') : stringify(nested, options)}`,
      )
      .join('; ')
  }
  return stringify(value, options)
}

/** Text of a Map or record: one `key: value` line per entry. */
function renderPairs(
  entries: readonly (readonly [string, unknown])[],
  options: ResolvedFormattingOptions,
): string {
  return entries
    .map(
      ([key, nested]) =>
        `${key}: ${Array.isArray(nested) ? nested.map(v => stringify(v, options)).join(', ') : stringify(nested, options)}`,
    )
    .join('\n')
}

// ---------------------------------------------------------------------------
// Markup assembly
// ---------------------------------------------------------------------------

function renderElement(
  name: string,
  rendered: string,
  spec: FieldSpec,
  options: ResolvedFormattingOptions,
  preformatted: boolean,
): string {
  const prefix = ' '.repeat(options.indentSize)
  const attrsText = renderAttributes(Object.entries(elementFields(spec).attrs ?? {}))
  const body = indent(preformatted ? rendered : escapeXmlContent(rendered), prefix)
  return `<${name}${attrsText}>\n${body}\n</${name}>`
}

function assemble(
  tag: string,
  attrs: readonly Attribute[],
  elements: readonly string[],
  content: string | undefined,
  options: ResolvedFormattingOptions,
): string {
  if (options.omitRootTag) {
    const parts: string[] = []
    if (elements.length > 0) parts.push(elements.join('\n'))
    if (content) parts.push(escapeXmlContent(content))
    return parts.join('\n')
  }
  const manual = Object.entries(options.manualAttributes)
  return wrap(tag, [...attrs, ...manual], elements, content, ' '.repeat(options.indentSize))
}

/** Open and close `tag` around indented children; self-close when there is nothing inside. */
function wrap(
  tag: string,
  attrs: readonly Attribute[],
  elements: readonly string[],
  content: string | undefined,
  prefix: string,
): string {
  const attrsText = renderAttributes(attrs)
  if (elements.length === 0 && !content) return `<${tag}${attrsText}/>`
  const parts = [`<${tag}${attrsText}>`]
  if (elements.length > 0) parts.push(indent(elements.join('\n'), prefix))
  if (content) parts.push(indent(escapeXmlContent(content), prefix))
  parts.push(`</${tag}>`)
  return parts.join('\n')
}

/** Validate the combined attribute list for each element before emitting markup. */
function renderAttributes(attrs: readonly Attribute[]): string {
  const names = new Set<string>()
  const rendered: string[] = []
  for (const [name, value] of attrs) {
    assertXmlName(name, 'attribute')
    if (names.has(name)) throw new TypeError(`duplicate XML attribute: ${name}`)
    names.add(name)
    rendered.push(`${name}="${escapeXmlAttribute(value)}"`)
  }
  return rendered.length === 0 ? '' : ` ${rendered.join(' ')}`
}

/** Prefix every non-blank line; blank lines stay untouched. */
function indent(text: string, prefix: string): string {
  if (prefix === '') return text
  return text
    .split('\n')
    .map(line => (line.trim() === '' ? line : prefix + line))
    .join('\n')
}

// ---------------------------------------------------------------------------
// Value classification helpers
// ---------------------------------------------------------------------------

function isObjectValue(value: unknown): value is object {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
  )
}

/** A non-self-rendering object whose own entries are its data. */
function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isObjectValue(value) && !(value instanceof Map) && !isXmlFormattable(value)
}

function entriesOf(value: unknown): (readonly [string, unknown])[] {
  if (value instanceof Map)
    return [...value.entries()].map(([key, nested]) => [String(key), nested] as const)
  if (isObjectValue(value)) return Object.entries(value)
  return []
}

function codePointLength(text: string): number {
  let length = 0
  for (const _ of text) length += 1
  return length
}
