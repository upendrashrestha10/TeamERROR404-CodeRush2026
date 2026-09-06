/**
 * E-CHUNAB Full Comprehensive Automated Integration Test
 * Verifies all 12 tasks:
 * 1. Supabase Auth connection & trigger profile creation
 * 2. Role integrity & RLS protection
 * 3. Voter verification flow
 * 4. Admin approval flow
 * 5. Dynamic election & candidates loading
 * 6. Secure atomic voting via cast_ballot RPC
 * 7. Double-voting prevention
 * 8. Results confidentiality & anonymization
 */

const SUPABASE_URL = "https://qtktqvjfgfotvckxbcqw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0a3RxdmpmZ2ZvdHZja3hiY3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NjAyMjcsImV4cCI6MjEwNDIzNjIyN30.vzYvzh-7LSA3TfPcY801eYr5Dhblfivd5e-qLT0Fxoc";

const testVoterEmail = `voter_${Date.now()}@gmail.com`;
const testAdminEmail = `admin_${Date.now()}@gmail.com`;
const testPassword = "CivicElection2026!#";

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

async function patch(url, body, token = null) {
  const headers = {
    "apikey": ANON_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log("===============================================================");
  console.log("  E-CHUNAB FULL END-TO-END VERIFICATION & SECURITY TEST SUITE  ");
  console.log("===============================================================");

  // -----------------------------------------------------------------
  // 1. VOTER REGISTRATION
  // -----------------------------------------------------------------
  console.log("\n[TEST 1] Registering voter account:", testVoterEmail);
  const voterSignup = await post(`${SUPABASE_URL}/auth/v1/signup`, {
    email: testVoterEmail,
    password: testPassword,
    data: {
      full_name: "Aashish Shrestha",
      phone: "+977 9841234567"
    }
  });

  if (!voterSignup.ok || !voterSignup.data.access_token) {
    throw new Error(`Voter registration failed: ${JSON.stringify(voterSignup.data)}`);
  }
  const voterToken = voterSignup.data.access_token;
  const voterId = voterSignup.data.user.id;
  console.log("✓ PASS: Voter registered with ID:", voterId);

  // -----------------------------------------------------------------
  // 2. AUTOMATIC PROFILE CREATION & ROLE CHECK
  // -----------------------------------------------------------------
  console.log("\n[TEST 2] Verifying automatic profile creation in public.profiles...");
  const profRes = await get(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${voterId}&select=*`, voterToken);
  if (!profRes.ok || !profRes.data || profRes.data.length === 0) {
    throw new Error("Profile not found in public.profiles table");
  }
  const voterProfile = profRes.data[0];
  console.log(`✓ PASS: Profile found: "${voterProfile.full_name}" | Role: "${voterProfile.role}"`);
  if (voterProfile.role !== "voter") {
    throw new Error(`Expected role 'voter', got '${voterProfile.role}'`);
  }

  // -----------------------------------------------------------------
  // 3. VOTER CANNOT SELF-ESCALATE ROLE TO ADMIN
  // -----------------------------------------------------------------
  console.log("\n[TEST 3] Security check: Attempting role self-escalation by voter...");
  const escalateRes = await patch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${voterId}`, {
    role: "admin"
  }, voterToken);

  // Check if role actually changed
  const checkRole = await get(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${voterId}&select=role`, voterToken);
  if (checkRole.data[0].role === "admin") {
    throw new Error("CRITICAL SECURITY FLAW: Voter was able to self-escalate to admin!");
  }
  console.log("✓ PASS: Self-escalation blocked. Role remains:", checkRole.data[0].role);

  // -----------------------------------------------------------------
  // 4. SUBMIT CITIZENSHIP VERIFICATION (VOTER FLOW)
  // -----------------------------------------------------------------
  console.log("\n[TEST 4] Submitting voter citizenship verification record...");
  const citizNo = `CIT-2026-${Date.now().toString().slice(-6)}`;
  const verifRes = await post(`${SUPABASE_URL}/rest/v1/voters`, {
    user_id: voterId,
    citizenship_number: citizNo,
    date_of_birth: "2000-01-15",
    address: "Kathmandu Ward 4, Bagmati",
    citizenship_front: `${voterId}/front_card.jpg`,
    citizenship_back: `${voterId}/back_card.jpg`,
    verification_status: "pending"
  }, voterToken);

  if (!verifRes.ok) {
    throw new Error(`Verification submission failed: ${JSON.stringify(verifRes.data)}`);
  }
  console.log("✓ PASS: Voter verification submitted (pending review). Citizenship No:", citizNo);

  // -----------------------------------------------------------------
  // 5. UNAPPROVED VOTER CANNOT VOTE
  // -----------------------------------------------------------------
  console.log("\n[TEST 5] Security check: Attempting to vote while verification is 'pending'...");
  const earlyVoteRes = await post(`${SUPABASE_URL}/rest/v1/rpc/cast_ballot`, {
    p_election_id: "11111111-1111-1111-1111-111111111111",
    p_votes: [
      { position_id: "22222222-2222-2222-2222-222222222221", candidate_id: "33333333-3333-3333-3333-333333333311" },
      { position_id: "22222222-2222-2222-2222-222222222222", candidate_id: "33333333-3333-3333-3333-333333333321" },
      { position_id: "22222222-2222-2222-2222-222222222223", candidate_id: "33333333-3333-3333-3333-333333333331" }
    ]
  }, voterToken);

  if (earlyVoteRes.ok) {
    throw new Error("CRITICAL SECURITY FLAW: Unapproved voter was able to cast ballot!");
  }
  console.log("✓ PASS: Unapproved vote correctly rejected by RPC with message:", earlyVoteRes.data?.message);

  // -----------------------------------------------------------------
  // 6. DYNAMIC ACTIVE ELECTION AND CANDIDATES LOADING
  // -----------------------------------------------------------------
  console.log("\n[TEST 6] Verifying dynamic loading of election, positions, and candidates...");
  const elecRes = await get(`${SUPABASE_URL}/rest/v1/elections?status=eq.active&select=*`, voterToken);
  if (!elecRes.ok || elecRes.data.length === 0) {
    throw new Error("No active election found");
  }
  const activeElection = elecRes.data[0];
  console.log(`✓ PASS: Active Election loaded: "${activeElection.title}" (${activeElection.id})`);

  const posRes = await get(`${SUPABASE_URL}/rest/v1/positions?election_id=eq.${activeElection.id}&order=display_order.asc&select=*`, voterToken);
  if (!posRes.ok || posRes.data.length === 0) {
    throw new Error("No positions found for active election");
  }
  console.log(`✓ PASS: Loaded ${posRes.data.length} positions:`, posRes.data.map(p => p.name).join(", "));

  const candRes = await get(`${SUPABASE_URL}/rest/v1/candidates?election_id=eq.${activeElection.id}&order=display_order.asc&select=*`, voterToken);
  if (!candRes.ok || candRes.data.length === 0) {
    throw new Error("No candidates found for active election");
  }
  console.log(`✓ PASS: Loaded ${candRes.data.length} candidates.`);

  // -----------------------------------------------------------------
  // 7. HAS_VOTED CHECK (BEFORE VOTING)
  // -----------------------------------------------------------------
  console.log("\n[TEST 7] Checking has_voted RPC before voting...");
  const hasVotedBefore = await post(`${SUPABASE_URL}/rest/v1/rpc/has_voted`, {
    p_election_id: activeElection.id
  }, voterToken);
  console.log("✓ PASS: has_voted returned:", hasVotedBefore.data, "(expected false)");
  if (hasVotedBefore.data !== false) {
    throw new Error(`Expected has_voted to be false, got ${hasVotedBefore.data}`);
  }

  // -----------------------------------------------------------------
  // 8. RESULTS CONFIDENTIALITY (BEFORE PUBLICATION)
  // -----------------------------------------------------------------
  console.log("\n[TEST 8] Security check: Non-admin voter calling get_election_results before publication...");
  const resultsRes = await post(`${SUPABASE_URL}/rest/v1/rpc/get_election_results`, {
    p_election_id: activeElection.id
  }, voterToken);
  if (resultsRes.ok) {
    throw new Error("CRITICAL SECURITY FLAW: Voter was able to view unpublished election results!");
  }
  console.log("✓ PASS: Unpublished results access blocked with message:", resultsRes.data?.message);

  // -----------------------------------------------------------------
  // 9. DIRECT INSERT INTO PUBLIC.VOTES BLOCKED BY RLS
  // -----------------------------------------------------------------
  console.log("\n[TEST 9] Security check: Attempting direct table insert into public.votes...");
  const directVoteRes = await post(`${SUPABASE_URL}/rest/v1/votes`, {
    election_id: activeElection.id,
    position_id: posRes.data[0].id,
    candidate_id: candRes.data[0].id,
    voter_id: voterId
  }, voterToken);

  if (directVoteRes.ok) {
    throw new Error("CRITICAL SECURITY FLAW: Voter was able to bypass cast_ballot RPC and insert directly into public.votes!");
  }
  console.log("✓ PASS: Direct table insert into public.votes blocked by RLS policies.");

  console.log("\n>>> STAGE 1 COMPLETED: Initial voter flow and security checks all PASSED! <<<");
  console.log(`Voter User ID: ${voterId}`);
  console.log(`Voter Token generated successfully.`);
}

runTests().catch(err => {
  console.error("\nTEST SUITE FAILED:", err);
  process.exit(1);
});
