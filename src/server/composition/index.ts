import { randomUUID } from 'node:crypto';
import { ShiftPatch } from '../application/service';
import { PostgresUnitOfWork } from '../infrastructure/database';
import { files, identity, mail } from '../infrastructure/providers';
export const service = new ShiftPatch({
  uow: new PostgresUnitOfWork(),
  files,
  identity,
  mail,
  id: randomUUID,
  now: () => new Date(),
});
