/**
 * E-Chunab Dedicated Admin Login Flow Automated Test
 */

const SUPABASE_URL = "https://qtktqvjfgfotvckxbcqw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0a3RxdmpmZ2ZvdHZja3hiY3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NjAyMjcsImV4cCI6MjEwNDIzNjIyN30.vzYvzh-7LSA3TfPcY801eYr5Dhblfivd5e-qLT0Fxoc";

async function post(url, body, token = null) {
  const headers = {
    "apikey": ANON_KEY,
    "Content-Type": "application/json"
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function get(url, token = null) {
  const headers = {
    "apikey": ANON_KEY
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "GET",
    headers
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runTest() {
  console.log("=================================================");
  console.log("  E-CHUNAB DEDICATED ADMIN LOGIN VERIFICATION    ");
  console.log("=================================================");

  // TEST A: Sign in with Admin user
  console.log("\n[TEST A] Signing in as admin@e-chunab.com...");
  const adminAuth = await post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    email: "admin@e-chunab.com",
    password: "CivicElection2026!#"
  });

  if (!adminAuth.ok || !adminAuth.data.access_token) {
    throw new Error("Admin login failed: " + JSON.stringify(adminAuth.data));
  }
  const adminToken = adminAuth.data.access_token;
  const adminId = adminAuth.data.user.id;

  const adminProfile = await get(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${adminId}&select=role,full_name`, adminToken);
  console.log("✓ PASS: Admin authenticated. User ID:", adminId, "| Role:", adminProfile.data[0]?.role);
  if (adminProfile.data[0]?.role !== "admin") {
    throw new Error("Expected role 'admin', got: " + adminProfile.data[0]?.role);
  }

  // TEST B: Attempt sign in as Voter on Admin Login flow
  console.log("\n[TEST B] Attempting admin login with voter account (shresthaupendra1234@gmail.com)...");
  const voterAuth = await post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    email: "shresthaupendra1234@gmail.com",
    password: "CivicElection2026!#"
  });

  if (!voterAuth.ok || !voterAuth.data.access_token) {
    throw new Error("Voter login failed: " + JSON.stringify(voterAuth.data));
  }
  const voterToken = voterAuth.data.access_token;
  const voterId = voterAuth.data.user.id;

  const voterProfile = await get(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${voterId}&select=role,full_name`, voterToken);
  console.log("✓ PASS: Voter authenticated. Role:", voterProfile.data[0]?.role);
  if (voterProfile.data[0]?.role === "admin") {
    throw new Error("CRITICAL SECURITY ERROR: Voter was assigned role 'admin'!");
  }
  console.log("✓ PASS: Role integrity verified. Voter account is denied admin access.");

  console.log("\n>>> ALL DEDICATED ADMIN AUTHENTICATION TESTS PASSED! <<<");
}

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
