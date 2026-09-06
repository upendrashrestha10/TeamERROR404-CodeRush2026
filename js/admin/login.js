/**
 * E-CHUNAB - Dedicated Admin Login Logic (js/admin/login.js)
 * Module: Authenticate Electoral Commission personnel and enforce role='admin'
 * Includes diagnostic logging for troubleshooting authentication flows
 */

async function handleAdminLogin() {
  const submitBtn = document.getElementById('btn-admin-login-submit');
  const emailInput = document.getElementById('admin-email');
  const passwordInput = document.getElementById('admin-password');

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  console.log('[Admin Auth Diagnostic] 1. Supabase URL being used:', window.SUPABASE_URL || 'Not configured');

  if (!email || !password) {
    console.warn('[Admin Auth Diagnostic] Validation failed: missing email or password.');
    if (window.showToast) showToast('warning', 'Validation', 'Please enter both admin email and password.');
    return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) {
    console.error('[Admin Auth Diagnostic] 8. Access Denied Reason: Supabase client unavailable or improperly configured.');
    if (window.showToast) showToast('error', 'Configuration Error', 'Unable to connect to Supabase authentication.');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating Admin...';
  }

  try {
    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (authError) {
      console.error('[Admin Auth Diagnostic] 2. signInWithPassword() status: FAILED');
      console.error('[Admin Auth Diagnostic] 7. Exact error returned by Supabase Auth:', authError.message, '(Code:', authError.status || authError.code, ')');
      console.error('[Admin Auth Diagnostic] 8. Access Denied Reason: Invalid login credentials at Supabase Auth credential level.');
      throw authError;
    }

    console.log('[Admin Auth Diagnostic] 2. signInWithPassword() status: SUCCESS');
    console.log('[Admin Auth Diagnostic] 3. Authenticated User ID:', authData.user.id);
    console.log('[Admin Auth Diagnostic] 4. Authenticated User Email:', authData.user.email);

    // 2. Query public.profiles to verify role='admin'
    const { data: profile, error: profError } = await client
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', authData.user.id)
      .single();

    if (profError) {
      console.error('[Admin Auth Diagnostic] 5. Profiles record check: FAILED / NOT FOUND');
      console.error('[Admin Auth Diagnostic] 7. Exact error returned by Supabase DB:', profError.message);
      console.error('[Admin Auth Diagnostic] 8. Access Denied Reason: Profile lookup failed for authenticated user UUID.');
      throw profError;
    }

    console.log('[Admin Auth Diagnostic] 5. Profiles record check: EXISTS');
    console.log('[Admin Auth Diagnostic] 6. Profile Role:', profile ? profile.role : 'None');

    // 3. Role Integrity Check
    if (!profile || profile.role !== 'admin') {
      console.warn('[Admin Auth Diagnostic] 8. Access Denied Reason: Role mismatch. Expected role "admin", found:', profile ? profile.role : 'null');
      await client.auth.signOut();

      if (window.showToast) {
        showToast('error', 'Admin Access Denied', 'Access restricted to Commission Administrators. Your account is registered as a Voter.');
      }
      return;
    }

    // 4. Admin Verified -> Proceed to Admin Dashboard
    console.log('[Admin Auth Diagnostic] Access Granted! Redirecting to admin dashboard...');
    if (window.showToast) {
      showToast('success', 'Admin Authenticated', `Welcome, ${profile.full_name || 'Commission Officer'}!`);
    }

    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 800);

  } catch (err) {
    console.error('[Admin Auth Catch]', err);
    let msg = err.message || 'Invalid admin credentials.';
    if (msg.toLowerCase().includes('invalid login credentials')) {
      msg = 'Invalid email or password. Please verify your credentials.';
    }
    if (window.showToast) {
      showToast('error', 'Authentication Failed', msg);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Authenticate Admin Access';
    }
  }
}

window.handleAdminLogin = handleAdminLogin;
