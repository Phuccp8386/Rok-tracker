import type { Scan, ScanIndexEntry } from '../types'

/**
 * Where the scan data lives, relative to the site root.
 *
 * The scan files sit under `public/data`, so Vite copies them verbatim into
 * the build output. They are fetched at runtime rather than imported so a
 * data refresh does not require a rebuild.
 */
const BASE = import.meta.env.BASE_URL || '/'

/** Join the base path with a path relative to the public folder. */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\/+/, '')
  return `${BASE}${BASE.endsWith('/') ? '' : '/'}${clean}`
}

export interface LoadResult<T> {
  data: T | null
  error: string | null
}

/**
 * Fetch a JSON file that lives next to the deployed site.
 *
 * The base path is injected at build time by Vite so the app works both at
 * a domain root and under a project sub-path such as /Rok-Tracker/.
 */
async function fetchJson<T>(path: string): Promise<LoadResult<T>> {
  try {
    const res = await fetch(assetUrl(path), { cache: 'no-cache' })
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status} for ${path}` }
    }
    return { data: (await res.json()) as T, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown fetch error',
    }
  }
}

/** Load the list of available scans. */
export function loadIndex(): Promise<LoadResult<ScanIndexEntry[]>> {
  return fetchJson<ScanIndexEntry[]>('data/index.json')
}

/** Load a single scan by its index entry. */
export function loadScan(entry: ScanIndexEntry): Promise<LoadResult<Scan>> {
  return fetchJson<Scan>(entry.file)
}
