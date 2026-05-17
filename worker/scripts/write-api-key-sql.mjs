import { writeFileSync } from 'node:fs';

const outputPath = process.argv[2] || '/tmp/cattopic-api-key.sql';
const apiKey = process.env.CATTOPIC_API_KEY || '';

if (!apiKey) {
  writeFileSync(outputPath, '');
  process.exit(0);
}

const escapedKey = apiKey.replaceAll("'", "''");
writeFileSync(
  outputPath,
  `INSERT OR IGNORE INTO api_keys (key, created_at) VALUES ('${escapedKey}', datetime('now'));\n`
);
