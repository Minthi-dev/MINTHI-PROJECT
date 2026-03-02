import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

// You can't run DDL via JS client, need to use Supabase CLI or pg package.
// Let's use the Supabase CLI to run a direct SQL query against the remote DB.
