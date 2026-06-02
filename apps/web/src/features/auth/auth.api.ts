import type { AuthResponse, PublicUser } from '@agent-frame/shared'
import { post, get } from '../../lib/http.ts'

export async function register(input: {
  email: string
  password: string
  username?: string
}): Promise<AuthResponse> {
  return post<AuthResponse>('/auth/register', input)
}

export async function login(input: { email: string; password: string }): Promise<AuthResponse> {
  return post<AuthResponse>('/auth/login', input)
}

export async function fetchMe(): Promise<{ user: PublicUser }> {
  return get<{ user: PublicUser }>('/auth/me')
}
