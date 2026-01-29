
import { initDatabase, closeDatabase } from '../server/database.js';

const db = initDatabase();

console.log('--- Members ---');
console.log(db.prepare('SELECT * FROM members').all());

console.log('--- Instrument Types ---');
console.log(db.prepare('SELECT * FROM instrument_types').all());

console.log('--- Trades Count ---');
console.log(db.prepare('SELECT COUNT(*) as count FROM trades').get());

closeDatabase();
