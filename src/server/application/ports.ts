import type { Tables, User } from '../domain/models';
export interface Repository {
  list<K extends keyof Tables>(table: K): Promise<Tables[K][]>;
  get<K extends keyof Tables>(table: K, id: string, lock?: boolean): Promise<Tables[K] | undefined>;
  save<K extends keyof Tables>(table: K, value: Tables[K]): Promise<void>;
  lock(key: string): Promise<void>;
}
export interface UnitOfWork {
  run<T>(work: (repo: Repository) => Promise<T>): Promise<T>;
}
export interface Identity {
  verify(password: string, hash: string): Promise<boolean>;
  sign(user: User): Promise<string>;
  read(token: string): Promise<string>;
}
export interface Files {
  put(key: string, bytes: Uint8Array, type: string): Promise<string>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}
export interface Mail {
  configured(): boolean;
  send(recipient: string, subject: string, body: string, key: string): Promise<void>;
}
export interface Dependencies {
  uow: UnitOfWork;
  identity: Identity;
  files: Files;
  mail: Mail;
  now: () => Date;
  id: () => string;
}
