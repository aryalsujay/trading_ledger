
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000/api';

async function testAddTrade() {
    console.log('--- Testing Add Trade ---');
    try {
        const payload = {
            symbol: 'TESTETF',
            buy_date: new Date().toISOString().split('T')[0],
            buy_price: 100,
            quantity: 10,
            notes: 'API Test',
            exchange: 'NSE',
            member_id: null, // Should default to first active
            isSplit: false
        };

        const res = await fetch(`${BASE_URL}/trades`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            console.log('✅ Add Trade Successful:', data);
            return data.id;
        } else {
            console.error('❌ Add Trade Failed:', res.status, data);
        }
    } catch (error) {
        console.error('❌ Add Trade Error:', error.message);
    }
}

async function testImport() {
    console.log('\n--- Testing Import CSV ---');
    try {
        const csvContent = `Member,Symbol,Entry Date,Entry Price,Quantity,Notes
,TESTIMPORT,2025-01-01,200,5,Import Test`;

        // Create a temporary file
        fs.writeFileSync('test_import.csv', csvContent);

        const form = new FormData();
        form.append('file', fs.createReadStream('test_import.csv'));

        const res = await fetch(`${BASE_URL}/trades/import`, {
            method: 'POST',
            body: form
        });

        const data = await res.json();
        console.log('Response:', data);

        fs.unlinkSync('test_import.csv');
    } catch (error) {
        console.error('❌ Import Error:', error.message);
    }
}

async function run() {
    await testAddTrade();
    await testImport();
}

run();
