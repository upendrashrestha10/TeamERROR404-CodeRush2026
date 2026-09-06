/**
 * E-CHUNAB - Admin Position & Candidate Management (js/admin/candidates.js)
 * Module: Manage contestable positions and candidate profiles from database
 */

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

  // Setup modal hooks
  setupModals(client);

  // Load live election positions & candidates
  await loadPositionsAndCandidates(client);
});

function setupModals(client) {
  const addCandidateBtn = document.getElementById('btn-add-candidate');
  if (addCandidateBtn) {
    addCandidateBtn.addEventListener('click', () => {
      if (window.openModal) window.openModal('candidate-modal');
    });
  }

  const addPositionBtn = document.getElementById('btn-add-position');
  if (addPositionBtn) {
    addPositionBtn.addEventListener('click', () => {
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

async function loadPositionsAndCandidates(client) {
  const container = document.getElementById('positions-candidates-container');

  try {
    // 1. Get active or latest election
    const { data: election, error: elecErr } = await client
      .from('elections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (elecErr) throw elecErr;

    if (!election) {
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 40px; color: var(--gray-500);">
            No elections configured yet. Please create an election first.
          </div>
        `;
      }
      return;
    }

    activeElection = election;

    // 2. Fetch positions
    const { data: positions, error: posErr } = await client
      .from('positions')
      .select('*')
      .eq('election_id', activeElection.id)
      .order('display_order', { ascending: true });

    if (posErr) throw posErr;
    currentPositions = positions || [];

    // Update modal select dropdown options
    const posSelect = document.getElementById('cand-pos');
    if (posSelect) {
      posSelect.innerHTML = currentPositions.map(p => `
        <option value="${p.id}">${window.escapeHTML(p.name)}</option>
      `).join('');
    }

    // 3. Fetch candidates
    const { data: candidates, error: candErr } = await client
      .from('candidates')
      .select('*')
      .eq('election_id', activeElection.id)
      .order('display_order', { ascending: true });

    if (candErr) throw candErr;
    currentCandidates = candidates || [];

    // Group candidates by position
    const candByPos = {};
    currentCandidates.forEach(c => {
      if (!candByPos[c.position_id]) candByPos[c.position_id] = [];
      candByPos[c.position_id].push(c);
    });

    if (currentPositions.length === 0) {
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 40px; color: var(--gray-500);">
            No positions defined for "${window.escapeHTML(activeElection.title)}".
          </div>
        `;
      }
      return;
    }

    // Render positions and candidates
    if (container) {
      container.innerHTML = currentPositions.map(pos => {
        const cands = candByPos[pos.id] || [];

        return `
          <div style="margin-bottom: 36px;">
            <div class="flex-between" style="margin-bottom: 16px;">
              <div>
                <h3>Contested Position: ${window.escapeHTML(pos.name)}</h3>
                <p style="font-size: 0.85rem; color: var(--gray-500);">${window.escapeHTML(pos.description || '')}</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <span class="badge badge-draft">Order #${pos.display_order}</span>
              </div>
            </div>

            <div class="admin-candidate-grid">
              ${cands.length === 0 ? `
                <div style="grid-column: 1 / -1; padding: 24px; background: var(--gray-50); border-radius: var(--radius-md); text-align: center; color: var(--gray-500);">
                  No candidates nominated for this position yet.
                </div>
              ` : cands.map(cand => {
                const photoUrl = cand.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80';

                return `
                  <div class="admin-candidate-card">
                    <div class="admin-candidate-header">
                      <img src="${window.escapeHTML(photoUrl)}" alt="${window.escapeHTML(cand.name)}" class="admin-candidate-avatar">
                      <div>
                        <h4 style="font-size: 1rem;">${window.escapeHTML(cand.name)}</h4>
                        <div style="font-size: 0.8rem; color: var(--primary-600); font-weight: 600;">${window.escapeHTML(cand.party)}</div>
                      </div>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 12px;">
                      <strong>Symbol:</strong> ${window.escapeHTML(cand.symbol)}
                    </div>
                    <p style="font-size: 0.825rem; color: var(--gray-600); flex-grow: 1; margin-bottom: 16px;">
                      ${window.escapeHTML(cand.bio || '')}
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
    console.error('[Admin Candidates Error]', err);
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; color: var(--accent-red-600);">
          Failed to load candidates: ${err.message}
        </div>
      `;
    }
  }
}

async function handleCreatePosition(client) {
  const saveBtn = document.getElementById('btn-save-position');
  const nameInput = document.getElementById('pos-name');
  const descInput = document.getElementById('pos-desc');

  const name = nameInput ? nameInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';

  if (!name) {
    if (window.showToast) showToast('warning', 'Validation', 'Position name is required.');
    return;
  }

  if (!activeElection) {
    if (window.showToast) showToast('error', 'Error', 'No active election cycle loaded.');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
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

    if (window.showToast) showToast('success', 'Position Created', `Position "${name}" created successfully.`);

    // Reset form & close modal
    const posForm = document.getElementById('position-form');
    if (posForm) posForm.reset();
    if (window.closeModal) window.closeModal('position-modal');

    // Refresh view
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
  const saveBtn = document.getElementById('btn-save-candidate');
  const posSelect = document.getElementById('cand-pos');
  const nameInput = document.getElementById('cand-name');
  const partyInput = document.getElementById('cand-party');
  const symbolInput = document.getElementById('cand-symbol');
  const bioInput = document.getElementById('cand-bio');

  const positionId = posSelect ? posSelect.value : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const party = partyInput ? partyInput.value.trim() : '';
  const symbol = symbolInput ? symbolInput.value.trim() : '';
  const bio = bioInput ? bioInput.value.trim() : '';

  if (!positionId || !name || !party || !symbol) {
    if (window.showToast) showToast('warning', 'Validation', 'Please fill in candidate position, name, party, and symbol.');
    return;
  }

  if (!activeElection) {
    if (window.showToast) showToast('error', 'Error', 'No active election cycle loaded.');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
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
        bio: bio || null,
        display_order: nextOrder
      })
      .select()
      .single();

    if (error) throw error;

    if (window.showToast) showToast('success', 'Candidate Nominated', `Candidate "${name}" nominated successfully.`);

    // Reset form & close modal
    const candForm = document.getElementById('candidate-form');
    if (candForm) candForm.reset();
    if (window.closeModal) window.closeModal('candidate-modal');

    // Refresh view
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
