// Closed schemas for every native response that carries data.
//
// The rule throughout: exact keys, capped lengths, and for anything holding
// released field values, the returned set must be a subset of what we asked
// for. A response we did not request the shape of is a protocol error, not
// something to salvage.

import { LIMITS } from './limits'
import { isFieldType, type FieldType } from './fields'
import { arr, bool, hasExactKeys, isRecord, mapAll, nonEmptyStr, optionalStr, str } from './validate'
import type { Entry, EntryField, EntryMeta, Vault } from '../types'

const ENTRY_KEYS = ['id', 'vaultId', 'sectionId', 'title', 'hasIcon', 'fields'] as const
const FIELD_KEYS = ['type', 'value'] as const
const FIELD_OPTIONAL_KEYS = ['label'] as const
const META_KEYS = ['id', 'vaultId', 'sectionId', 'title'] as const
const META_OPTIONAL_KEYS = ['sectionName', 'capabilities', 'username', 'url', 'subtitle'] as const
const VAULT_KEYS = ['id', 'name', 'color', 'locked'] as const

function validateField(raw: unknown, requested: readonly FieldType[]): EntryField | null {
  if (!isRecord(raw) || !hasExactKeys(raw, FIELD_KEYS, FIELD_OPTIONAL_KEYS)) return null

  // The subset check. This is what makes "TOTP crosses as the current code,
  // never the seed" a property of the wire rather than a convention: we only
  // ever receive roles the page told us it could fill.
  if (!isFieldType(raw.type) || !requested.includes(raw.type)) return null

  const value = str(raw.value, LIMITS.value)
  if (value === null) return null

  const label = optionalStr(raw.label, LIMITS.label)
  if (label === null) return null

  return label.value === undefined
    ? { type: raw.type, value }
    : { type: raw.type, label: label.value, value }
}

/**
 * A released entry, narrowed to `requested`. Duplicate roles are rejected:
 * two password fields give fill no way to choose, and the desktop has no
 * reason to send them.
 */
export function validateEntry(raw: unknown, requested: readonly FieldType[]): Entry | null {
  if (!isRecord(raw) || !hasExactKeys(raw, ENTRY_KEYS)) return null

  const id = nonEmptyStr(raw.id, LIMITS.id)
  const vaultId = nonEmptyStr(raw.vaultId, LIMITS.id)
  const sectionId = nonEmptyStr(raw.sectionId, LIMITS.id)
  const title = str(raw.title, LIMITS.title)
  const hasIcon = bool(raw.hasIcon)
  const rawFields = arr(raw.fields, LIMITS.entryFields)
  if (id === null || vaultId === null || sectionId === null || title === null
    || hasIcon === null || rawFields === null) return null

  const fields = mapAll(rawFields, field => validateField(field, requested))
  if (fields === null) return null
  if (new Set(fields.map(f => f.type)).size !== fields.length) return null

  return { id, vaultId, sectionId, title, hasIcon, fields }
}

export interface FillGrant {
  entry: Entry
  token: string
}

/** GET_ENTRY_BY_ID and GET_ENTRY_BY_TOKEN: the slice plus its successor token. */
export function validateFillGrant(raw: unknown, requested: readonly FieldType[]): FillGrant | null {
  if (!isRecord(raw) || !hasExactKeys(raw, ['entry', 'token'])) return null
  const entry = validateEntry(raw.entry, requested)
  const token = nonEmptyStr(raw.token, LIMITS.token)
  return entry && token ? { entry, token } : null
}

/** GET_ENTRY_BY_CAPABILITY: single-shot, so no token to chain. */
export function validateCapabilityGrant(raw: unknown, requested: readonly FieldType[]): Entry | null {
  if (!isRecord(raw) || !hasExactKeys(raw, ['entry'])) return null
  return validateEntry(raw.entry, requested)
}

function validateMeta(raw: unknown): EntryMeta | null {
  if (!isRecord(raw) || !hasExactKeys(raw, META_KEYS, META_OPTIONAL_KEYS)) return null

  const id = nonEmptyStr(raw.id, LIMITS.id)
  const vaultId = nonEmptyStr(raw.vaultId, LIMITS.id)
  const sectionId = nonEmptyStr(raw.sectionId, LIMITS.id)
  const title = str(raw.title, LIMITS.title)
  if (id === null || vaultId === null || sectionId === null || title === null) return null

  const sectionName = optionalStr(raw.sectionName, LIMITS.label)
  const username = optionalStr(raw.username, LIMITS.value)
  const url = optionalStr(raw.url, LIMITS.url)
  const subtitle = optionalStr(raw.subtitle, LIMITS.label)
  if (!sectionName || !username || !url || !subtitle) return null

  let capabilities: string[] | undefined
  if (raw.capabilities !== undefined) {
    const list = arr(raw.capabilities, LIMITS.capabilities)
    if (list === null) return null
    const validated = mapAll(list, value => nonEmptyStr(value, LIMITS.label))
    if (validated === null) return null
    capabilities = validated
  }

  const meta: EntryMeta = { id, vaultId, sectionId, title }
  if (sectionName.value !== undefined) meta.sectionName = sectionName.value
  if (capabilities !== undefined) meta.capabilities = capabilities
  if (username.value !== undefined) meta.username = username.value
  if (url.value !== undefined) meta.url = url.value
  if (subtitle.value !== undefined) meta.subtitle = subtitle.value
  return meta
}

/** GET_ENTRIES_BY_URL and GET_SECTIONS_BY_CAPABILITY. Metadata only. */
export function validateEntryList(raw: unknown): EntryMeta[] | null {
  if (!isRecord(raw) || !hasExactKeys(raw, ['entries'])) return null
  const list = arr(raw.entries, LIMITS.entries)
  return list === null ? null : mapAll(list, validateMeta)
}

function validateVault(raw: unknown): Vault | null {
  if (!isRecord(raw) || !hasExactKeys(raw, VAULT_KEYS)) return null
  const id = nonEmptyStr(raw.id, LIMITS.id)
  const name = str(raw.name, LIMITS.title)
  const color = str(raw.color, LIMITS.color)
  const locked = bool(raw.locked)
  return id !== null && name !== null && color !== null && locked !== null
    ? { id, name, color, locked }
    : null
}

export interface NativePopupContext {
  vaults: Vault[]
  searchResults: EntryMeta[]
}

/**
 * GET_POPUP_CONTEXT. `searchResults` is absent when we asked without a URL
 * (the vaults-only call the picker and save bar make).
 */
export function validatePopupContext(raw: unknown): NativePopupContext | null {
  if (!isRecord(raw) || !hasExactKeys(raw, ['vaults'], ['searchResults'])) return null

  const rawVaults = arr(raw.vaults, LIMITS.vaults)
  if (rawVaults === null) return null
  const vaults = mapAll(rawVaults, validateVault)
  if (vaults === null) return null

  if (raw.searchResults === undefined) return { vaults, searchResults: [] }
  const rawResults = arr(raw.searchResults, LIMITS.entries)
  if (rawResults === null) return null
  const searchResults = mapAll(rawResults, validateMeta)
  return searchResults === null ? null : { vaults, searchResults }
}

export interface SavedEntryRef {
  id: string
  vaultId: string
}

/** SAVE_ENTRY and UPDATE_ENTRY_PASSWORD. */
export function validateSavedEntryRef(raw: unknown): SavedEntryRef | null {
  if (!isRecord(raw) || !hasExactKeys(raw, ['id', 'vaultId'])) return null
  const id = nonEmptyStr(raw.id, LIMITS.id)
  const vaultId = nonEmptyStr(raw.vaultId, LIMITS.id)
  return id && vaultId ? { id, vaultId } : null
}
