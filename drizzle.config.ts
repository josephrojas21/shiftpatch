import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/server/infrastructure/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '' },
});
