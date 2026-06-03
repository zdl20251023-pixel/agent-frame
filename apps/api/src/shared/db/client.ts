import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import * as schema from './schema.js'
import { env } from '../config/env.js'
import { logger } from '../observability/logger.js'

// ============================================================
// MySQL 数据库客户端（Drizzle ORM）
// ============================================================

export type Db = MySql2Database<typeof schema>

let _pool: mysql.Pool | null = null
let _db: Db | null = null

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

export function getDb(): Db {
  if (!_db) {
    _db = drizzle(getPool(), { schema, mode: 'default' }) as Db
  }
  return _db
}

/** 在需要数据库的路由/服务中显式校验 DATABASE_URL */
export function requireDb(): Db {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured')
  }
  return getDb()
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end()
    _pool = null
    _db = null
    logger.info('[db] MySQL connection pool closed')
  }
}

