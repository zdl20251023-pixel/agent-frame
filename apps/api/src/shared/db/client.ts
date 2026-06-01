import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import * as schema from './schema.js'
import { env } from '../config/env.js'
import { logger } from '../observability/logger.js'

// ============================================================
// MySQL 数据库客户端（Drizzle ORM）
// ============================================================

let _pool: mysql.Pool | null = null
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getPool(): mysql.Pool {
  if (!_pool) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured')
    }
    _pool = mysql.createPool({
      uri: env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    })
    logger.info('[db] MySQL connection pool created')
  }
  return _pool
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getPool(), { schema, mode: 'default' })
  }
  return _db
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end()
    _pool = null
    _db = null
    logger.info('[db] MySQL connection pool closed')
  }
}

// 类型别名，方便引用
export type Db = ReturnType<typeof getDb>
