
console.log('Current CWD:', process.cwd());
import fs from 'fs';
import path from 'path';
const dbPath = path.join(process.cwd(), 'db', 'trading.db');
console.log('Checks DB at:', dbPath);
console.log('Exists:', fs.existsSync(dbPath));
