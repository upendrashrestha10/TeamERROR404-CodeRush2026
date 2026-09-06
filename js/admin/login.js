/**
 * E-CHUNAB - Dedicated Admin Login Logic (js/admin/login.js)
 * Module: Authenticate Electoral Commission personnel and enforce role='admin'
 */

async function handleAdminLogin() {
  const submitBtn = document.getElementById('btn-admin-login-submit');
  const emailInput = document.getElementById('admin-email');
  const passwordInput = document.getElementById('admin-password');

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email || !password) {
    if (window.showToast) showToast('warning', 'Validation', 'Please enter both admin email and password.');
    return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) {
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

    if (authError) throw authError;

    // 2. Query public.profiles to verify role='admin'
    const { data: profile, error: profError } = await client
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', authData.user.id)
      .single();

    if (profError) throw profError;

    // 3. Role Integrity Check
    if (!profile || profile.role !== 'admin') {
      // User is a voter or non-admin actor -> DENY ACCESS and sign out session immediately
      console.warn('[Admin Login] Access denied for non-admin user:', authData.user.id);
      await client.auth.signOut();

      if (window.showToast) {
        showToast('error', 'Admin Access Denied', 'Access restricted to Commission Administrators. Your account is registered as a Voter.');
      }
      return;
    }

    // 4. Admin Verified -> Proceed to Admin Dashboard
    if (window.showToast) {
      showToast('success', 'Admin Authenticated', `Welcome, ${profile.full_name || 'Commission Officer'}!`);
    }

    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 800);

  } catch (err) {
    console.error('[Admin Login Error]', err);
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
