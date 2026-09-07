/**
 * E-CHUNAB - Email OTP Verification (js/otp.js)
 * Fully local/dummy OTP verification for demo environment.
 * Fixed Demo OTP: 273283
 */

let pendingEmail = '';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[OTP] Initializing dummy email verification page...');

  // 0. Ensure Demo Banner Visibility
  const demoBanner = document.getElementById('demo-otp-banner');
  if (demoBanner) {
    demoBanner.style.display = 'block';
  }

  // 1. Resolve Target Registration Email (from sessionStorage or active Supabase session)
  pendingEmail = (
    sessionStorage.getItem('echunab_dummy_otp_email') ||
    sessionStorage.getItem('pendingVerificationEmail') ||
    sessionStorage.getItem('echunab_demo_otp_email') ||
    ''
  ).trim().toLowerCase();

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;

  if (!pendingEmail && client) {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (session && session.user) {
        pendingEmail = session.user.email.trim().toLowerCase();
      }
    } catch (e) {
      console.warn('[OTP] Error fetching session user email:', e);
    }
  }

  // Page Guard: If no registration context exists, redirect to registration (Requirement 27)
  if (!pendingEmail) {
    console.warn('[OTP] Registration session not found.');
    const maskedText = document.getElementById('masked-email-text');
    if (maskedText) maskedText.textContent = 'Session not found';
    if (window.showToast) {
      showToast('error', 'Session Missing', 'Registration session not found. Please register again.');
    }
    setTimeout(() => {
      window.location.href = 'register.html';
    }, 1500);
    return;
  }

  // Display masked email in UI
  const maskedText = document.getElementById('masked-email-text');
  if (maskedText && pendingEmail) {
    maskedText.textContent = maskEmail(pendingEmail);
  }

  // 2. Setup 6-digit OTP Input Box Behaviors
  setupOTPBoxes();

  // 3. Setup Demo OTP Button Handler
  const resendBtn = document.getElementById('btn-resend-otp');
  if (resendBtn) {
    resendBtn.addEventListener('click', handleResendOTP);
  }
});

/**
 * Mask Email for UI Privacy
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
 * Setup 6-digit OTP Input Box Behaviors (Requirement 7)
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
 * Perform Local Dummy OTP Verification (Requirements 4, 8, 9, 10, 11, 12)
 * Fixed OTP: 273283
 * DOES NOT call Supabase verifyOtp() API.
 */
async function handleVerifyOTP() {
  const boxes = document.querySelectorAll('.otp-box');
  let token = '';
  boxes.forEach(box => { token += box.value.trim(); });

  // Requirement 10: Check empty or missing input
  if (!token) {
    if (window.showToast) {
      showToast('warning', 'Validation', 'Please enter the OTP.');
    }
    return;
  }

  // Requirement 7: Check 6 digits
  if (token.length < 6) {
    if (window.showToast) {
      showToast('warning', 'Validation', 'Please enter the full 6-digit verification code.');
    }
    return;
  }

  // Requirement 27 & 12: Check registration session email binding
  const currentNormalizedEmail = (pendingEmail || '').trim().toLowerCase();
  if (!currentNormalizedEmail) {
    if (window.showToast) {
      showToast('error', 'Session Missing', 'Registration session not found. Please register again.');
    }
    setTimeout(() => { window.location.href = 'register.html'; }, 1500);
    return;
  }

  const submitBtn = document.getElementById('btn-verify-otp');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';
  }

  // Configuration fixed OTP value (273283)
  const expectedOtp = String(
    (window.ECHUNAB_CONFIG && (window.ECHUNAB_CONFIG.DUMMY_OTP || window.ECHUNAB_CONFIG.DEMO_OTP)) || '273283'
  ).trim();

  const enteredOtp = token.trim();

  // Requirement 9: Invalid OTP check
  if (enteredOtp !== expectedOtp) {
    console.warn(`[Dummy OTP] Invalid input (${enteredOtp}). Expected: ${expectedOtp}`);
    if (window.showToast) {
      showToast('error', 'Invalid OTP', 'Invalid OTP. Please enter the correct 6-digit OTP.');
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify Email →';
    }
    return;
  }

  // Requirement 8 & 11: Success behavior & state storage
  console.log(`[Dummy OTP] Successful local OTP verification for email: ${currentNormalizedEmail}`);

  sessionStorage.setItem('echunab_dummy_otp_verified', 'true');
  sessionStorage.setItem('echunab_dummy_otp_email', currentNormalizedEmail);
  sessionStorage.setItem('echunab_demo_verified', 'true');
  sessionStorage.setItem('echunab_demo_verified_email', currentNormalizedEmail);

  if (window.showToast) {
    showToast('success', 'Verified', 'Email verification successful.');
  }

  setTimeout(() => {
    window.location.href = 'verification.html';
  }, 1000);
}

/**
 * Handle "Show Demo OTP" button click (Requirement 18)
 * Auto-fills 273283 into boxes for ease of demo testing.
 */
function handleResendOTP() {
  const expectedOtp = String(
    (window.ECHUNAB_CONFIG && (window.ECHUNAB_CONFIG.DUMMY_OTP || window.ECHUNAB_CONFIG.DEMO_OTP)) || '273283'
  ).trim();

  const boxes = document.querySelectorAll('.otp-box');
  expectedOtp.split('').forEach((digit, idx) => {
    if (boxes[idx]) {
      boxes[idx].value = digit;
      boxes[idx].classList.add('filled');
    }
  });

  if (boxes[boxes.length - 1]) {
    boxes[boxes.length - 1].focus();
  }

  if (window.showToast) {
    showToast('info', 'Demo OTP', `Demo OTP (${expectedOtp}) applied.`);
  }
}

// Global functions for inline HTML event bindings
window.handleVerifyOTP = handleVerifyOTP;
window.handleResendOTP = handleResendOTP;
