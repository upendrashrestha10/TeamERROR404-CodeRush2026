/**
 * E-CHUNAB - Authentication & Route Guard Helper (auth.js)
 * Handles user authentication state, role verification, and route protection
 */

async function getCurrentSession() {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return null;
  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    return session;
  } catch (err) {
    console.error("[Auth] Error getting session:", err);
    return null;
  }
}

async function getCurrentUser() {
  const session = await getCurrentSession();
  return session ? session.user : null;
}

async function getUserProfile(userId) {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client || !userId) return null;
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("[Auth] Error fetching profile:", err);
    return null;
  }
}

async function getVoterVerification(userId) {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client || !userId) return null;
  try {
    const { data, error } = await client
      .from('voters')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("[Auth] Error fetching voter verification:", err);
    return null;
  }
}

/**
 * Route protection guard for authenticated pages
 * @param {'voter'|'admin'} requiredRole 
 */
async function protectPage(requiredRole = null) {
  if (!window.isSupabaseConfigured || !window.isSupabaseConfigured()) {
    console.warn("[Auth] Supabase credentials not configured yet. Running in UI preview mode.");
    return null;
  }

  const session = await getCurrentSession();
  const isAdminPath = window.location.pathname.includes('/admin/');
  const isVoterPath = window.location.pathname.includes('/voter/');

  if (!session) {
    // Unauthenticated user redirection
    if (isAdminPath) {
      window.location.href = 'login.html';
    } else {
      window.location.href = isVoterPath ? '../auth/login.html' : 'auth/login.html';
    }
    return null;
  }

  const profile = await getUserProfile(session.user.id);
  if (requiredRole && profile && profile.role !== requiredRole) {
    // Role mismatch redirect
    if (requiredRole === 'admin') {
      window.location.href = isAdminPath ? 'login.html' : 'admin/login.html';
    } else {
      window.location.href = isAdminPath ? 'dashboard.html' : 'admin/dashboard.html';
    }
    return null;
  }

  return { session, user: session.user, profile };
}

/**
 * Sign out action
 */
async function signOutUser() {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (client) {
    try {
      await client.auth.signOut();
    } catch (e) {
      console.warn("[Auth] Signout error:", e);
    }
  }

  const isAdminPath = window.location.pathname.includes('/admin/');
  const isVoterPath = window.location.pathname.includes('/voter/') || window.location.pathname.includes('/auth/');

  if (isAdminPath) {
    window.location.href = 'login.html';
  } else {
    window.location.href = isVoterPath ? '../auth/login.html' : 'auth/login.html';
  }
}

// Bind signout buttons if present on the page
document.addEventListener('DOMContentLoaded', () => {
  const logoutButtons = document.querySelectorAll('.action-logout, [data-action="logout"]');
  logoutButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      signOutUser();
    });
  });
});

window.getCurrentSession = getCurrentSession;
window.getCurrentUser = getCurrentUser;
window.getUserProfile = getUserProfile;
window.getVoterVerification = getVoterVerification;
window.protectPage = protectPage;
window.signOutUser = signOutUser;
