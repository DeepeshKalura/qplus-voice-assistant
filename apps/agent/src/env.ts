import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env vars from the root of the monorepo
dotenv.config({ path: path.join(__dirname, '../../../.env') });
