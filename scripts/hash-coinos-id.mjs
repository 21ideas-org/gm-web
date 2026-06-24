#!/usr/bin/env node
// Hash a raw Coinos payment id into the sha256 hex the ledger uses, so the
// operator can paste it into `excludeIds` (the committed file is hash-only — §2/§9).
//
//   node scripts/hash-coinos-id.mjs <rawid>
//
// Shares the EXACT hash function with the updater (imported, not re-implemented)
// so an excludeIds entry always matches an entry id byte-for-byte. The input is
// trimmed — a stray pasted newline/space must not change the hash.

import { hashId } from './update-donations-ledger.mjs';

const raw = (process.argv[2] ?? '').trim();
if (!raw) {
  console.error('usage: node scripts/hash-coinos-id.mjs <rawid>');
  process.exit(1);
}
console.log(hashId(raw));
