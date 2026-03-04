const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { execSync } = require('child_process');

async function run() {
    let supabaseUrl = 'https://bueovvvrgpwdcpkyocac.supabase.co';
    let serviceRoleKey = '';

    try {
        const output = execSync('npx supabase secrets list --project-ref bueovvvrgpwdcpkyocac').toString();
        const lines = output.split('\n');
        for (const line of lines) {
            if (line.includes('SUPABASE_SERVICE_ROLE_KEY')) {
                // Parse the table output to extract the value
                const parts = line.split(' ');
                serviceRoleKey = parts[parts.length - 1].trim();
            }
        }
    } catch (e) {
        console.log('Failed to read secrets');
        return;
    }

    if (!serviceRoleKey) {
        console.log('Could not find service role key');
        return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('Got credentials, running SQL...');

    const sql = `
        ALTER TABLE public.dishes
        ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS short_code TEXT;
    `;

    // We can't run raw SQL with the JS client directly without RPC.
    // Instead we can use Supabase CLI to execute remote SQL
    console.log('Use supabase link then supabase db push!');
}

run();
