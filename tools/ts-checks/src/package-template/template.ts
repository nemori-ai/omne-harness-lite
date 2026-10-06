import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  object,
  older,
  VARIANTS,
  version,
  type FileTemplate,
  type TemplateManifest,
} from './model.ts'

export const TEMPLATE_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../templates/package',
)

export function safeRelative(path: string): boolean {
  return (
    path !== '' &&
    !isAbsolute(path) &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    path.split('/').every(part => part !== '' && part !== '.' && part !== '..')
  )
}
function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && safeRelative(item))
}
function fileList(value: unknown): value is FileTemplate[] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        object(item) &&
        typeof item['source'] === 'string' &&
        safeRelative(item['source']) &&
        item['source'].endsWith('.tpl') &&
        typeof item['target'] === 'string' &&
        safeRelative(item['target']),
    )
  )
}
export function readTemplate(directory = TEMPLATE_DIRECTORY): TemplateManifest {
  const value: unknown = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
  if (
    !object(value) ||
    value['format'] !== 1 ||
    value['id'] !== 'typescript-package' ||
    !version(value['version']) ||
    !fileList(value['common']) ||
    !stringArray(value['requiredFiles']) ||
    !object(value['variants']) ||
    !object(value['previousVersions'])
  )
    throw new Error('Invalid package template manifest')
  const variants = value['variants']
  if (
    Object.keys(variants).sort().join(',') !== [...VARIANTS].sort().join(',') ||
    VARIANTS.some(key => !fileList(variants[key]))
  )
    throw new Error('Invalid template variants')
  for (const [key, rules] of Object.entries(value['previousVersions'])) {
    if (
      !version(key) ||
      !object(rules) ||
      !stringArray(rules['requiredFiles']) ||
      rules['ruleSet'] !== 1 ||
      !older(key, value['version'])
    )
      throw new Error('Invalid historical template rules')
  }
  const manifest = value as unknown as TemplateManifest
  for (const key of VARIANTS) {
    const targets = [...manifest.common, ...manifest.variants[key]].map(file => file.target)
    if (new Set(targets).size !== targets.length)
      throw new Error(`Duplicate generated file in ${key}`)
  }
  return manifest
}
