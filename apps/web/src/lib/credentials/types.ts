/**
 * Shapes shared by the credential store and the UI that renders it.
 *
 * Deliberately outside `store.ts`: that module is `server-only`, and a client
 * component importing a type from it would be a type-only import that some
 * bundler later treats as a value import. A plain module has no such question.
 */

/** What the settings list renders. Never includes `ciphertext`. */
export interface CredentialListRow {
  id: string;
  domainId: string;
  hostname: string;
  label: string;
  kind: string;
  lastUsedAt: string | null;
  createdAt: string;
}
