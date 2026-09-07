/**
 * E-CHUNAB - Admin Position & Candidate Management (js/admin/candidates.js)
 * Module: Manage contestable positions, candidate profiles, file uploads to Supabase Storage, and media viewer
 */

let allElections = [];
let activeElection = null;
let currentPositions = [];
let currentCandidates = [];

// Nomination file state
let selectedSymbolFile = null;
let symbolPreviewUrl = null;
let selectedPhotoFile = null;
let photoPreviewUrl = null;

// Edit candidate file state
let currentEditCandidate = null;
let editSelectedSymbolFile = null;
let editSymbolPreviewUrl = null;
let editSelectedPhotoFile = null;
let editPhotoPreviewUrl = null;

// Lightbox Viewer Zoom state
let currentViewerZoom = 1;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Admin Candidates] Initializing candidate management...');

  let authData = null;
  if (window.protectPage) {
    authData = await window.protectPage('admin');
    if (!authData) return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  // Setup UI handlers and image viewer
  setupUIHandlers(client);
  setupMediaInputHandlers();
  setupImageViewer();

  // Load elections dropdown
  await loadElectionsDropdown(client);
});

function setupUIHandlers(client) {
  const electionSelect = document.getElementById('select-election');
  if (electionSelect) {
    electionSelect.addEventListener('change', (e) => {
      onElectionChange(client, e.target.value);
    });
  }

  const addCandidateBtn = document.getElementById('btn-add-candidate');
  if (addCandidateBtn) {
    addCandidateBtn.addEventListener('click', () => {
      if (!activeElection) {
        if (window.showToast) showToast('warning', 'Selection Required', 'Please select an election first.');
        return;
      }
      if (currentPositions.length === 0) {
        if (window.showToast) showToast('warning', 'Position Required', 'Please add at least one position to this election before nominating candidates.');
        return;
      }
      resetNominationMediaState();
      const form = document.getElementById('candidate-form');
      if (form) form.reset();
      if (window.openModal) window.openModal('candidate-modal');
    });
  }

  const addPositionBtn = document.getElementById('btn-add-position');
  if (addPositionBtn) {
    addPositionBtn.addEventListener('click', () => {
      if (!activeElection) {
        if (window.showToast) showToast('warning', 'Selection Required', 'Please select an election first.');
        return;
      }
      const form = document.getElementById('position-form');
      if (form) form.reset();
      if (window.openModal) window.openModal('position-modal');
    });
  }

  const savePositionBtn = document.getElementById('btn-save-position');
  if (savePositionBtn) {
    savePositionBtn.addEventListener('click', () => handleCreatePosition(client));
  }

  const saveCandidateBtn = document.getElementById('btn-save-candidate');
  if (saveCandidateBtn) {
    saveCandidateBtn.addEventListener('click', () => handleCreateCandidate(client));
  }

  const updateCandidateBtn = document.getElementById('btn-update-candidate');
  if (updateCandidateBtn) {
    updateCandidateBtn.addEventListener('click', () => handleUpdateCandidate(client));
  }
}

/**
 * Setup File Input Listeners & Previews (Requirements 1, 2, 4, 5, 6)
 */
function setupMediaInputHandlers() {
  // 1. Electoral Symbol Input (Nomination)
  const symbolInput = document.getElementById('candidateSymbol');
  if (symbolInput) {
    symbolInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!validateImageFile(file)) {
        symbolInput.value = '';
        return;
      }

      if (symbolPreviewUrl) URL.revokeObjectURL(symbolPreviewUrl);
      selectedSymbolFile = file;
      symbolPreviewUrl = URL.createObjectURL(file);

      const previewImg = document.getElementById('symbol-preview-img');
      const fileNameEl = document.getElementById('symbol-file-name');
      const fileSizeEl = document.getElementById('symbol-file-size');
      const container = document.getElementById('symbol-preview-container');

      if (previewImg) previewImg.src = symbolPreviewUrl;
      if (fileNameEl) fileNameEl.textContent = file.name;
      if (fileSizeEl) fileSizeEl.textContent = formatFileSize(file.size);
      if (container) container.style.display = 'flex';
    });
  }

  // 2. Candidate Photo Input (Nomination)
  const photoInput = document.getElementById('candidatePhoto');
  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!validateImageFile(file)) {
        photoInput.value = '';
        return;
      }

      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      selectedPhotoFile = file;
      photoPreviewUrl = URL.createObjectURL(file);

      const previewImg = document.getElementById('photo-preview-img');
      const fileNameEl = document.getElementById('photo-file-name');
      const fileSizeEl = document.getElementById('photo-file-size');
      const container = document.getElementById('photo-preview-container');

      if (previewImg) previewImg.src = photoPreviewUrl;
      if (fileNameEl) fileNameEl.textContent = file.name;
      if (fileSizeEl) fileSizeEl.textContent = formatFileSize(file.size);
      if (container) container.style.display = 'flex';
    });
  }

  // 3. Edit Candidate Symbol Input
  const editSymbolInput = document.getElementById('editCandidateSymbol');
  if (editSymbolInput) {
    editSymbolInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!validateImageFile(file)) {
        editSymbolInput.value = '';
        return;
      }

      if (editSymbolPreviewUrl) URL.revokeObjectURL(editSymbolPreviewUrl);
      editSelectedSymbolFile = file;
      editSymbolPreviewUrl = URL.createObjectURL(file);

      const previewImg = document.getElementById('edit-symbol-preview-img');
      const fileNameEl = document.getElementById('edit-symbol-file-name');
      const fileSizeEl = document.getElementById('edit-symbol-file-size');
      const container = document.getElementById('edit-symbol-preview-container');

      if (previewImg) previewImg.src = editSymbolPreviewUrl;
      if (fileNameEl) fileNameEl.textContent = file.name;
      if (fileSizeEl) fileSizeEl.textContent = formatFileSize(file.size);
      if (container) container.style.display = 'flex';
    });
  }

  const cancelEditSymbolBtn = document.getElementById('btn-cancel-edit-symbol');
  if (cancelEditSymbolBtn) {
    cancelEditSymbolBtn.addEventListener('click', () => {
      if (editSymbolPreviewUrl) URL.revokeObjectURL(editSymbolPreviewUrl);
      editSelectedSymbolFile = null;
      editSymbolPreviewUrl = null;
      const input = document.getElementById('editCandidateSymbol');
      if (input) input.value = '';
      const container = document.getElementById('edit-symbol-preview-container');
      if (container) container.style.display = 'none';
    });
  }

  // 4. Edit Candidate Photo Input
  const editPhotoInput = document.getElementById('editCandidatePhoto');
  if (editPhotoInput) {
    editPhotoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!validateImageFile(file)) {
        editPhotoInput.value = '';
        return;
      }

      if (editPhotoPreviewUrl) URL.revokeObjectURL(editPhotoPreviewUrl);
      editSelectedPhotoFile = file;
      editPhotoPreviewUrl = URL.createObjectURL(file);

      const previewImg = document.getElementById('edit-photo-preview-img');
      const fileNameEl = document.getElementById('edit-photo-file-name');
      const fileSizeEl = document.getElementById('edit-photo-file-size');
      const container = document.getElementById('edit-photo-preview-container');

      if (previewImg) previewImg.src = editPhotoPreviewUrl;
      if (fileNameEl) fileNameEl.textContent = file.name;
      if (fileSizeEl) fileSizeEl.textContent = formatFileSize(file.size);
      if (container) container.style.display = 'flex';
    });
  }

  const cancelEditPhotoBtn = document.getElementById('btn-cancel-edit-photo');
  if (cancelEditPhotoBtn) {
    cancelEditPhotoBtn.addEventListener('click', () => {
      if (editPhotoPreviewUrl) URL.revokeObjectURL(editPhotoPreviewUrl);
      editSelectedPhotoFile = null;
      editPhotoPreviewUrl = null;
      const input = document.getElementById('editCandidatePhoto');
      if (input) input.value = '';
      const container = document.getElementById('edit-photo-preview-container');
      if (container) container.style.display = 'none';
    });
  }
}

/**
 * File Validation (Requirement 4 & 5)
 */
function validateImageFile(file) {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5 MB

  if (!allowedTypes.includes(file.type)) {
    if (window.showToast) {
      showToast('error', 'Invalid File Type', 'Invalid image format. Allowed formats: PNG, JPG, WebP.');
    }
    return false;
  }

  if (file.size > maxSize) {
    if (window.showToast) {
      showToast('error', 'File Size Exceeded', 'Image must be smaller than 5 MB.');
    }
    return false;
  }

  return true;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getFileExtension(file) {
  if (!file || !file.name) return 'png';
  const parts = file.name.split('.');
  if (parts.length > 1) {
    const ext = parts.pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  }
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  return 'png';
}

function resetNominationMediaState() {
  if (symbolPreviewUrl) {
    URL.revokeObjectURL(symbolPreviewUrl);
    symbolPreviewUrl = null;
  }
  selectedSymbolFile = null;

  if (photoPreviewUrl) {
    URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = null;
  }
  selectedPhotoFile = null;

  const symbolInput = document.getElementById('candidateSymbol');
  if (symbolInput) symbolInput.value = '';
  const symbolContainer = document.getElementById('symbol-preview-container');
  if (symbolContainer) symbolContainer.style.display = 'none';

  const photoInput = document.getElementById('candidatePhoto');
  if (photoInput) photoInput.value = '';
  const photoContainer = document.getElementById('photo-preview-container');
  if (photoContainer) photoContainer.style.display = 'none';
}

function resetEditMediaState() {
  if (editSymbolPreviewUrl) {
    URL.revokeObjectURL(editSymbolPreviewUrl);
    editSymbolPreviewUrl = null;
  }
  editSelectedSymbolFile = null;

  if (editPhotoPreviewUrl) {
    URL.revokeObjectURL(editPhotoPreviewUrl);
    editPhotoPreviewUrl = null;
  }
  editSelectedPhotoFile = null;

  const symbolInput = document.getElementById('editCandidateSymbol');
  if (symbolInput) symbolInput.value = '';
  const symbolContainer = document.getElementById('edit-symbol-preview-container');
  if (symbolContainer) symbolContainer.style.display = 'none';

  const photoInput = document.getElementById('editCandidatePhoto');
  if (photoInput) photoInput.value = '';
  const photoContainer = document.getElementById('edit-photo-preview-container');
  if (photoContainer) photoContainer.style.display = 'none';
}

async function loadElectionsDropdown(client) {
  const select = document.getElementById('select-election');
  const container = document.getElementById('positions-candidates-container');

  try {
    const { data: elections, error } = await client
      .from('elections')
      .select('id, title, description, status, start_date, end_date')
      .order('created_at', { ascending: false });

    if (error) throw error;

    allElections = elections || [];

    if (allElections.length === 0) {
      if (select) {
        select.innerHTML = `<option value="">No elections available</option>`;
        select.disabled = true;
      }
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 40px; color: var(--gray-500);">
            No elections configured yet. Please create an election first in Election Management.
          </div>
        `;
      }
      return;
    }

    if (select) {
      select.disabled = false;
      select.innerHTML = `
        <option value="">-- Select Election --</option>
        ${allElections.map(e => `
          <option value="${e.id}">${window.escapeHTML(e.title)} (${e.status.toUpperCase()})</option>
        `).join('')}
      `;
    }

    const activeElec = allElections.find(e => e.status === 'active') || allElections[0];
    if (activeElec && select) {
      select.value = activeElec.id;
      await onElectionChange(client, activeElec.id);
    } else {
      await onElectionChange(client, '');
    }

  } catch (err) {
    console.error('[Load Elections Dropdown Error]', err);
    if (container) {
      container.innerHTML = `
        <div class="card" style="padding: 24px; color: var(--accent-red-600);">
          Failed to load elections: ${err.message}
        </div>
      `;
    }
  }
}

async function onElectionChange(client, selectedElectionId) {
  const banner = document.getElementById('selected-election-banner');
  const titleEl = document.getElementById('selected-election-title');
  const badgeEl = document.getElementById('selected-election-status-badge');
  const container = document.getElementById('positions-candidates-container');
  const addPosBtn = document.getElementById('btn-add-position');
  const addCandBtn = document.getElementById('btn-add-candidate');
  const posSelect = document.getElementById('cand-pos');
  const editPosSelect = document.getElementById('edit-cand-pos');

  currentPositions = [];
  currentCandidates = [];
  activeElection = null;

  if (!selectedElectionId) {
    if (banner) banner.style.display = 'none';
    if (addPosBtn) addPosBtn.disabled = true;
    if (addCandBtn) addCandBtn.disabled = true;
    if (posSelect) posSelect.innerHTML = `<option value="">-- Select Position --</option>`;
    if (editPosSelect) editPosSelect.innerHTML = `<option value="">-- Select Position --</option>`;
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; color: var(--gray-500);">
          Please select an election from the dropdown above to view or manage positions and candidates.
        </div>
      `;
    }
    return;
  }

  activeElection = allElections.find(e => e.id === selectedElectionId);
  if (!activeElection) return;

  if (banner && titleEl && badgeEl) {
    banner.style.display = 'block';
    titleEl.textContent = activeElection.title;

    let badgeClass = 'badge badge-draft';
    if (activeElection.status === 'active') badgeClass = 'badge badge-active';
    else if (activeElection.status === 'completed') badgeClass = 'badge badge-approved';

    badgeEl.className = badgeClass;
    badgeEl.textContent = activeElection.status.toUpperCase();
  }

  if (addPosBtn) addPosBtn.disabled = false;
  if (addCandBtn) addCandBtn.disabled = false;

  await loadPositionsAndCandidates(client);
}

async function loadPositionsAndCandidates(client) {
  const container = document.getElementById('positions-candidates-container');
  const posSelect = document.getElementById('cand-pos');
  const editPosSelect = document.getElementById('edit-cand-pos');

  if (!activeElection) return;

  try {
    const { data: positions, error: posErr } = await client
      .from('positions')
      .select('*')
      .eq('election_id', activeElection.id)
      .order('display_order', { ascending: true });

    if (posErr) throw posErr;
    currentPositions = positions || [];

    const optionsHtml = currentPositions.length === 0 ?
      `<option value="">-- No positions defined for this election --</option>` :
      `<option value="">-- Select Position --</option>` +
      currentPositions.map(p => `<option value="${p.id}">${window.escapeHTML(p.name)}</option>`).join('');

    if (posSelect) posSelect.innerHTML = optionsHtml;
    if (editPosSelect) editPosSelect.innerHTML = optionsHtml;

    const { data: candidates, error: candErr } = await client
      .from('candidates')
      .select('*')
      .eq('election_id', activeElection.id)
      .order('display_order', { ascending: true });

    if (candErr) throw candErr;
    currentCandidates = candidates || [];

    const candByPos = {};
    currentCandidates.forEach(c => {
      if (!candByPos[c.position_id]) candByPos[c.position_id] = [];
      candByPos[c.position_id].push(c);
    });

    if (currentPositions.length === 0) {
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 40px; color: var(--gray-500);">
            No contestable positions defined yet for <strong>"${window.escapeHTML(activeElection.title)}"</strong>.<br>
            Click <strong>"+ New Position"</strong> above to add positions.
          </div>
        `;
      }
      return;
    }

    if (container) {
      container.innerHTML = currentPositions.map(pos => {
        const cands = candByPos[pos.id] || [];

        return `
          <div style="margin-bottom: 36px;">
            <div class="flex-between" style="margin-bottom: 16px;">
              <div>
                <h3 style="margin-bottom: 4px;">Contested Position: ${window.escapeHTML(pos.name)}</h3>
                <p style="font-size: 0.85rem; color: var(--gray-500); margin: 0;">${window.escapeHTML(pos.description || 'No position description.')}</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <span class="badge badge-draft">Display Order #${pos.display_order}</span>
              </div>
            </div>

            <div class="admin-candidate-grid">
              ${cands.length === 0 ? `
                <div style="grid-column: 1 / -1; padding: 24px; background: var(--gray-50); border-radius: var(--radius-md); text-align: center; color: var(--gray-500);">
                  No candidates nominated for "${window.escapeHTML(pos.name)}" yet.
                </div>
              ` : cands.map(cand => {
                const photoUrl = window.getCandidateMediaUrl ? window.getCandidateMediaUrl(cand.photo) : cand.photo;
                const displayPhotoUrl = photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80';
                const symbolMediaUrl = window.getCandidateMediaUrl ? window.getCandidateMediaUrl(cand.symbol) : cand.symbol;

                const isSymbolImage = (cand.symbol.includes('/') || cand.symbol.includes('.') || cand.symbol.startsWith('http')) &&
                                      !cand.symbol.includes('🕊️') && !cand.symbol.includes('☀️') && !cand.symbol.includes('🌲') &&
                                      !cand.symbol.includes('⚖️') && !cand.symbol.includes('📖') && !cand.symbol.includes('🔔');

                return `
                  <div class="admin-candidate-card">
                    <div class="admin-candidate-header">
                      <img src="${window.escapeHTML(displayPhotoUrl)}" 
                           alt="${window.escapeHTML(cand.name)}" 
                           class="admin-candidate-avatar clickable-preview" 
                           data-title="${window.escapeHTML(cand.name)} - Candidate Photo" 
                           data-full-url="${window.escapeHTML(displayPhotoUrl)}">
                      <div style="flex-grow:1;">
                        <h4 style="font-size: 1rem; margin-bottom: 2px;">${window.escapeHTML(cand.name)}</h4>
                        <div style="font-size: 0.8rem; color: var(--primary-600); font-weight: 600;">${window.escapeHTML(cand.party)}</div>
                      </div>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                      <strong>Symbol:</strong>
                      ${isSymbolImage ? `
                        <img src="${window.escapeHTML(symbolMediaUrl)}" 
                             alt="Electoral Symbol" 
                             class="candidate-symbol-preview clickable-preview" 
                             data-title="${window.escapeHTML(cand.name)} - Electoral Symbol" 
                             data-full-url="${window.escapeHTML(symbolMediaUrl)}">
                      ` : `
                        <span>${window.escapeHTML(cand.symbol)}</span>
                      `}
                    </div>
                    <p style="font-size: 0.825rem; color: var(--gray-600); flex-grow: 1; margin-bottom: 16px;">
                      ${window.escapeHTML(cand.bio || 'No biography provided.')}
                    </p>
                    <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--gray-200); padding-top: 12px; font-size: 0.8rem; color: var(--gray-500);">
                      <span>Order #${cand.display_order}</span>
                      <div style="display: flex; gap: 6px;">
                        <button type="button" class="btn btn-outline btn-sm" onclick="openEditCandidateModal('${cand.id}')" style="padding: 3px 8px; font-size: 0.75rem;">Edit</button>
                        <button type="button" class="btn btn-danger btn-sm" onclick="handleDeleteCandidate('${cand.id}')" style="padding: 3px 8px; font-size: 0.75rem;">Delete</button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('[Load Positions & Candidates Error]', err);
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; color: var(--accent-red-600);">
          Failed to load positions & candidates: ${err.message}
        </div>
      `;
    }
  }
}

async function handleCreatePosition(client) {
  if (!activeElection) {
    if (window.showToast) showToast('error', 'Selection Required', 'Please select an election first.');
    return;
  }

  const saveBtn = document.getElementById('btn-save-position');
  const nameInput = document.getElementById('pos-name');
  const descInput = document.getElementById('pos-desc');

  const name = nameInput ? nameInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';

  if (!name) {
    if (window.showToast) showToast('warning', 'Validation', 'Position name is required.');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Creating Position...';
  }

  try {
    const nextOrder = currentPositions.length + 1;

    const { data, error } = await client
      .from('positions')
      .insert({
        election_id: activeElection.id,
        name: name,
        description: description || null,
        display_order: nextOrder
      })
      .select()
      .single();

    if (error) throw error;

    if (window.showToast) {
      showToast('success', 'Position Created', `Position "${name}" added.`);
    }

    const posForm = document.getElementById('position-form');
    if (posForm) posForm.reset();
    if (window.closeModal) window.closeModal('position-modal');

    await loadPositionsAndCandidates(client);

  } catch (err) {
    console.error('[Create Position Error]', err);
    if (window.showToast) showToast('error', 'Creation Failed', err.message || 'Failed to create position.');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Create Position';
    }
  }
}

/**
 * Handle Candidate Nomination with Storage Upload & Rollback Cleanup (Requirements 3, 8, 9)
 */
async function handleCreateCandidate(client) {
  if (!activeElection) {
    if (window.showToast) showToast('error', 'Selection Required', 'Please select an election first.');
    return;
  }

  const saveBtn = document.getElementById('btn-save-candidate');
  const posSelect = document.getElementById('cand-pos');
  const nameInput = document.getElementById('cand-name');
  const partyInput = document.getElementById('cand-party');
  const bioInput = document.getElementById('cand-bio');

  const positionId = posSelect ? posSelect.value : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const party = partyInput ? partyInput.value.trim() : '';
  const bio = bioInput ? bioInput.value.trim() : '';

  if (!positionId) {
    if (window.showToast) showToast('warning', 'Validation', 'Please select a target position.');
    return;
  }

  if (!name || !party) {
    if (window.showToast) showToast('warning', 'Validation', 'Candidate name and party affiliation are required.');
    return;
  }

  // Requirement 1 & 2: Electoral Symbol file and Candidate Photo file are mandatory
  if (!selectedSymbolFile) {
    if (window.showToast) showToast('warning', 'Validation', 'Please select an Electoral Symbol image file.');
    return;
  }

  if (!selectedPhotoFile) {
    if (window.showToast) showToast('warning', 'Validation', 'Please select a Candidate Photo image file.');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Uploading media...';
  }

  // Step 2 (Requirement 3): Generate Candidate UUID client-side before upload
  const candidateId = crypto.randomUUID();
  const symbolExt = getFileExtension(selectedSymbolFile);
  const photoExt = getFileExtension(selectedPhotoFile);

  const symbolPath = `${activeElection.id}/${candidateId}/symbol.${symbolExt}`;
  const photoPath = `${activeElection.id}/${candidateId}/photo.${photoExt}`;

  let uploadedSymbol = false;
  let uploadedPhoto = false;

  try {
    // Step 3 (Requirement 8): Upload Electoral Symbol file
    console.log(`[Storage Upload] Uploading symbol to candidate-media/${symbolPath}...`);
    const { error: symErr } = await client.storage
      .from('candidate-media')
      .upload(symbolPath, selectedSymbolFile, { upsert: true });

    if (symErr) {
      console.error('[Storage Error] Symbol upload failed:', symErr);
      throw new Error(`Symbol upload failed: ${symErr.message}`);
    }
    uploadedSymbol = true;

    // Step 4 (Requirement 8): Upload Candidate Photo file
    console.log(`[Storage Upload] Uploading photo to candidate-media/${photoPath}...`);
    const { error: photoErr } = await client.storage
      .from('candidate-media')
      .upload(photoPath, selectedPhotoFile, { upsert: true });

    if (photoErr) {
      console.error('[Storage Error] Photo upload failed:', photoErr);
      // Requirement 9: Cleanup uploaded symbol file if photo upload fails
      if (uploadedSymbol) {
        console.warn(`[Cleanup] Rolling back symbol file: ${symbolPath}`);
        await client.storage.from('candidate-media').remove([symbolPath]);
      }
      throw new Error('Candidate nomination failed. Please try again.');
    }
    uploadedPhoto = true;

    // Step 5 (Requirement 8): Insert candidate record into Database
    const candsInPos = currentCandidates.filter(c => c.position_id === positionId);
    const nextOrder = candsInPos.length + 1;

    console.log('[DB Insert] Inserting candidate row into public.candidates...');
    const { data: newCand, error: dbErr } = await client
      .from('candidates')
      .insert({
        id: candidateId,
        election_id: activeElection.id,
        position_id: positionId,
        name: name,
        party: party,
        symbol: symbolPath,
        photo: photoPath,
        bio: bio || null,
        display_order: nextOrder
      })
      .select()
      .single();

    if (dbErr) {
      console.error('[DB Error] Candidate insert failed:', dbErr);
      // Requirement 9: Cleanup uploaded files if DB insert fails
      if (uploadedSymbol || uploadedPhoto) {
        const cleanupFiles = [];
        if (uploadedSymbol) cleanupFiles.push(symbolPath);
        if (uploadedPhoto) cleanupFiles.push(photoPath);
        console.warn('[Cleanup] Rolling back uploaded media files:', cleanupFiles);
        await client.storage.from('candidate-media').remove(cleanupFiles);
      }
      throw new Error('Candidate nomination failed. Please try again.');
    }

    if (window.showToast) {
      showToast('success', 'Candidate Nominated', `Candidate "${name}" nominated successfully.`);
    }

    resetNominationMediaState();
    const candForm = document.getElementById('candidate-form');
    if (candForm) candForm.reset();
    if (window.closeModal) window.closeModal('candidate-modal');

    await loadPositionsAndCandidates(client);

  } catch (err) {
    console.error('[Candidate Nomination Error]', err);
    if (window.showToast) {
      showToast('error', 'Nomination Failed', err.message || 'Candidate nomination failed. Please try again.');
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Nominate Candidate';
    }
  }
}

/**
 * Open Candidate Edit Modal (Requirement 10)
 */
function openEditCandidateModal(candidateId) {
  const cand = currentCandidates.find(c => c.id === candidateId);
  if (!cand) return;

  currentEditCandidate = cand;
  resetEditMediaState();

  const idInput = document.getElementById('edit-cand-id');
  const nameInput = document.getElementById('edit-cand-name');
  const partyInput = document.getElementById('edit-cand-party');
  const posSelect = document.getElementById('edit-cand-pos');
  const bioInput = document.getElementById('edit-cand-bio');

  if (idInput) idInput.value = cand.id;
  if (nameInput) nameInput.value = cand.name;
  if (partyInput) partyInput.value = cand.party;
  if (posSelect) posSelect.value = cand.position_id;
  if (bioInput) bioInput.value = cand.bio || '';

  // Render current symbol preview
  const symbolPreviewBox = document.getElementById('edit-symbol-current-preview');
  if (symbolPreviewBox) {
    const symbolMediaUrl = window.getCandidateMediaUrl ? window.getCandidateMediaUrl(cand.symbol) : cand.symbol;
    const isSymbolImage = (cand.symbol.includes('/') || cand.symbol.includes('.') || cand.symbol.startsWith('http')) &&
                          !cand.symbol.includes('🕊️') && !cand.symbol.includes('☀️') && !cand.symbol.includes('🌲') &&
                          !cand.symbol.includes('⚖️') && !cand.symbol.includes('📖') && !cand.symbol.includes('🔔');
    if (isSymbolImage) {
      symbolPreviewBox.innerHTML = `<img src="${window.escapeHTML(symbolMediaUrl)}" class="candidate-symbol-preview" alt="Current Symbol">`;
    } else {
      symbolPreviewBox.innerHTML = `<span>${window.escapeHTML(cand.symbol)}</span>`;
    }
  }

  // Render current photo preview
  const photoPreviewBox = document.getElementById('edit-photo-current-preview');
  if (photoPreviewBox) {
    const photoUrl = window.getCandidateMediaUrl ? window.getCandidateMediaUrl(cand.photo) : cand.photo;
    const displayPhotoUrl = photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80';
    photoPreviewBox.innerHTML = `<img src="${window.escapeHTML(displayPhotoUrl)}" class="admin-candidate-avatar" alt="Current Photo">`;
  }

  if (window.openModal) window.openModal('edit-candidate-modal');
}

/**
 * Handle Edit Candidate Submission with Optional Media Replacement (Requirement 10)
 */
async function handleUpdateCandidate(client) {
  if (!currentEditCandidate) return;

  const updateBtn = document.getElementById('btn-update-candidate');
  const nameInput = document.getElementById('edit-cand-name');
  const partyInput = document.getElementById('edit-cand-party');
  const posSelect = document.getElementById('edit-cand-pos');
  const bioInput = document.getElementById('edit-cand-bio');

  const name = nameInput ? nameInput.value.trim() : '';
  const party = partyInput ? partyInput.value.trim() : '';
  const positionId = posSelect ? posSelect.value : '';
  const bio = bioInput ? bioInput.value.trim() : '';

  if (!name || !party || !positionId) {
    if (window.showToast) showToast('warning', 'Validation', 'Name, party, and position are required.');
    return;
  }

  if (updateBtn) {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Updating Candidate...';
  }

  let newSymbolPath = currentEditCandidate.symbol;
  let newPhotoPath = currentEditCandidate.photo;
  let uploadedNewSymbol = false;
  let uploadedNewPhoto = false;

  const oldSymbolPath = currentEditCandidate.symbol;
  const oldPhotoPath = currentEditCandidate.photo;

  try {
    // 1. Upload Replacement Symbol if selected
    if (editSelectedSymbolFile) {
      const symExt = getFileExtension(editSelectedSymbolFile);
      newSymbolPath = `${currentEditCandidate.election_id}/${currentEditCandidate.id}/symbol_${Date.now()}.${symExt}`;

      console.log(`[Storage Replace] Uploading replacement symbol to ${newSymbolPath}...`);
      const { error: symErr } = await client.storage
        .from('candidate-media')
        .upload(newSymbolPath, editSelectedSymbolFile, { upsert: true });

      if (symErr) throw new Error(`Failed to upload replacement symbol: ${symErr.message}`);
      uploadedNewSymbol = true;
    }

    // 2. Upload Replacement Photo if selected
    if (editSelectedPhotoFile) {
      const photoExt = getFileExtension(editSelectedPhotoFile);
      newPhotoPath = `${currentEditCandidate.election_id}/${currentEditCandidate.id}/photo_${Date.now()}.${photoExt}`;

      console.log(`[Storage Replace] Uploading replacement photo to ${newPhotoPath}...`);
      const { error: photoErr } = await client.storage
        .from('candidate-media')
        .upload(newPhotoPath, editSelectedPhotoFile, { upsert: true });

      if (photoErr) {
        if (uploadedNewSymbol) {
          await client.storage.from('candidate-media').remove([newSymbolPath]);
        }
        throw new Error(`Failed to upload replacement photo: ${photoErr.message}`);
      }
      uploadedNewPhoto = true;
    }

    // 3. Update Database Record
    const { error: updateErr } = await client
      .from('candidates')
      .update({
        name: name,
        party: party,
        position_id: positionId,
        symbol: newSymbolPath,
        photo: newPhotoPath,
        bio: bio || null
      })
      .eq('id', currentEditCandidate.id);

    if (updateErr) {
      // Rollback uploaded new files if DB update fails
      const rollbackFiles = [];
      if (uploadedNewSymbol) rollbackFiles.push(newSymbolPath);
      if (uploadedNewPhoto) rollbackFiles.push(newPhotoPath);
      if (rollbackFiles.length > 0) {
        await client.storage.from('candidate-media').remove(rollbackFiles);
      }
      throw updateErr;
    }

    // 4. Delete Old Files only after successful Database update (Requirement 10)
    const oldFilesToDelete = [];
    if (uploadedNewSymbol && oldSymbolPath && oldSymbolPath.includes('/') && oldSymbolPath !== newSymbolPath) {
      oldFilesToDelete.push(oldSymbolPath);
    }
    if (uploadedNewPhoto && oldPhotoPath && oldPhotoPath.includes('/') && oldPhotoPath !== newPhotoPath) {
      oldFilesToDelete.push(oldPhotoPath);
    }

    if (oldFilesToDelete.length > 0) {
      console.log('[Cleanup] Deleting replaced old files from storage:', oldFilesToDelete);
      await client.storage.from('candidate-media').remove(oldFilesToDelete);
    }

    if (window.showToast) {
      showToast('success', 'Candidate Updated', `Candidate profile for "${name}" updated successfully.`);
    }

    resetEditMediaState();
    if (window.closeModal) window.closeModal('edit-candidate-modal');
    await loadPositionsAndCandidates(client);

  } catch (err) {
    console.error('[Update Candidate Error]', err);
    if (window.showToast) {
      showToast('error', 'Update Failed', err.message || 'Failed to update candidate.');
    }
  } finally {
    if (updateBtn) {
      updateBtn.disabled = false;
      updateBtn.textContent = 'Update Candidate';
    }
  }
}

/**
 * Handle Candidate Deletion with Media File Cleanup (Requirement 10 & 24)
 */
async function handleDeleteCandidate(candidateId) {
  const cand = currentCandidates.find(c => c.id === candidateId);
  if (!cand) return;

  if (!confirm(`Are you sure you want to delete candidate "${cand.name}"? This action cannot be undone.`)) {
    return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  try {
    const { error: delErr } = await client
      .from('candidates')
      .delete()
      .eq('id', candidateId);

    if (delErr) throw delErr;

    // Cleanup associated media files from storage if they are storage paths
    const filesToDelete = [];
    if (cand.symbol && cand.symbol.includes('/')) filesToDelete.push(cand.symbol);
    if (cand.photo && cand.photo.includes('/')) filesToDelete.push(cand.photo);

    if (filesToDelete.length > 0) {
      console.log('[Cleanup] Deleting candidate media files after deletion:', filesToDelete);
      await client.storage.from('candidate-media').remove(filesToDelete);
    }

    if (window.showToast) {
      showToast('success', 'Candidate Deleted', `Candidate "${cand.name}" was removed.`);
    }

    await loadPositionsAndCandidates(client);

  } catch (err) {
    console.error('[Delete Candidate Error]', err);
    if (window.showToast) showToast('error', 'Delete Failed', err.message || 'Failed to delete candidate.');
  }
}

/**
 * Fullscreen Image Viewer / Lightbox Initialization (Requirement 12)
 */
function setupImageViewer() {
  const viewer = document.getElementById('imageViewer');
  const closeBtn = document.getElementById('imageViewerClose');
  const backdrop = document.getElementById('imageViewerBackdrop');
  const imageElement = document.getElementById('imageViewerImage');
  const zoomInBtn = document.getElementById('imageViewerZoomIn');
  const zoomOutBtn = document.getElementById('imageViewerZoomOut');
  const zoomLevel = document.getElementById('imageViewerZoomLevel');
  const container = document.getElementById('imageViewerStage');

  if (!viewer) return;

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeImageViewer();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      closeImageViewer();
    });
  }

  if (imageElement) {
    imageElement.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeViewer = document.getElementById('imageViewer');
      if (activeViewer && activeViewer.classList.contains('active')) {
        closeImageViewer();
      }
    }
  });

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

  if (container) {
    container.addEventListener('wheel', (e) => {
      if (!viewer.classList.contains('active')) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setZoomScale(currentViewerZoom + delta);
    }, { passive: false });
  }

  // Event Delegation for .clickable-preview elements
  document.addEventListener('click', (event) => {
    const image = event.target.closest('.clickable-preview');
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
      'Candidate Media Preview';

    if (!imageUrl || imageUrl.trim() === '' || imageUrl.startsWith('data:') || image.style.display === 'none') {
      return;
    }

    openImageViewer(imageUrl, imageTitle);
  });
}

function openImageViewer(url, title = 'Candidate Media Preview') {
  const viewer = document.getElementById('imageViewer');
  const image = document.getElementById('imageViewerImage');
  const titleElement = document.getElementById('imageViewerTitle');
  const closeBtn = document.getElementById('imageViewerClose');

  if (!viewer || !image) return;
  if (!url || url.trim() === '') return;

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
  const titleElement = document.getElementById('imageViewerTitle');

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
  currentViewerZoom = Math.max(0.5, Math.min(4, scale));
  const image = document.getElementById('imageViewerImage');
  const zoomLevel = document.getElementById('imageViewerZoomLevel');

  if (image) {
    image.style.transform = `scale(${currentViewerZoom})`;
  }
  if (zoomLevel) {
    zoomLevel.textContent = `${Math.round(currentViewerZoom * 100)}%`;
  }
}

// Global functions for onclick bindings
window.loadElectionsDropdown = loadElectionsDropdown;
window.onElectionChange = onElectionChange;
window.openEditCandidateModal = openEditCandidateModal;
window.handleDeleteCandidate = handleDeleteCandidate;
window.openImageViewer = openImageViewer;
window.closeImageViewer = closeImageViewer;

