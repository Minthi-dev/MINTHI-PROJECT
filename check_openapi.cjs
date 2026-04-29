const fs = require('fs');
const https = require('https');

// Extract OPENAPI_USERNAME and OPENAPI_PASSWORD from .env
let envContent = '';
try {
    envContent = fs.readFileSync('supabase/.env', 'utf-8');
} catch (e) {
    try {
        envContent = fs.readFileSync('.env', 'utf-8');
    } catch(e) {}
}

const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim();
});

const user = env.OPENAPI_USERNAME || process.env.OPENAPI_USERNAME;
const pass = env.OPENAPI_PASSWORD || process.env.OPENAPI_PASSWORD;
const isProd = env.OPENAPI_ENV === 'production' || process.env.OPENAPI_ENV === 'production';
const baseUrl = isProd ? 'https://v2.openapi.com' : 'https://test.openapi.com';

async function fetchToken() {
    return new Promise((resolve, reject) => {
        const req = https.request(`${baseUrl}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify({ username: user, password: pass }));
        req.end();
    });
}

async function listConfigs(token) {
    return new Promise((resolve, reject) => {
        const req = https.request(`${baseUrl}/IT-configurations`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        }, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function deleteConfig(token, fiscalId) {
    return new Promise((resolve, reject) => {
        const req = https.request(`${baseUrl}/IT-configurations/${fiscalId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }, (res) => {
            resolve(res.statusCode);
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    console.log("Fetching token...");
    if (!user || !pass) {
        console.log("Missing credentials");
        return;
    }
    const tokenData = await fetchToken();
    const token = tokenData.token || tokenData.access_token || (tokenData.data && tokenData.data.token);
    if (!token) {
        console.log("Failed to get token", tokenData);
        return;
    }
    console.log("Got token");
    
    // Attempt delete
    console.log("Deleting 12345678903...");
    const delStatus = await deleteConfig(token, "12345678903");
    console.log("Delete status:", delStatus);
    
    console.log("Fetching configurations...");
    const configs = await listConfigs(token);
    console.log(JSON.stringify(configs, null, 2));
}

main().catch(console.error);
