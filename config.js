/* ============================================================
   Supabase connection settings.

   Same project as Matrix & Mind: the tone tables live in their own
   `tones` schema there. These values are copied from Matrix & Mind's
   config.js.

   They are safe in client-side code: your data is protected by the
   Row Level Security rules in schema.sql, not by hiding the key.
   Leave both empty (or add ?demo to the URL) for demo mode.
   ============================================================ */
window.SUPABASE_URL = "https://yfwqjwxfjqwxlxmwsbpt.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_Q6vqZj7XMlUykylrsuu6Ig_5aDCruD8";
