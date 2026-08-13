import type { PasswordConfig } from '../storage/auth';

// Demo password: dinner. Generate a replacement inside the editor before publishing.
export const EDITOR_PASSWORD_CONFIG: PasswordConfig = {
  salt: 'dining-map-demo-v1',
  iterations: 120_000,
  digestHex: '48b8aea224036ba4ebb80811997f4a5954315bb6c2081e87fa9ce8682246177e',
};
