require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL environment variable");
}

// Use service role key for backend (bypasses RLS) — fall back to anon key
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

module.exports = { supabase };
