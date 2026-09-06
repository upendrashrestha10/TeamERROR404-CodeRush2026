/**
 * E-CHUNAB - Voter Profile Logic (js/voter/profile.js)
 * Module: Manage Voter Personal Details & Verification History
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Voter Profile] Initializing profile view...');

  if (window.protectPage) {
    const authData = await window.protectPage('voter');
    if (authData) {
      if (authData.profile) {
        populateProfileFields(authData.profile);
      }
      await loadVoterVerificationRecord(authData.user.id);
    }
  }
});

function populateProfileFields(profile) {
  const nameInput = document.getElementById('profile-fullname');
  const emailInput = document.getElementById('profile-email');
  const phoneInput = document.getElementById('profile-phone');

  if (nameInput) nameInput.value = profile.full_name || '';
  if (emailInput) emailInput.value = profile.email || '';
  if (phoneInput) phoneInput.value = profile.phone || '';
}

async function loadVoterVerificationRecord(userId) {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client || !userId) return;

  const statusEl = document.getElementById('profile-voter-status');
  const citizEl = document.getElementById('profile-voter-citizno');
  const dobEl = document.getElementById('profile-voter-dob');
  const addrEl = document.getElementById('profile-voter-address');

  try {
    const { data: voter, error } = await client
      .from('voters')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!voter) {
      if (statusEl) {
        statusEl.textContent = 'Not Submitted';
        statusEl.style.color = 'var(--gray-500)';
      }
      if (citizEl) citizEl.textContent = 'Not Registered';
      if (dobEl) dobEl.textContent = '—';
      if (addrEl) addrEl.textContent = '—';
      return;
    }

    if (statusEl) {
      if (voter.verification_status === 'approved') {
        statusEl.textContent = 'Approved ✓';
        statusEl.style.color = 'var(--success-700)';
      } else if (voter.verification_status === 'pending') {
        statusEl.textContent = 'Pending Review ⏳';
        statusEl.style.color = 'var(--warning-700)';
      } else if (voter.verification_status === 'rejected') {
        statusEl.textContent = 'Rejected ✕';
        statusEl.style.color = 'var(--accent-red-600)';
      }
    }

    if (citizEl) citizEl.textContent = voter.citizenship_number || '—';
    if (dobEl) dobEl.textContent = voter.date_of_birth || '—';
    if (addrEl) addrEl.textContent = voter.address || '—';

  } catch (err) {
    console.error('[Profile Verification Error]', err);
  }
}
