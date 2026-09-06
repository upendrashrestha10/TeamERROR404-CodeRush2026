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

  // Setup modal button listeners & image viewer
  setupModalActionButtons(client, authData?.user);
  setupImageViewer();

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
        frontImg.dataset.fullUrl = frontData.signedUrl;
        frontImg.dataset.title = 'Citizenship Front';
        frontImg.classList.add('clickable-preview');
      }
    }

    // 2. Generate secure signed URL for Citizenship Back
    if (voter.citizenship_back && backImg) {
      const { data: backData } = await client.storage
        .from('citizenship-docs')
        .createSignedUrl(voter.citizenship_back, 3600);
      if (backData?.signedUrl) {
        backImg.src = backData.signedUrl;
        backImg.dataset.fullUrl = backData.signedUrl;
        backImg.dataset.title = 'Citizenship Back';
        backImg.classList.add('clickable-preview');
      }
    }

    // 3. Generate secure signed URL for Live Camera Verification Photo
    if (voter.live_photo_path && liveImg) {
      const { data: liveData } = await client.storage
        .from('voter-live-photos')
        .createSignedUrl(voter.live_photo_path, 3600);
      if (liveData?.signedUrl) {
        liveImg.src = liveData.signedUrl;
        liveImg.dataset.fullUrl = liveData.signedUrl;
        liveImg.dataset.title = 'Live Face Photo';
        liveImg.classList.add('clickable-preview');
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
        fpRefImg.dataset.fullUrl = refFpData.signedUrl;
        fpRefImg.dataset.title = 'Citizenship Card Fingerprint';
        fpRefImg.classList.add('clickable-preview');
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
        fpLiveImg.dataset.fullUrl = liveFpData.signedUrl;
        fpLiveImg.dataset.title = 'Live Fingerprint';
        fpLiveImg.classList.add('clickable-preview');
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

  // Populate Biometric Matching Summary & Warning Notice (Requirements 25, 26, 27)
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
      matchBadge.textContent = 'PENDING REVIEW ⏳';
    }
  }

  if (matchDetails) {
    matchDetails.textContent = `Verified Inlier Score: ${score} | Status: ${status.toUpperCase()} | Source: Citizenship Card Camera Scan vs Voter Live Capture`;
  }

  if (warningBanner) {
    warningBanner.style.display = 'block';
    if (status === 'not_matched') {
      warningBanner.style.background = 'rgba(220,38,38,0.1)';
      warningBanner.style.border = '1px solid rgba(220,38,38,0.3)';
      warningBanner.style.color = 'var(--accent-red-700)';
      warningBanner.innerHTML = '❌ <strong>Biometric Warning:</strong> Fingerprint comparison did not produce a sufficient match. Carefully review the citizenship document and fingerprint captures before making a decision.';
    } else if (status === 'unable_to_verify') {
      warningBanner.style.background = 'rgba(234,179,8,0.12)';
      warningBanner.style.border = '1px solid rgba(234,179,8,0.35)';
      warningBanner.style.color = 'var(--warning-700)';
      warningBanner.innerHTML = '⚠️ <strong>Biometric Warning:</strong> The biometric system could not reliably process the fingerprint images.';
    } else if (status === 'matched') {
      warningBanner.style.background = 'rgba(34,197,94,0.1)';
      warningBanner.style.border = '1px solid rgba(34,197,94,0.3)';
      warningBanner.style.color = 'var(--success-700)';
      warningBanner.innerHTML = '✓ <strong>Biometric Result:</strong> Fingerprint matcher reports a match. Final voter approval still requires administrator review.';
    } else {
      warningBanner.style.background = 'var(--gray-100)';
      warningBanner.style.border = '1px solid var(--gray-300)';
      warningBanner.style.color = 'var(--gray-800)';
      warningBanner.innerHTML = '⏳ <strong>Notice:</strong> Fingerprint verification pending administrative review.';
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

/* ============================================================
   REUSABLE FULL-SCREEN IMAGE VIEWER / LIGHTBOX (Requirement 1-10, 15, 29)
   ============================================================ */
let currentViewerZoom = 1;

function setupImageViewer() {
  const viewer = document.getElementById('imageViewer');
  const closeBtn = document.getElementById('imageViewerClose');
  const backdrop = document.getElementById('imageViewerBackdrop') || document.querySelector('.image-viewer-backdrop');
  const imageElement = document.getElementById('imageViewerImage');
  const zoomInBtn = document.getElementById('imageViewerZoomIn');
  const zoomOutBtn = document.getElementById('imageViewerZoomOut');
  const zoomLevel = document.getElementById('imageViewerZoomLevel') || document.getElementById('imageViewerReset');
  const container = document.querySelector('.image-viewer-image-container') || document.getElementById('imageViewerStage');

  if (!viewer) return;

  // 10. Close button listener
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeImageViewer();
    });
  }

  // 7. Backdrop closing listener
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      closeImageViewer();
    });
  }

  // 6. Stop propagation on image click so clicking image NEVER closes viewer
  if (imageElement) {
    imageElement.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // 8. ESC key listener
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeViewer = document.getElementById('imageViewer');
      if (activeViewer && activeViewer.classList.contains('active')) {
        closeImageViewer();
      }
    }
  });

  // 15. Zoom button listeners
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setZoomScale(currentViewerZoom + 0.25);
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setZoomScale(currentViewerZoom - 0.25);
    });
  }

  if (zoomLevel) {
    zoomLevel.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setZoomScale(1);
    });
    zoomLevel.style.cursor = 'pointer';
  }

  // Mouse wheel zoom on image container
  if (container) {
    container.addEventListener('wheel', (e) => {
      if (!viewer.classList.contains('active')) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setZoomScale(currentViewerZoom + delta);
    }, { passive: false });
  }

  // 1. EVENT DELEGATION: Dynamically created .clickable-preview images ALWAYS work
  document.addEventListener('click', (event) => {
    let target = event.target;

    // Handle clicks on hint text badge inside doc-preview-box
    if (target.classList.contains('doc-preview-hint')) {
      const parentBox = target.closest('.doc-preview-box');
      if (parentBox) {
        const img = parentBox.querySelector('.clickable-preview');
        if (img) target = img;
      }
    }

    const image = target.closest('.clickable-preview');
    if (!image) return;

    event.preventDefault();
    event.stopPropagation();

    const imageUrl =
      image.dataset.fullUrl ||
      image.dataset.imageUrl ||
      image.getAttribute('src') ||
      image.src;

    const imageTitle =
      image.dataset.title ||
      image.alt ||
      'Document Preview';

    if (!imageUrl || imageUrl.trim() === '' || imageUrl.startsWith('data:') || image.style.display === 'none') {
      if (window.showToast) {
        showToast('warning', 'Notice', `Document image for "${imageTitle}" is not available.`);
      }
      return;
    }

    openImageViewer(imageUrl, imageTitle);
  });
}

function openImageViewer(url, title = 'Document Preview') {
  const viewer = document.getElementById('imageViewer');
  const image = document.getElementById('imageViewerImage');
  const titleElement = document.getElementById('imageViewerTitle') || document.getElementById('imageViewerCaption');
  const closeBtn = document.getElementById('imageViewerClose');

  if (!viewer || !image) {
    console.error('Image viewer elements not found in DOM');
    return;
  }

  if (!url || url.trim() === '') {
    if (window.showToast) showToast('warning', 'Notice', 'Document image is not available.');
    return;
  }

  image.src = url;
  image.alt = title;

  if (titleElement) {
    titleElement.textContent = title;
  }

  viewer.style.display = 'flex';
  viewer.classList.add('active');
  viewer.setAttribute('aria-hidden', 'false');

  document.body.style.overflow = 'hidden';

  setZoomScale(1);

  if (closeBtn) closeBtn.focus();
}

function closeImageViewer() {
  const viewer = document.getElementById('imageViewer');
  const image = document.getElementById('imageViewerImage');
  const titleElement = document.getElementById('imageViewerTitle') || document.getElementById('imageViewerCaption');

  if (!viewer) return;

  viewer.classList.remove('active');
  viewer.style.display = 'none';
  viewer.setAttribute('aria-hidden', 'true');

  if (image) {
    image.src = '';
    image.alt = '';
    image.style.transform = 'none';
  }

  if (titleElement) {
    titleElement.textContent = '';
  }

  document.body.style.overflow = '';
  setZoomScale(1);
}

function setZoomScale(scale) {
  currentViewerZoom = Math.max(0.5, Math.min(4, scale)); // Clamp zoom between 0.5x and 4x
  const image = document.getElementById('imageViewerImage');
  const zoomLevel = document.getElementById('imageViewerZoomLevel') || document.getElementById('imageViewerReset');

  if (image) {
    image.style.transform = `scale(${currentViewerZoom})`;
  }
  if (zoomLevel) {
    zoomLevel.textContent = `${Math.round(currentViewerZoom * 100)}%`;
  }
}

// Expose viewer functions globally
window.openImageViewer = openImageViewer;
window.closeImageViewer = closeImageViewer;


