export function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL.");
  }
  return url;
}

export function getSupabasePublicEnv() {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url: getSupabaseUrl(), publishableKey };
}
