import { clearToken, getToken } from './auth-token.ts'

const BASE_URL = '/api'

export class HttpError extends Error {
  status: number
  body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.body = body
  }
}

async function parseError(res: Response): Promise<{ message: string; body: unknown }> {
  const body = await res.json().catch(() => ({ message: res.statusText }))
  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message: unknown }).message)
      : res.statusText
  return { message, body }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })

  if (res.status === 401) {
    clearToken()
    window.dispatchEvent(new CustomEvent('auth:logout'))
  }

  if (!res.ok) {
    const err = await parseError(res)
    throw new HttpError(err.message || `HTTP ${res.status}`, res.status, err.body)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function get<T>(path: string): Promise<T> {
  return request<T>(path)
}

export async function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

export function sseUrl(path: string): string {
  const token = getToken()
  if (!token) return `${BASE_URL}${path}`
  const sep = path.includes('?') ? '&' : '?'
  return `${BASE_URL}${path}${sep}token=${encodeURIComponent(token)}`
}
