import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { loginSchema, shiftSchema, userSchema, cancelSchema } from '../src/contracts';
const json = (schema: unknown) => ({ 'application/json': { schema } });
const shiftRef = { $ref: '#/components/schemas/Shift' };
const response = (description: string, schema: unknown) => ({ description, content: json(schema) });
const error = response('Error', {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' } },
});
const operation = (
  summary: string,
  responses: Record<string, unknown>,
  body?: unknown,
  parameters?: unknown[],
) => ({
  summary,
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
  ...(parameters ? { parameters } : {}),
  responses: { ...responses, '400': error, '401': error, '403': error, '404': error, '409': error },
});
const id = (name: string) => ({ name, in: 'path', required: true, schema: { type: 'string' } });
const post = {
  type: 'object',
  required: ['role', 'date', 'startTime', 'endTime'],
  properties: {
    role: { type: 'string', enum: ['RN', 'LPN'] },
    date: { type: 'string', format: 'date' },
    startTime: { type: 'string', example: '19:00' },
    endTime: { type: 'string', example: '07:00' },
  },
};
const doc = {
  openapi: '3.1.0',
  info: {
    title: 'ShiftPatch API',
    version: '1.0.0',
    description:
      'Exact trial contract. Additional endpoints and role policies are documented in docs/api-additions.md. Times are facility-local.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'shiftpatch_session' },
    },
    schemas: { Shift: z.toJSONSchema(shiftSchema), User: z.toJSONSchema(userSchema) },
  },
  paths: {
    '/api/auth/login': {
      post: {
        ...operation(
          'Log in',
          {
            '200': response('Authenticated', {
              type: 'object',
              required: ['token', 'user'],
              properties: {
                token: { type: 'string' },
                user: { $ref: '#/components/schemas/User' },
              },
            }),
          },
          z.toJSONSchema(loginSchema),
        ),
        security: [],
      },
    },
    '/api/shifts': {
      get: operation('List every shift', {
        '200': response('Marketplace', {
          type: 'object',
          required: ['shifts'],
          properties: { shifts: { type: 'array', items: shiftRef } },
        }),
      }),
      post: operation('Agency posts its own shift', { '201': response('Created', shiftRef) }, post),
    },
    '/api/shifts/{id}/claim': {
      post: operation(
        'Nurse claims atomically after credential check',
        { '200': response('Filled', shiftRef) },
        undefined,
        [id('id')],
      ),
    },
    '/api/shifts/{id}/cancel': {
      post: operation(
        'Reopen shift preserving cancellation history',
        {
          '200': response('Reopened', {
            allOf: [
              shiftRef,
              {
                type: 'object',
                required: ['cancellation'],
                properties: {
                  cancellation: {
                    type: 'object',
                    required: ['reason', 'previousNurseId'],
                    properties: {
                      reason: { type: 'string', enum: ['advance', 'no-show'] },
                      previousNurseId: { type: 'string' },
                    },
                  },
                },
              },
            ],
          }),
        },
        z.toJSONSchema(cancelSchema),
        [id('id')],
      ),
    },
    '/api/agencies/{agencyId}/shifts': {
      get: operation(
        'List own agency shifts (or administrator)',
        {
          '200': response('Agency shifts', {
            type: 'object',
            required: ['agencyId', 'shifts'],
            properties: {
              agencyId: { type: 'string' },
              shifts: { type: 'array', items: shiftRef },
            },
          }),
        },
        undefined,
        [id('agencyId')],
      ),
    },
  },
};
writeFileSync('docs/openapi.json', JSON.stringify(doc, null, 2) + '\n');
console.log('OpenAPI contract written.');
