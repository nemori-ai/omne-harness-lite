// @module-tag source-text
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'

const MEMBER = join(import.meta.dirname, '..')
const SOURCE = join(MEMBER, 'src')

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

const FILES = listFiles(SOURCE).map(path => ({
  name: relative(MEMBER, path),
  text: readFileSync(path, 'utf8'),
}))

const SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

function importedSpecifiers(text: string): string[] {
  return [...text.matchAll(SPECIFIER)].map(match => match[1] ?? '')
}

it('reads the member source it is meant to guard', () => {
  expect(FILES.length).toBeGreaterThan(60)
  expect(FILES.some(file => file.name.endsWith('index.ts'))).toBe(true)
  expect(FILES.some(file => file.name.endsWith('.css'))).toBe(true)
})

it('imports no other member of the repository', () => {
  const offenders = FILES.flatMap(file =>
    importedSpecifiers(file.text)
      .filter(
        specifier => specifier.startsWith('@omne-harness/') || specifier.startsWith('../../../'),
      )
      .map(specifier => `${file.name}: ${specifier}`),
  )
  expect(offenders).toEqual([])
})

it('imports no Node built-in module and no Cordis', () => {
  const offenders = FILES.flatMap(file =>
    importedSpecifiers(file.text)
      .filter(specifier => specifier.startsWith('node:') || specifier.startsWith('@deepseek-ai/'))
      .map(specifier => `${file.name}: ${specifier}`),
  )
  expect(offenders).toEqual([])
})

it('keeps the old prefix out of the variables, class names and animation names', () => {
  const offenders = FILES.filter(file => /\.(?:css|tsx?)$/.test(file.name)).flatMap(file =>
    [...file.text.matchAll(/(?:^|[^a-zA-Z0-9_-])(?:--)?pe-[a-z][a-zA-Z0-9_-]*/gm)].map(
      match => `${file.name}: ${match[0].trim()}`,
    ),
  )
  expect(offenders).toEqual([])
})

it('uses no translation library', () => {
  expect(
    FILES.filter(file => /react-i18next|i18next/.test(file.text)).map(file => file.name),
  ).toEqual([])
})

it('carries no comment other than a tool annotation or a licence notice', () => {
  const offenders = FILES.filter(file => /\.(?:tsx?|css)$/.test(file.name)).flatMap(file =>
    [...file.text.matchAll(/\/\*[\s\S]*?\*\/|(?<![:'"`])\/\/[^\n]*/g)]
      .map(match => match[0])
      .filter(comment => !/^\/\* (?:wall-clock:|SPDX|MIT License)/.test(comment))
      .map(comment => `${file.name}: ${comment.slice(0, 60)}`),
  )
  expect(offenders).toEqual([])
})

it('imports the chart library only in the charts block', () => {
  const importers = FILES.filter(file =>
    importedSpecifiers(file.text).some(
      specifier => specifier === 'recharts' || specifier.startsWith('recharts/'),
    ),
  ).map(file => file.name)
  expect(importers).toEqual(['src/charts/series.tsx'])
})
