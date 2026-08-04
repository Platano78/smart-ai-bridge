/**
 * @fileoverview secret-store - user-supplied API keys for built-in backends
 * @module backends/secret-store
 *
 * SAB's built-in backends only ever read keys from process.env — a public-repo
 * user has no way to set one for a built-in backend at all. This store fills
 * that gap: dashboard-managed keys live here, in a gitignored, owner-only file,
 * never in src/config/backends.json (which is git-tracked).
 *
 * File: data/backends-secrets.json, shape { "<backendName>": "<apiKey>" }.
 * Mode 0600 on every write. A missing or malformed file behaves as empty —
 * a corrupt secrets file must never prevent the server from starting.
 */

import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { writeFileVerified } from '../utils/verified-write.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SECRETS_PATH = join(__dirname, '../../data/backends-secrets.json');

/**
 * @returns {Object<string, string>} backend name -> API key. Empty object on
 *   any read/parse failure (absent file, corrupt JSON, unexpected shape).
 */
function readSecrets() {
  try {
    if (!fs.existsSync(SECRETS_PATH)) return {};
    const raw = fs.readFileSync(SECRETS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * @param {string} name - backend name
 * @returns {string|null} the stored key, or null if unset/empty
 */
function getSecret(name) {
  const value = readSecrets()[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function writeSecrets(secrets) {
  const dir = dirname(SECRETS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await writeFileVerified(SECRETS_PATH, JSON.stringify(secrets, null, 2), { label: 'backends-secrets' });
  // Preserve owner-only mode on every write, not just at creation.
  fs.chmodSync(SECRETS_PATH, 0o600);
}

/**
 * @param {string} name - backend name
 * @param {string} apiKey - key to store
 */
async function setSecret(name, apiKey) {
  const secrets = readSecrets();
  secrets[name] = apiKey;
  await writeSecrets(secrets);
}

/**
 * @param {string} name - backend name
 */
async function deleteSecret(name) {
  const secrets = readSecrets();
  if (Object.prototype.hasOwnProperty.call(secrets, name)) {
    delete secrets[name];
    await writeSecrets(secrets);
  }
}

export { readSecrets, getSecret, setSecret, deleteSecret, SECRETS_PATH };
