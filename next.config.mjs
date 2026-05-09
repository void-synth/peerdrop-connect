/** @type {import('next').NextConfig} */
// Next.js does not expose non-NEXT_PUBLIC_* vars to the browser bundle. Many hosts
// (and older templates) only define SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY — so we
// copy the first available value into NEXT_PUBLIC_* at build time for the client.
function supabasePublicEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";
  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  };
}

const nextConfig = {
  reactStrictMode: true,
  env: supabasePublicEnv(),
};

export default nextConfig;
