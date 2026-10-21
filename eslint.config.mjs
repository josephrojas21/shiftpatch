import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'artifacts/**',
  ]),
  {
    files: ['src/server/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'react',
                'drizzle-orm',
                'drizzle-orm/*',
                'pg',
                '@/server/infrastructure/*',
                '@/server/composition/*',
                '@/contracts/*',
              ],
              message:
                'Domain must not depend on frameworks, persistence, HTTP contracts or composition.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/server/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'drizzle-orm',
                'drizzle-orm/*',
                'pg',
                '@vercel/*',
                'resend',
                '@/server/infrastructure/*',
                '@/server/composition/*',
              ],
              message: 'Application depends only on domain and ports.',
            },
          ],
        },
      ],
    },
  },
]);
