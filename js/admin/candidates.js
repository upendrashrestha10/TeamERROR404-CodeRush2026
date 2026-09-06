/**
 * E-CHUNAB - Admin Position & Candidate Management (js/admin/candidates.js)
 * Module: Manage contestable positions and candidate profiles linked dynamically to selected election
 */

let allElections = [];
let activeElection = null;
let currentPositions = [];
let currentCandidates = [];

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Admin Candidates] Initializing...');

  let authData = null;
  if (window.protectPage) {
    authData = await window.protectPage('admin');
    if (!authData) return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  // Setup modal hooks and election selector listener
  setupUIHandlers(client);

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

    // Auto-select active election if available, or the first election
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

  // Reset local election data state
  currentPositions = [];
  currentCandidates = [];
  activeElection = null;

  if (!selectedElectionId) {
    if (banner) banner.style.display = 'none';
    if (addPosBtn) addPosBtn.disabled = true;
    if (addCandBtn) addCandBtn.disabled = true;
    if (posSelect) posSelect.innerHTML = `<option value="">-- Select Position --</option>`;
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
  if (!activeElection) {
    console.error('[Admin Candidates] Selected election UUID not found in state.');
    return;
  }

  // Update UI Banner
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

  // Load positions & candidates specifically belonging to selected election
  await loadPositionsAndCandidates(client);
}

async function loadPositionsAndCandidates(client) {
  const container = document.getElementById('positions-candidates-container');
  const posSelect = document.getElementById('cand-pos');

  if (!activeElection) return;

  try {
    // 1. Query positions belonging to the selected election
    const { data: positions, error: posErr } = await client
      .from('positions')
      .select('*')
      .eq('election_id', activeElection.id)
      .order('display_order', { ascending: true });

    if (posErr) throw posErr;
    currentPositions = positions || [];

    // Populate candidate modal position select dropdown (ONLY positions for THIS election)
    if (posSelect) {
      if (currentPositions.length === 0) {
        posSelect.innerHTML = `<option value="">-- No positions defined for this election --</option>`;
      } else {
        posSelect.innerHTML = `
          <option value="">-- Select Position --</option>
          ${currentPositions.map(p => `
            <option value="${p.id}">${window.escapeHTML(p.name)}</option>
          `).join('')}
        `;
      }
    }

    // 2. Query candidates belonging to the selected election
    const { data: candidates, error: candErr } = await client
      .from('candidates')
      .select('*')
      .eq('election_id', activeElection.id)
      .order('display_order', { ascending: true });

    if (candErr) throw candErr;
    currentCandidates = candidates || [];

    // Group candidates by position_id
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

    // Render positions & candidates grid
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
                const photoUrl = cand.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80';

                return `
                  <div class="admin-candidate-card">
                    <div class="admin-candidate-header">
                      <img src="${window.escapeHTML(photoUrl)}" alt="${window.escapeHTML(cand.name)}" class="admin-candidate-avatar">
                      <div>
                        <h4 style="font-size: 1rem; margin-bottom: 2px;">${window.escapeHTML(cand.name)}</h4>
                        <div style="font-size: 0.8rem; color: var(--primary-600); font-weight: 600;">${window.escapeHTML(cand.party)}</div>
                      </div>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 12px;">
                      <strong>Symbol:</strong> ${window.escapeHTML(cand.symbol)}
                    </div>
                    <p style="font-size: 0.825rem; color: var(--gray-600); flex-grow: 1; margin-bottom: 16px;">
                      ${window.escapeHTML(cand.bio || 'No biography provided.')}
                    </p>
                    <div style="display: flex; gap: 8px; border-top: 1px solid var(--gray-200); padding-top: 12px; font-size: 0.8rem; color: var(--gray-500);">
                      <span>Ballot Order #${cand.display_order}</span>
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
      showToast('success', 'Position Created', `Position "${name}" added to "${activeElection.title}".`);
    }

    // Reset form & close modal
    const posForm = document.getElementById('position-form');
    if (posForm) posForm.reset();
    if (window.closeModal) window.closeModal('position-modal');

    // Refresh position list for current election
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

async function handleCreateCandidate(client) {
  if (!activeElection) {
    if (window.showToast) showToast('error', 'Selection Required', 'Please select an election first.');
    return;
  }

  const saveBtn = document.getElementById('btn-save-candidate');
  const posSelect = document.getElementById('cand-pos');
  const nameInput = document.getElementById('cand-name');
  const partyInput = document.getElementById('cand-party');
  const symbolInput = document.getElementById('cand-symbol');
  const photoInput = document.getElementById('cand-photo');
  const bioInput = document.getElementById('cand-bio');

  const positionId = posSelect ? posSelect.value : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const party = partyInput ? partyInput.value.trim() : '';
  const symbol = symbolInput ? symbolInput.value.trim() : '';
  const photo = photoInput ? photoInput.value.trim() : '';
  const bio = bioInput ? bioInput.value.trim() : '';

  if (!positionId) {
    if (window.showToast) showToast('warning', 'Validation', 'Please select a valid position for this election.');
    return;
  }

  // Double-check position belongs to currently active election
  const targetPos = currentPositions.find(p => p.id === positionId);
  if (!targetPos) {
    if (window.showToast) showToast('error', 'Validation Error', 'Selected position does not belong to the active election.');
    return;
  }

  if (!name || !party || !symbol) {
    if (window.showToast) showToast('warning', 'Validation', 'Please fill in candidate name, party affiliation, and symbol.');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving Candidate...';
  }

  try {
    const candsInPos = currentCandidates.filter(c => c.position_id === positionId);
    const nextOrder = candsInPos.length + 1;

    const { data, error } = await client
      .from('candidates')
      .insert({
        election_id: activeElection.id,
        position_id: positionId,
        name: name,
        party: party,
        symbol: symbol,
        photo: photo || null,
        bio: bio || null,
        display_order: nextOrder
      })
      .select()
      .single();

    if (error) throw error;

    if (window.showToast) {
      showToast('success', 'Candidate Nominated', `Candidate "${name}" successfully nominated for "${targetPos.name}".`);
    }

    // Reset form & close modal
    const candForm = document.getElementById('candidate-form');
    if (candForm) candForm.reset();
    if (window.closeModal) window.closeModal('candidate-modal');

    // Refresh candidate list for current election
    await loadPositionsAndCandidates(client);

  } catch (err) {
    console.error('[Create Candidate Error]', err);
    if (window.showToast) showToast('error', 'Nomination Failed', err.message || 'Failed to nominate candidate.');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Candidate';
    }
  }
}

window.loadElectionsDropdown = loadElectionsDropdown;
window.onElectionChange = onElectionChange;
