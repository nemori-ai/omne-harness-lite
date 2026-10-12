import { describe, expect, it } from 'vitest'
import {
  ReferenceViolation,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
  mapStorageError,
} from '../src/index.ts'

describe('mapStorageError 只折 StorageUnavailable', () => {
  it('StorageUnavailable ⇒ 调用方给的字面', () => {
    expect(mapStorageError(new StorageUnavailable('closed'), 'storage-unavailable')).toEqual({
      failure: 'storage-unavailable',
    })
    expect(mapStorageError(new StorageUnavailable('closed'), 'unavailable')).toEqual({
      failure: 'unavailable',
    })
  })
  it('其余一律重抛：缺陷、唯一冲突、引用违反、调用方错误', () => {
    const defect = new StorageDefect('syntax')
    expect(() => mapStorageError(defect, 'unavailable')).toThrow(defect)
    const unique = new UniqueViolation('x')
    expect(() => mapStorageError(unique, 'unavailable')).toThrow(unique)
    const reference = new ReferenceViolation('missing-target')
    expect(() => mapStorageError(reference, 'unavailable')).toThrow(reference)
    const own = new Error('mine')
    expect(() => mapStorageError(own, 'unavailable')).toThrow(own)
  })
  it('四型各有稳定的 name 与 cause 通道', () => {
    const cause = new Error('driver')
    expect(new StorageUnavailable('x', { cause }).cause).toBe(cause)
    expect(new UniqueViolation('c', { cause }).name).toBe('UniqueViolation')
    expect(new ReferenceViolation('delete-restricted').kind).toBe('delete-restricted')
    expect(new StorageDefect('d', { cause }).name).toBe('StorageDefect')
  })
})
