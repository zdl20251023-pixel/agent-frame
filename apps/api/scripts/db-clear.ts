/**
 * 清空当前 DATABASE_URL 指向的 MySQL 数据库中的所有基础表数据。
 *
 * 用法：
 *   DATABASE_URL=mysql://... bun run scripts/db-clear.ts --yes
 *
 * 安全约束：
 * - 默认必须传入 --yes，避免误触发。
 * - NODE_ENV=production 时还必须额外传入 --allow-production。
 * - 只执行 TRUNCATE TABLE，不删除表结构。
 */

import mysql from 'mysql2/promise'

const DATABASE_URL = process.env.DATABASE_URL
const args = new Set(process.argv.slice(2))

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

if (!args.has('--yes') && !args.has('-y')) {
  console.error('Refusing to clear database without --yes')
  console.error('Usage: DATABASE_URL=mysql://... bun run scripts/db-clear.ts --yes')
  process.exit(1)
}

if (process.env.NODE_ENV === 'production' && !args.has('--allow-production')) {
  console.error('Refusing to clear production database without --allow-production')
  process.exit(1)
}

/**
 * 从 DATABASE_URL 中解析数据库名。
 *
 * @param databaseUrl - MySQL 连接字符串。
 * @returns 当前连接字符串指向的数据库名。
 */
function resolveDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl)
  const databaseName = url.pathname.replace(/^\//, '')
  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name')
  }
  return decodeURIComponent(databaseName)
}

/**
 * 将 MySQL 标识符安全包裹为反引号形式。
 *
 * @param identifier - 表名或库名。
 * @returns 可拼入 SQL 的安全标识符。
 */
function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll('`', '``')}\``
}

/**
 * 查询当前数据库内所有基础表。
 *
 * @param conn - MySQL 连接。
 * @param databaseName - 数据库名。
 * @returns 当前数据库的基础表名列表，不包含 view。
 */
async function listBaseTables(
  conn: mysql.Connection,
  databaseName: string,
): Promise<string[]> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `
      SELECT TABLE_NAME AS tableName
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
    [databaseName],
  )

  return rows
    .map((row) => row.tableName)
    .filter((tableName): tableName is string => typeof tableName === 'string')
}

/**
 * 主流程：连接数据库并清空所有表数据。
 */
async function main() {
  const databaseName = resolveDatabaseName(DATABASE_URL)
  const conn = await mysql.createConnection(DATABASE_URL)

  try {
    const tables = await listBaseTables(conn, databaseName)
    if (tables.length === 0) {
      console.log(`No tables found in database ${databaseName}`)
      return
    }

    console.log(`Clearing database ${databaseName}`)
    console.log(`Tables: ${tables.join(', ')}`)

    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    try {
      for (const table of tables) {
        process.stdout.write(`  TRUNCATE ${table} ... `)
        await conn.query(`TRUNCATE TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(table)}`)
        console.log('ok')
      }
    } finally {
      await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    }

    console.log(`Cleared ${tables.length} tables from ${databaseName}`)
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error('Database clear failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
