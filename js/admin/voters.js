/**
 * E-CHUNAB - Admin Voter Verification Management (js/admin/voters.js)
 * Module: Live voter verification inspection, secure signed document & live camera photo previews, approve & reject
 */

let allVoterRecords = [];
let currentInspectingVoter = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Admin Voters Management] Initializing...');

  let authData = null;
  if (window.protectPage) {
    authData = await window.protectPage('admin');
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) {
    if (window.showToast) showToast('error', 'Error', 'Supabase client not available.');
    return;
  }

  // Setup search and filter listeners
  const searchInput = document.getElementById('search-voters');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderVotersTable());
  }

  const filterSelect = document.getElementById('filter-verification-status');
  if (filterSelect) {
    filterSelect.addEventListener('change', () => renderVotersTable());
  }

  // Setup modal button listeners
  setupModalActionButtons(client, authData?.user);

  // Load live voters
  await fetchVoterRecords(client);
});

async function fetchVoterRecords(client) {
  const tableBody = document.querySelector('#voters-table tbody');
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 30px; color: var(--gray-500);">
          Loading voter verification applications from database...
        </td>
      </tr>
    `;
  }

  try {
    // Join voters with profiles to get name, email, phone
    const { data, error } = await client
      .from('voters')
      .select(`
        *,
        profiles:user_id (
          full_name,
          email,
          phone
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    allVoterRecords = data || [];
    updateFilterCounts();
    renderVotersTable();

  } catch (err) {
    console.error('[Fetch Voters Error]', err);
    if (window.showToast) {
      showToast('error', 'Query Error', 'Failed to fetch voter verification applications: ' + err.message);
    }
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 30px; color: var(--accent-red-600);">
            Failed to load voter applications.
          </td>
        </tr>
      `;
    }
  }
}

function updateFilterCounts() {
  const filterSelect = document.getElementById('filter-verification-status');
  if (!filterSelect) return;

  const pendingCount = allVoterRecords.filter(v => v.verification_status === 'pending').length;
  const approvedCount = allVoterRecords.filter(v => v.verification_status === 'approved').length;
  const rejectedCount = allVoterRecords.filter(v => v.verification_status === 'rejected').length;

  filterSelect.innerHTML = `
    <option value="all">All Statuses (${allVoterRecords.length})</option>
    <option value="pending" ${pendingCount > 0 ? 'selected' : ''}>Pending Review (${pendingCount})</option>
    <option value="approved">Approved (${approvedCount})</option>
    <option value="rejected">Rejected (${rejectedCount})</option>
  `;
}

function renderVotersTable() {
  const tableBody = document.querySelector('#voters-table tbody');
  if (!tableBody) return;

  const searchTerm = (document.getElementById('search-voters')?.value || '').toLowerCase();
  const filterStatus = document.getElementById('filter-verification-status')?.value || 'all';

  const filtered = allVoterRecords.filter(record => {
    const statusMatch = filterStatus === 'all' || record.verification_status === filterStatus;
    
    const name = record.profiles?.full_name?.toLowerCase() || '';
    const email = record.profiles?.email?.toLowerCase() || '';
    const citizNo = record.citizenship_number?.toLowerCase() || '';
    const searchMatch = !searchTerm || name.includes(searchTerm) || email.includes(searchTerm) || citizNo.includes(searchTerm);

    return statusMatch && searchMatch;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px 20px; color: var(--gray-500);">
          No voter records found matching current criteria.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(voter => {
    const fullName = voter.profiles?.full_name || 'N/A';
    const email = voter.profiles?.email || 'N/A';
    const phone = voter.profiles?.phone || 'N/A';
    const regDate = window.formatDate ? window.formatDate(voter.created_at) : voter.created_at?.slice(0, 10);
    
    let badgeClass = 'badge-pending';
    let badgeText = 'Pending Review';
    if (voter.verification_status === 'approved') {
      badgeClass = 'badge-approved';
      badgeText = 'Approved';
    } else if (voter.verification_status === 'rejected') {
      badgeClass = 'badge-rejected';
      badgeText = 'Rejected';
    }

    return `
      <tr>
        <td><strong>${window.escapeHTML(fullName)}</strong></td>
        <td>${window.escapeHTML(email)}</td>
        <td>${window.escapeHTML(phone)}</td>
        <td><code>${window.escapeHTML(voter.citizenship_number)}</code></td>
        <td><span class="badge ${badgeClass}"><span class="badge-dot"></span>${badgeText}</span></td>
        <td>${regDate}</td>
        <td style="text-align: right;">
          <button class="btn btn-sm ${voter.verification_status === 'pending' ? 'btn-primary' : 'btn-outline'}" 
                  onclick="openVoterInspectionModal('${voter.id}')">
            ${voter.verification_status === 'pending' ? 'Inspect Documents & Photo' : 'View Record'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function openVoterInspectionModal(voterId) {
  const voter = allVoterRecords.find(v => v.id === voterId);
  if (!voter) return;

  currentInspectingVoter = voter;
  const client = window.getSupabaseClient();

  // Populate textual info
  document.getElementById('modal-voter-name').textContent = voter.profiles?.full_name || 'N/A';
  document.getElementById('modal-voter-citizerno').textContent = voter.citizenship_number || 'N/A';
  document.getElementById('modal-voter-dob').textContent = voter.date_of_birth || 'N/A';
  document.getElementById('modal-voter-address').textContent = voter.address || 'N/A';

  // Reset rejection container
  const rejectContainer = document.getElementById('reject-reason-container');
  const rejectInput = document.getElementById('reject-reason-input');
  if (rejectContainer) rejectContainer.style.display = 'none';
  if (rejectInput) rejectInput.value = voter.rejection_reason || '';

  // Get preview element handles
  const frontImg = document.getElementById('preview-citiz-front');
  const backImg = document.getElementById('preview-citiz-back');
  const liveImg = document.getElementById('preview-live-photo');
  const fpRefImg = document.getElementById('preview-fp-ref');
  const fpLiveImg = document.getElementById('preview-fp-live');
  
  const missingLiveText = document.getElementById('live-photo-missing-text');
  const missingFpRefText = document.getElementById('fp-ref-missing-text');
  const missingFpLiveText = document.getElementById('fp-live-missing-text');

  if (frontImg) frontImg.src = '';
  if (backImg) backImg.src = '';
  if (liveImg) liveImg.src = '';
  if (fpRefImg) fpRefImg.src = '';
  if (fpLiveImg) fpLiveImg.src = '';

  // 1. Generate secure signed URL for Citizenship Front
  try {
    if (voter.citizenship_front && frontImg) {
      const { data: frontData } = await client.storage
        .from('citizenship-docs')
        .createSignedUrl(voter.citizenship_front, 3600);
      if (frontData?.signedUrl) {
        frontImg.src = frontData.signedUrl;
      }
    }

    // 2. Generate secure signed URL for Citizenship Back
    if (voter.citizenship_back && backImg) {
      const { data: backData } = await client.storage
        .from('citizenship-docs')
        .createSignedUrl(voter.citizenship_back, 3600);
      if (backData?.signedUrl) {
        backImg.src = backData.signedUrl;
      }
    }

    // 3. Generate secure signed URL for Live Camera Verification Photo
    if (voter.live_photo_path && liveImg) {
      const { data: liveData } = await client.storage
        .from('voter-live-photos')
        .createSignedUrl(voter.live_photo_path, 3600);
      if (liveData?.signedUrl) {
        liveImg.src = liveData.signedUrl;
        liveImg.style.display = 'block';
        if (missingLiveText) missingLiveText.style.display = 'none';
      }
    } else {
      if (liveImg) liveImg.style.display = 'none';
      if (missingLiveText) missingLiveText.style.display = 'block';
    }

    // 4. Generate secure signed URL for Reference Fingerprint
    if (voter.fingerprint_reference_path && fpRefImg) {
      const { data: refFpData } = await client.storage
        .from('voter-fingerprints')
        .createSignedUrl(voter.fingerprint_reference_path, 3600);
      if (refFpData?.signedUrl) {
        fpRefImg.src = refFpData.signedUrl;
        fpRefImg.style.display = 'block';
        if (missingFpRefText) missingFpRefText.style.display = 'none';
      }
    } else {
      if (fpRefImg) fpRefImg.style.display = 'none';
      if (missingFpRefText) missingFpRefText.style.display = 'block';
    }

    // 5. Generate secure signed URL for Live Camera Fingerprint
    if (voter.fingerprint_live_path && fpLiveImg) {
      const { data: liveFpData } = await client.storage
        .from('voter-fingerprints')
        .createSignedUrl(voter.fingerprint_live_path, 3600);
      if (liveFpData?.signedUrl) {
        fpLiveImg.src = liveFpData.signedUrl;
        fpLiveImg.style.display = 'block';
        if (missingFpLiveText) missingFpLiveText.style.display = 'none';
      }
    } else {
      if (fpLiveImg) fpLiveImg.style.display = 'none';
      if (missingFpLiveText) missingFpLiveText.style.display = 'block';
    }

  } catch (err) {
    console.error('[Signed URL Generation Error]', err);
  }

  // Populate Biometric Matching Summary & Warning Notice
  const matchBadge = document.getElementById('modal-fp-match-badge');
  const matchDetails = document.getElementById('modal-fp-match-details');
  const warningBanner = document.getElementById('modal-fp-warning-banner');

  const status = (voter.fingerprint_match_status || 'pending').toLowerCase();
  const score = (voter.fingerprint_match_score !== null && voter.fingerprint_match_score !== undefined) ? voter.fingerprint_match_score : 'N/A';

  if (matchBadge) {
    if (status === 'matched') {
      matchBadge.className = 'badge badge-approved';
      matchBadge.textContent = 'MATCH ✓';
    } else if (status === 'not_matched') {
      matchBadge.className = 'badge badge-rejected';
      matchBadge.textContent = 'NO MATCH ❌';
    } else if (status === 'unable_to_verify') {
      matchBadge.className = 'badge badge-pending';
      matchBadge.textContent = 'UNABLE TO VERIFY ⚠️';
    } else {
      matchBadge.className = 'badge badge-pending';
      matchBadge.textContent = 'REQUIRES REVIEW ⏳';
    }
  }

  if (matchDetails) {
    matchDetails.textContent = `Inlier Match Score: ${score} | Status: ${status.toUpperCase()} | Algorithm: OpenCV SIFT Keypoint & RANSAC Inlier Matching`;
  }

  if (warningBanner) {
    if (status === 'not_matched' || status === 'unable_to_verify' || status === 'requires_review') {
      warningBanner.style.display = 'block';
    } else {
      warningBanner.style.display = 'none';
    }
  }

  // Configure action buttons visibility
  const approveBtn = document.getElementById('btn-approve-voter');
  const rejectBtn = document.getElementById('btn-reject-voter');

  if (voter.verification_status === 'approved') {
    if (approveBtn) approveBtn.textContent = 'Already Approved';
    if (approveBtn) approveBtn.disabled = true;
  } else {
    if (approveBtn) approveBtn.textContent = 'Approve Voter';
    if (approveBtn) approveBtn.disabled = false;
  }

  if (window.openModal) {
    window.openModal('voter-doc-modal');
  }
}

function setupModalActionButtons(client, currentUser) {
  const approveBtn = document.getElementById('btn-approve-voter');
  const rejectBtn = document.getElementById('btn-reject-voter');

  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      if (!currentInspectingVoter) return;

      approveBtn.disabled = true;
      approveBtn.textContent = 'Approving...';

      try {
        const { error } = await client
          .from('voters')
          .update({
            verification_status: 'approved',
            rejection_reason: null,
            verified_by: currentUser?.id || null,
            verified_at: new Date().toISOString()
          })
          .eq('id', currentInspectingVoter.id);

        if (error) throw error;

        if (window.showToast) {
          showToast('success', 'Approved', `${currentInspectingVoter.profiles?.full_name || 'Voter'} has been approved!`);
        }

        if (window.closeModal) window.closeModal('voter-doc-modal');
        await fetchVoterRecords(client);

      } catch (err) {
        console.error('[Approval Error]', err);
        if (window.showToast) {
          showToast('error', 'Approval Failed', err.message);
        }
      } finally {
        approveBtn.disabled = false;
        approveBtn.textContent = 'Approve Voter';
      }
    });
  }

  if (rejectBtn) {
    rejectBtn.addEventListener('click', async () => {
      if (!currentInspectingVoter) return;

      const rejectContainer = document.getElementById('reject-reason-container');
      const rejectInput = document.getElementById('reject-reason-input');

      // First click opens reason box if hidden
      if (rejectContainer && rejectContainer.style.display === 'none') {
        rejectContainer.style.display = 'block';
        rejectInput.focus();
        rejectBtn.textContent = 'Confirm Rejection';
        return;
      }

      const reason = rejectInput?.value.trim();
      if (!reason) {
        if (window.showToast) {
          showToast('warning', 'Reason Required', 'Please provide a reason for rejecting this document.');
        }
        rejectInput?.focus();
        return;
      }

      rejectBtn.disabled = true;
      rejectBtn.textContent = 'Rejecting...';

      try {
        const { error } = await client
          .from('voters')
          .update({
            verification_status: 'rejected',
            rejection_reason: reason,
            verified_by: currentUser?.id || null,
            verified_at: new Date().toISOString()
          })
          .eq('id', currentInspectingVoter.id);

        if (error) throw error;

        if (window.showToast) {
          showToast('warning', 'Rejected', `Application rejected with stored reason.`);
        }

        if (window.closeModal) window.closeModal('voter-doc-modal');
        await fetchVoterRecords(client);

      } catch (err) {
        console.error('[Rejection Error]', err);
        if (window.showToast) {
          showToast('error', 'Rejection Failed', err.message);
        }
      } finally {
        rejectBtn.disabled = false;
        rejectBtn.textContent = 'Reject Application';
      }
    });
  }
}

// Expose globally for table action buttons
window.openVoterInspectionModal = openVoterInspectionModal;
