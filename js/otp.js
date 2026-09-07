/**
 * E-CHUNAB - Email OTP Verification (js/otp.js)
 * Handles 6-digit OTP input, Supabase Auth verifyOtp(), resend cooldown, and user feedback
 */

let pendingEmail = '';
let resendTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[OTP] Initializing email verification page...');

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  // 1. Resolve Target Email (from sessionStorage or active unverified Supabase session)
  pendingEmail = sessionStorage.getItem('pendingVerificationEmail') || '';

  if (!pendingEmail) {
    // Check if user is currently signed in but email is unconfirmed
    try {
      const { data: { session } } = await client.auth.getSession();
      if (session && session.user && !session.user.email_confirmed_at) {
        pendingEmail = session.user.email;
      }
    } catch (e) {
      console.warn('[OTP] Error fetching session user email:', e);
    }
  }

  // Display masked email in UI
  const maskedText = document.getElementById('masked-email-text');
  if (maskedText) {
    if (pendingEmail) {
      maskedText.textContent = maskEmail(pendingEmail);
    } else {
      maskedText.textContent = 'No pending email found';
      if (window.showToast) {
        showToast('warning', 'Notice', 'Verification email information is missing. Please register or log in.');
      }
    }
  }

  // 2. Setup 6-digit OTP Input Box Behaviors
  setupOTPBoxes();

  // 3. Setup Resend Button Handler
  const resendBtn = document.getElementById('btn-resend-otp');
  if (resendBtn) {
    resendBtn.addEventListener('click', handleResendOTP);
  }

  // Start initial resend cooldown timer (60s)
  startResendCooldown(60);
});

/**
 * Mask Email for UI Privacy (Requirement 19)
 * e.g., "upendra@gmail.com" -> "u******@gmail.com"
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  const maskedLocal = local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

/**
 * Setup 6-digit OTP Input Box Behaviors (Requirement 7 & 47)
 */
function setupOTPBoxes() {
  const boxes = document.querySelectorAll('.otp-box');
  if (!boxes || boxes.length === 0) return;

  boxes.forEach((box, index) => {
    // Input Event: Auto advance & numeric filter
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val;

      if (val) {
        box.classList.add('filled');
        if (index < boxes.length - 1) {
          boxes[index + 1].focus();
        }
      } else {
        box.classList.remove('filled');
      }
    });

    // Keydown Event: Backspace & Arrow Navigation
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (!e.target.value && index > 0) {
          boxes[index - 1].focus();
          boxes[index - 1].value = '';
          boxes[index - 1].classList.remove('filled');
        }
      } else if (e.key === 'ArrowLeft' && index > 0) {
        boxes[index - 1].focus();
      } else if (e.key === 'ArrowRight' && index < boxes.length - 1) {
        boxes[index + 1].focus();
      }
    });

    // Paste Event: Allow pasting full 6-digit OTP
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text');
      const digits = pasteData.replace(/[^0-9]/g, '').slice(0, 6);

      digits.split('').forEach((digit, idx) => {
        if (boxes[idx]) {
          boxes[idx].value = digit;
          boxes[idx].classList.add('filled');
        }
      });

      const focusIdx = Math.min(digits.length, boxes.length - 1);
      if (boxes[focusIdx]) boxes[focusIdx].focus();
    });
  });
}

/**
 * Verify OTP Token via Supabase Auth (Requirement 8, 9, 16, 17)
 */
async function handleVerifyOTP() {
  const boxes = document.querySelectorAll('.otp-box');
  let token = '';
  boxes.forEach(box => { token += box.value.trim(); });

  if (token.length !== 6) {
    if (window.showToast) showToast('warning', 'Validation', 'Please enter the full 6-digit verification code.');
    return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) {
    if (window.showToast) showToast('error', 'Error', 'Supabase client not initialized.');
    return;
  }

  if (!pendingEmail) {
    if (window.showToast) showToast('error', 'Missing Email', 'Verification email is missing. Please register again.');
    setTimeout(() => { window.location.href = 'register.html'; }, 1500);
    return;
  }

  const submitBtn = document.getElementById('btn-verify-otp');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';
  }

  try {
    console.log(`[Supabase Auth] Verifying OTP token for ${pendingEmail}...`);

    const { data, error } = await client.auth.verifyOtp({
      email: pendingEmail,
      token: token,
      type: 'email'
    });

    if (error) throw error;

    console.log('[Supabase Auth] OTP verification successful!', data);

    sessionStorage.removeItem('pendingVerificationEmail');

    if (window.showToast) {
      showToast('success', 'Email Verified ✓', 'Your email has been successfully verified! Redirecting to voter verification...');
    }

    setTimeout(() => {
      window.location.href = 'verification.html';
    }, 1200);

  } catch (err) {
    console.error('[OTP Verification Error]', err);

    let errorMsg = 'Incorrect verification code. Please check your email and try again.';
    const rawMsg = (err.message || '').toLowerCase();

    if (rawMsg.includes('expired')) {
      errorMsg = 'This verification code has expired. Please request a new code.';
    } else if (rawMsg.includes('rate limit') || rawMsg.includes('too many')) {
      errorMsg = 'Too many requests. Please wait before requesting another code.';
    } else if (rawMsg.includes('invalid')) {
      errorMsg = 'Incorrect verification code. Please check your email and try again.';
    }

    if (window.showToast) {
      showToast('error', 'Verification Failed', errorMsg);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify Email →';
    }
  }
}

/**
 * Resend Verification Code (Requirement 14, 15)
 */
async function handleResendOTP() {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client || !pendingEmail) {
    if (window.showToast) showToast('warning', 'Notice', 'No target email found for resending code.');
    return;
  }

  const resendBtn = document.getElementById('btn-resend-otp');
  if (resendBtn) {
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending...';
  }

  try {
    console.log(`[Supabase Auth] Resending signup OTP email to ${pendingEmail}...`);

    const { error } = await client.auth.resend({
      type: 'signup',
      email: pendingEmail
    });

    if (error) throw error;

    if (window.showToast) {
      showToast('success', 'Code Sent', `Verification code sent to ${maskEmail(pendingEmail)}.`);
    }

    startResendCooldown(60);

  } catch (err) {
    console.error('[Resend OTP Error]', err);
    let msg = 'Failed to resend verification code.';
    if ((err.message || '').toLowerCase().includes('rate limit') || (err.message || '').toLowerCase().includes('seconds')) {
      msg = 'Too many requests. Please wait before requesting another code.';
    }
    if (window.showToast) {
      showToast('error', 'Resend Failed', msg);
    }
    if (resendBtn) {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend Code';
    }
  }
}

/**
 * Resend Cooldown Timer (Requirement 14)
 */
function startResendCooldown(seconds = 60) {
  const resendBtn = document.getElementById('btn-resend-otp');
  const timerText = document.getElementById('resend-timer-text');

  if (!resendBtn) return;

  if (resendTimer) clearInterval(resendTimer);

  let remaining = seconds;
  resendBtn.disabled = true;
  resendBtn.textContent = 'Resend Code';
  if (timerText) timerText.textContent = `(Resend in ${remaining}s)`;

  resendTimer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      if (timerText) timerText.textContent = `(Resend in ${remaining}s)`;
    } else {
      clearInterval(resendTimer);
      resendTimer = null;
      resendBtn.disabled = false;
      if (timerText) timerText.textContent = '';
    }
  }, 1000);
}

// Global functions for onclick bindings
window.handleVerifyOTP = handleVerifyOTP;
window.handleResendOTP = handleResendOTP;
