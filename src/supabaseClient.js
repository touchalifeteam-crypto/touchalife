import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Key exists:", !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase environment variables not set!", {
    REACT_APP_SUPABASE_URL: supabaseUrl,
    REACT_APP_SUPABASE_ANON_KEY_present: !!supabaseAnonKey,
  });
  alert("Supabase environment variables not set! Please check your .env file.");
}

// IMPORTANT: If env vars are missing, createClient() will behave unpredictably.
// Keep app from hanging by creating the client only when env vars are valid.
const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log("Supabase client created successfully");


export default supabase;
