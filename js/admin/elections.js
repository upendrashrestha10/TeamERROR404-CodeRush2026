/**
 * E-CHUNAB - Admin Election Lifecycle Management (js/admin/elections.js)
 * Module: Create, edit, activate, complete, and delete elections dynamically from Supabase
 * Enforces security rules: Active/Upcoming elections CANNOT be deleted.
 */

let pendingDeleteId = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Admin Elections] Initializing...');

  let authData = null;
  if (window.protectPage) {
    authData = await window.protectPage('admin');
    if (!authData) return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  // Setup modal triggers
  const createElectionBtn = document.getElementById('btn-create-election');
  if (createElectionBtn) {
    createElectionBtn.addEventListener('click', () => {
      if (window.openModal) window.openModal('election-modal');
    });
  }

  const saveElectionBtn = document.getElementById('btn-save-election');
  if (saveElectionBtn) {
    saveElectionBtn.addEventListener('click', () => handleCreateElection(client));
  }

  const confirmDeleteBtn = document.getElementById('btn-confirm-delete-election');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => executeDeleteElection(client));
  }

  // Load elections from database
  await loadElections(client);
});

async function loadElections(client) {
  const container = document.getElementById('elections-list-container');
  if (!container) return;

  try {
    const { data: elections, error } = await client
      .from('elections')
      .select(`
        *,
        positions (
          id,
          name,
          candidates!fk_candidate_position_election (
            id,
            name,
            party,
            symbol
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!elections || elections.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 48px 24px; color: var(--gray-500);">
          <h3>No Elections Configured</h3>
          <p>Click the button above to create your first election cycle.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = elections.map(elec => {
      const posCount = elec.positions?.length || 0;
      let totalCandidates = 0;
      (elec.positions || []).forEach(p => {
        totalCandidates += (p.candidates?.length || 0);
      });

      const isActive = elec.status === 'active';
      const isCompleted = elec.status === 'completed';
      const isDraft = elec.status === 'draft';
      const isUpcoming = elec.status === 'upcoming';

      let badgeHtml = '';
      if (isActive) {
        badgeHtml = '<span class="badge badge-active"><span class="badge-dot"></span>Active</span>';
      } else if (isCompleted) {
        badgeHtml = '<span class="badge badge-approved"><span class="badge-dot"></span>Completed</span>';
      } else if (isUpcoming) {
        badgeHtml = '<span class="badge badge-pending"><span class="badge-dot"></span>Upcoming</span>';
      } else {
        badgeHtml = '<span class="badge badge-draft"><span class="badge-dot"></span>Draft</span>';
      }

      let actionsHtml = '';

      if (isDraft) {
        actionsHtml = `
          <button class="btn btn-primary btn-sm" onclick="setElectionStatus('${elec.id}', 'active')">Activate</button>
          <button class="btn btn-outline btn-sm" style="color: var(--accent-red-600);" onclick="promptDeleteElection('${elec.id}', '${window.escapeHTML(elec.title)}')">Delete</button>
        `;
      } else if (isUpcoming) {
        // Upcoming elections cannot be deleted
        actionsHtml = `
          <button class="btn btn-primary btn-sm" onclick="setElectionStatus('${elec.id}', 'active')">Activate</button>
        `;
      } else if (isActive) {
        // Active elections cannot be deleted
        actionsHtml = `
          <button class="btn btn-accent btn-sm" onclick="setElectionStatus('${elec.id}', 'completed')">Complete Election</button>
        `;
      } else if (isCompleted) {
        // Completed elections can be deleted by Admin
        const pubBtn = elec.results_published 
          ? `<span class="badge badge-approved">Results Published</span>`
          : `<button class="btn btn-primary btn-sm" onclick="publishResults('${elec.id}')">Publish Results</button>`;

        actionsHtml = `
          ${pubBtn}
          <button class="btn btn-outline btn-sm" style="color: var(--accent-red-600); border-color: rgba(220,38,38,0.3);" onclick="promptDeleteElection('${elec.id}', '${window.escapeHTML(elec.title)}')">Delete</button>
        `;
      }

      const cardClass = isActive ? 'card election-control-card active' : 'card election-control-card';

      return `
        <div class="${cardClass}">
          <div class="card-header">
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <h3 class="card-title">${window.escapeHTML(elec.title)}</h3>
                ${badgeHtml}
              </div>
              <p class="card-subtitle">${window.escapeHTML(elec.description || 'No description provided.')}</p>
            </div>

            <div style="display: flex; gap: 8px; align-items: center;">
              ${actionsHtml}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 14px; font-size: 0.85rem; color: var(--gray-600);">
            <div><strong>Start:</strong> ${window.formatDate ? window.formatDate(elec.start_date) : elec.start_date?.slice(0, 16)}</div>
            <div><strong>End:</strong> ${window.formatDate ? window.formatDate(elec.end_date) : elec.end_date?.slice(0, 16)}</div>
            <div><strong>Contested Positions:</strong> ${posCount}</div>
            <div><strong>Nominees:</strong> ${totalCandidates} Candidates</div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('[Load Elections Error]', err);
    container.innerHTML = `<div class="card" style="padding: 24px; color: var(--accent-red-600);">Failed to load elections: ${err.message}</div>`;
  }
}

async function handleCreateElection(client) {
  const title = document.getElementById('election-title')?.value.trim();
  const desc = document.getElementById('election-desc')?.value.trim();
  const start = document.getElementById('election-start')?.value;
  const end = document.getElementById('election-end')?.value;

  if (!title || !start || !end) {
    if (window.showToast) showToast('warning', 'Validation', 'Please fill in election title, start date, and end date.');
    return;
  }

  try {
    const { data, error } = await client
      .from('elections')
      .insert({
        title,
        description: desc,
        start_date: new Date(start).toISOString(),
        end_date: new Date(end).toISOString(),
        status: 'draft',
        results_published: false
      })
      .select()
      .single();

    if (error) throw error;

    if (window.showToast) showToast('success', 'Created', `Election "${title}" saved as draft.`);
    if (window.closeModal) window.closeModal('election-modal');

    // Reload list
    await loadElections(client);

  } catch (err) {
    console.error('[Create Election Error]', err);
    if (window.showToast) showToast('error', 'Creation Failed', err.message);
  }
}

async function setElectionStatus(electionId, newStatus) {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  if (!confirm(`Are you sure you want to change election status to "${newStatus}"?`)) return;

  try {
    const { error } = await client
      .from('elections')
      .update({ status: newStatus })
      .eq('id', electionId);

    if (error) throw error;

    if (window.showToast) showToast('success', 'Updated', `Election status changed to ${newStatus}.`);
    await loadElections(client);

  } catch (err) {
    console.error('[Update Status Error]', err);
    if (window.showToast) showToast('error', 'Update Failed', err.message);
  }
}

async function publishResults(electionId) {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  if (!confirm('Are you sure you want to publish official election results? Voters will be able to view tallies.')) return;

  try {
    const { error } = await client
      .from('elections')
      .update({ results_published: true })
      .eq('id', electionId);

    if (error) throw error;

    if (window.showToast) showToast('success', 'Results Published', 'Election results are now visible to voters.');
    await loadElections(client);

  } catch (err) {
    console.error('[Publish Results Error]', err);
    if (window.showToast) showToast('error', 'Publish Failed', err.message);
  }
}

function promptDeleteElection(electionId, title) {
  pendingDeleteId = electionId;
  const nameEl = document.getElementById('delete-election-name');
  if (nameEl) nameEl.textContent = `Election Title: "${title}"`;

  if (window.openModal) {
    window.openModal('delete-election-modal');
  } else {
    // Fallback confirmation
    if (confirm(`Are you sure you want to delete election "${title}"? This will permanently remove positions, candidates, and votes.`)) {
      executeDeleteElection(window.getSupabaseClient());
    }
  }
}

async function executeDeleteElection(client) {
  if (!client) client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client || !pendingDeleteId) return;

  const btn = document.getElementById('btn-confirm-delete-election');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Deleting...';
  }

  try {
    // Call atomic RPC delete_completed_election(p_election_id)
    const { data: res, error } = await client.rpc('delete_completed_election', {
      p_election_id: pendingDeleteId
    });

    if (error) throw error;

    if (window.closeModal) window.closeModal('delete-election-modal');

    if (window.showToast) {
      showToast('success', 'Election Deleted', res?.message || 'Election deleted successfully.');
    }

    pendingDeleteId = null;

    // Reload list
    await loadElections(client);

  } catch (err) {
    console.error('[Delete Election Error]', err);
    let errorMsg = err.message || 'Failed to delete election.';
    if (window.showToast) {
      showToast('error', 'Deletion Failed', errorMsg);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Delete Election';
    }
  }
}

window.setElectionStatus = setElectionStatus;
window.publishResults = publishResults;
window.promptDeleteElection = promptDeleteElection;
window.executeDeleteElection = executeDeleteElection;
