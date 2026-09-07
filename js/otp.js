/**
 * E-CHUNAB - Email OTP Verification (js/otp.js)
 * Realistic Email OTP Verification Page logic.
 * Local verification evaluates configuration OTP (273283) silently.
 */

let pendingEmail = '';
let resendTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[OTP] Initializing email verification page...');

  // Ensure Demo Banner elements remain hidden if present
  const demoBanner = document.getElementById('demo-otp-banner');
  if (demoBanner) {
    demoBanner.style.display = 'none';
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

  // Page Guard: If no registration context exists, redirect to registration (Requirement 20)
  if (!pendingEmail) {
    const maskedText = document.getElementById('masked-email-text');
    if (maskedText) maskedText.textContent = 'Session expired';
    if (window.showToast) {
      showToast('error', 'Session Expired', 'Registration session not found. Please register again.');
    }
    setTimeout(() => {
      window.location.href = 'register.html';
    }, 1500);
    return;
  }

  // Display masked email in UI (Requirement 3)
  const maskedText = document.getElementById('masked-email-text');
  if (maskedText && pendingEmail) {
    maskedText.textContent = maskEmail(pendingEmail);
  }

  // 2. Setup 6-digit OTP Input Box Behaviors
  setupOTPBoxes();

  // 3. Setup Resend Button Handler
  const resendBtn = document.getElementById('btn-resend-otp');
  if (resendBtn) {
    resendBtn.addEventListener('click', handleResendOTP);
  }
});

/**
 * Mask Email for UI Privacy (Requirement 3)
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
 * Setup 6-digit OTP Input Box Behaviors (Requirement 4)
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
 * Verify OTP Token via Local Configuration Comparison (Requirements 6, 7, 13, 22)
 * DOES NOT call Supabase verifyOtp() API.
 * DOES NOT display or reveal the target OTP.
 */
async function handleVerifyOTP() {
  const boxes = document.querySelectorAll('.otp-box');
  let token = '';
  boxes.forEach(box => { token += box.value.trim(); });

  // Requirement 22: Check empty input
  if (!token) {
    if (window.showToast) {
      showToast('warning', 'Validation', 'Please enter the verification code.');
    }
    return;
  }

  // Requirement 4 & 22: Check 6 digits
  if (token.length < 6) {
    if (window.showToast) {
      showToast('warning', 'Validation', 'Please enter the full 6-digit verification code.');
    }
    return;
  }

  // Requirement 20: Check registration session email binding
  const currentNormalizedEmail = (pendingEmail || '').trim().toLowerCase();
  if (!currentNormalizedEmail) {
    if (window.showToast) {
      showToast('error', 'Session Expired', 'Registration session not found. Please register again.');
    }
    setTimeout(() => { window.location.href = 'register.html'; }, 1500);
    return;
  }

  const submitBtn = document.getElementById('btn-verify-otp');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';
  }

  // Configuration fixed OTP value (273283) evaluated silently
  const expectedOtp = String(
    (window.ECHUNAB_CONFIG && (window.ECHUNAB_CONFIG.DUMMY_OTP || window.ECHUNAB_CONFIG.DEMO_OTP)) || '273283'
  ).trim();

  const enteredOtp = token.trim();

  // Requirement 7 & 22: Invalid OTP check
  if (enteredOtp !== expectedOtp) {
    if (window.showToast) {
      showToast('error', 'Verification Failed', 'Invalid verification code. Please try again.');
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify Email →';
    }
    return;
  }

  // Requirement 6 & 19: Success behavior & local state storage
  sessionStorage.setItem('echunab_dummy_otp_verified', 'true');
  sessionStorage.setItem('echunab_dummy_otp_email', currentNormalizedEmail);
  sessionStorage.setItem('echunab_demo_verified', 'true');
  sessionStorage.setItem('echunab_demo_verified_email', currentNormalizedEmail);

  if (window.showToast) {
    showToast('success', 'Verified', 'Email verified successfully.');
  }

  setTimeout(() => {
    window.location.href = 'verification.html';
  }, 1000);
}

/**
 * Handle "Resend Code" button click (Requirements 9 & 10)
 * Does NOT call Supabase resend().
 * Resets OTP input fields, triggers realistic cooldown timer, and displays neutral confirmation message.
 */
function handleResendOTP() {
  const boxes = document.querySelectorAll('.otp-box');
  boxes.forEach(box => {
    box.value = '';
    box.classList.remove('filled');
  });

  if (boxes[0]) boxes[0].focus();

  startResendCooldown(60);

  if (window.showToast) {
    showToast('info', 'Request Sent', 'A new verification code has been requested.');
  }
}

/**
 * Realistic Resend Cooldown Timer (Requirement 10)
 */
function startResendCooldown(seconds = 60) {
  const resendBtn = document.getElementById('btn-resend-otp');
  const timerText = document.getElementById('resend-timer-text');

  if (!resendBtn) return;

  if (resendTimer) clearInterval(resendTimer);

  let remaining = seconds;
  resendBtn.disabled = true;
  if (timerText) timerText.textContent = `(${remaining}s)`;

  resendTimer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      if (timerText) timerText.textContent = `(${remaining}s)`;
    } else {
      clearInterval(resendTimer);
      resendTimer = null;
      resendBtn.disabled = false;
      if (timerText) timerText.textContent = '';
    }
  }, 1000);
}

// Global functions for inline HTML event bindings
window.handleVerifyOTP = handleVerifyOTP;
window.handleResendOTP = handleResendOTP;
