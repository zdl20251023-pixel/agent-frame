// ============================================================
// 用户模型（不含密码）
// ============================================================

export type User = {
  id: string         // 用户唯一 ID
  email: string      // 用户邮箱
  username?: string  // 用户名
  createdAt: string  // 创建时间（ISO 8601）
  updatedAt: string  // 更新时间（ISO 8601）
}

/** 对外 API 返回的用户信息 */
export type PublicUser = Pick<User, 'id' | 'email' | 'username' | 'createdAt'>

export type AuthResponse = {
  user: PublicUser     // 对外返回的用户信息
  accessToken: string  // JWT 访问令牌
}
