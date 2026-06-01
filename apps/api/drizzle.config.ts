import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './src/shared/db/migrations',
  schema: './src/shared/db/schema.ts',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
})
