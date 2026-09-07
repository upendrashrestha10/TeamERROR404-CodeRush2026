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
 * Checks whether user email OTP verification requirement is satisfied
 * Handles real email_confirmed_at or local dummy OTP verification state
 */
function isEmailOtpVerified(user) {
  if (!user) return false;
  if (user.email_confirmed_at) return true;

  const isDemoMode = (window.ECHUNAB_CONFIG && (window.ECHUNAB_CONFIG.DUMMY_OTP_MODE === true || window.ECHUNAB_CONFIG.DEMO_OTP_MODE === true)) || (typeof ECHUNAB_CONFIG !== 'undefined' && (ECHUNAB_CONFIG.DUMMY_OTP_MODE === true || ECHUNAB_CONFIG.DEMO_OTP_MODE === true));
  if (isDemoMode) {
    const isVerified = sessionStorage.getItem('echunab_dummy_otp_verified') === 'true' || sessionStorage.getItem('echunab_demo_verified') === 'true';
    const verifiedEmail = (sessionStorage.getItem('echunab_dummy_otp_email') || sessionStorage.getItem('echunab_demo_verified_email') || '').trim().toLowerCase();
    const currentEmail = (user.email || '').trim().toLowerCase();
    if (isVerified && verifiedEmail && currentEmail && verifiedEmail === currentEmail) {
      return true;
    }
  }
  return false;
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
  const userRole = profile?.role || 'voter';

  // Check email confirmation status for voter role
  const isOtpPage = window.location.pathname.includes('/auth/otp.html');

  if (session.user && !isEmailOtpVerified(session.user) && userRole === 'voter' && !isAdminPath) {
    if (!isOtpPage) {
      if (session.user.email) {
        sessionStorage.setItem('pendingVerificationEmail', session.user.email);
        sessionStorage.setItem('echunab_dummy_otp_email', session.user.email);
      }
      window.location.href = isVoterPath ? '../auth/otp.html' : (window.location.pathname.includes('/auth/') ? 'otp.html' : 'auth/otp.html');
      return null;
    }
  }

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
window.isEmailOtpVerified = isEmailOtpVerified;
