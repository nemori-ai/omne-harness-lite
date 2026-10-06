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
  type LayoutRules,
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
function layoutRules(value: unknown): value is LayoutRules {
  return (
    object(value) &&
    Object.keys(value).sort().join(',') ===
      'companions,files,ignoredDirectories,requiredDirectories,requiredFileGroups' &&
    stringArray(value['files']) &&
    value['files'].length > 0 &&
    value['files'].every(path =>
      path.split('/').every(part => !part.includes('**') || part === '**'),
    ) &&
    stringArray(value['requiredDirectories']) &&
    Array.isArray(value['requiredFileGroups']) &&
    value['requiredFileGroups'].every(
      group =>
        object(group) &&
        stringArray(group['patterns']) &&
        group['patterns'].length > 0 &&
        typeof group['minimum'] === 'number' &&
        Number.isSafeInteger(group['minimum']) &&
        group['minimum'] > 0,
    ) &&
    stringArray(value['ignoredDirectories']) &&
    value['ignoredDirectories'].every(path => !path.includes('/') && !path.includes('*')) &&
    Array.isArray(value['companions']) &&
    value['companions'].every(
      item =>
        object(item) &&
        typeof item['path'] === 'string' &&
        safeRelative(item['path']) &&
        stringArray(item['requires']),
    )
  )
}
function variantFiles(value: unknown): boolean {
  return (
    object(value) &&
    Object.keys(value).sort().join(',') === [...VARIANTS].sort().join(',') &&
    VARIANTS.every(key => stringArray(value[key]))
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
    !layoutRules(value['layout']) ||
    !variantFiles(value['variantRequiredFiles']) ||
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
      !layoutRules(rules['layout']) ||
      !variantFiles(rules['variantRequiredFiles']) ||
      rules['ruleSet'] !== 2 ||
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
