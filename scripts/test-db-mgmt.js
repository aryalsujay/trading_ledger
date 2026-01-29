
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000/api';
const DOWNLOAD_PATH = 'downloaded_trading.db';

async function testExport() {
    console.log('--- Testing Export Database ---');
    try {
        const res = await fetch(`${BASE_URL}/database/export`);

        if (res.ok) {
            const dest = fs.createWriteStream(DOWNLOAD_PATH);
            res.body.pipe(dest);
            await new Promise((resolve, reject) => {
                dest.on('finish', resolve);
                dest.on('error', reject);
            });
            console.log(`✅ Database exported successfully to ${DOWNLOAD_PATH}`);
            return true;
        } else {
            console.error('❌ Export failed:', res.status, res.statusText);
            return false;
        }
    } catch (error) {
        console.error('❌ Export Error:', error.message);
        return false;
    }
}

async function testImport() {
    console.log('\n--- Testing Import Database ---');
    if (!fs.existsSync(DOWNLOAD_PATH)) {
        console.error('❌ No exported file to import.');
        return;
    }

    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(DOWNLOAD_PATH));

        const res = await fetch(`${BASE_URL}/database/import`, {
            method: 'POST',
            body: form
        });

        const data = await res.json();
        if (res.ok) {
            console.log('✅ Database imported successfully:', data);
        } else {
            console.error('❌ Import Failed:', data);
        }
    } catch (error) {
        console.error('❌ Import Error:', error.message);
    } finally {
        // Cleanup
        if (fs.existsSync(DOWNLOAD_PATH)) fs.unlinkSync(DOWNLOAD_PATH);
    }
}

async function run() {
    if (await testExport()) {
        await testImport();
    }
}

run();
