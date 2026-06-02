// ============================================================
// 用户模型（不含密码）
// ============================================================

export type User = {
  id: string
  email: string
  username?: string
  createdAt: string
  updatedAt: string
}

/** 对外 API 返回的用户信息 */
export type PublicUser = Pick<User, 'id' | 'email' | 'username' | 'createdAt'>

export type AuthResponse = {
  user: PublicUser
  accessToken: string
}
