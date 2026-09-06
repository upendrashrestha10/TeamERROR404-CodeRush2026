/**
 * E-CHUNAB - Voter Digital Ballot & Atomic Submission (js/voter/vote.js)
 * Module: Dynamic election loading, candidate selection, review modal, & cast_ballot RPC
 */

let activeElection = null;
let electionPositions = [];
let candidatesByPosition = {};
let selectedCandidates = {}; // Map of position_id -> candidate_id
let currentAuthData = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Voting Page] Initializing digital ballot...');

  if (window.protectPage) {
    currentAuthData = await window.protectPage('voter');
    if (!currentAuthData) return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client || !currentAuthData) return;

  // 1. Verify Voter Verification Status
  const isApproved = await checkVoterApproval(client, currentAuthData.user.id);
  if (!isApproved) {
    renderUnverifiedState();
    return;
  }

  // 2. Load Active Election, Positions, and Candidates
  await loadBallotData(client);

  // 3. Setup Review Modal and Confirm Buttons
  setupReviewAndSubmitHandlers(client);
});

async function checkVoterApproval(client, userId) {
  try {
    const { data: voter, error } = await client
      .from('voters')
      .select('verification_status')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return voter && voter.verification_status === 'approved';
  } catch (err) {
    console.error('[Approval Check Error]', err);
    return false;
  }
}

function renderUnverifiedState() {
  const container = document.getElementById('ballot-positions-container');
  const reviewBtn = document.getElementById('btn-review-ballot');
  if (reviewBtn) reviewBtn.style.display = 'none';

  if (container) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 48px 24px;">
        <div style="font-size: 3rem; margin-bottom: 12px;">🔒</div>
        <h2 style="color: var(--gray-900); margin-bottom: 8px;">Voting Ineligible: Verification Required</h2>
        <p style="color: var(--gray-600); max-width: 500px; margin: 0 auto 20px;">
          Your citizenship verification must be approved by election officials before you can access the digital ballot.
        </p>
        <div>
          <a href="../auth/verification.html" class="btn btn-primary">Check Verification Status &rarr;</a>
        </div>
      </div>
    `;
  }
}

async function loadBallotData(client) {
  const container = document.getElementById('ballot-positions-container');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--gray-500);">
        Loading active election ballot and candidates from database...
      </div>
    `;
  }

  try {
    // 1. Fetch active election
    const { data: election, error: elecErr } = await client
      .from('elections')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (elecErr) throw elecErr;

    if (!election) {
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 48px 24px;">
            <div style="font-size: 3rem; margin-bottom: 12px;">🗳️</div>
            <h2 style="color: var(--gray-900); margin-bottom: 8px;">No Active Election</h2>
            <p style="color: var(--gray-600); max-width: 500px; margin: 0 auto 20px;">
              There is currently no active election cycle available for voting.
            </p>
            <a href="dashboard.html" class="btn btn-outline">&larr; Return to Dashboard</a>
          </div>
        `;
      }
      return;
    }

    activeElection = election;

    // 2. Check if already voted using public.has_voted(election_id)
    const { data: hasVoted, error: votedErr } = await client.rpc('has_voted', {
      p_election_id: activeElection.id
    });

    if (!votedErr && hasVoted) {
      renderAlreadyVotedState();
      return;
    }

    // 3. Fetch positions ordered by display_order
    const { data: positions, error: posErr } = await client
      .from('positions')
      .select('*')
      .eq('election_id', activeElection.id)
      .order('display_order', { ascending: true });

    if (posErr) throw posErr;
    electionPositions = positions || [];

    // 4. Fetch candidates for this election ordered by display_order
    const { data: candidates, error: candErr } = await client
      .from('candidates')
      .select('*')
      .eq('election_id', activeElection.id)
      .order('display_order', { ascending: true });

    if (candErr) throw candErr;

    // Group candidates by position_id
    candidatesByPosition = {};
    (candidates || []).forEach(cand => {
      if (!candidatesByPosition[cand.position_id]) {
        candidatesByPosition[cand.position_id] = [];
      }
      candidatesByPosition[cand.position_id].push(cand);
    });

    // 5. Render dynamic digital ballot paper
    renderBallot();

  } catch (err) {
    console.error('[Load Ballot Error]', err);
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; color: var(--accent-red-600);">
          Failed to load digital ballot: ${err.message}
        </div>
      `;
    }
  }
}

function renderAlreadyVotedState() {
  const container = document.getElementById('ballot-positions-container');
  const reviewBtn = document.getElementById('btn-review-ballot');
  if (reviewBtn) reviewBtn.style.display = 'none';

  if (container) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 48px 24px;">
        <div style="font-size: 3.5rem; margin-bottom: 12px;">✅</div>
        <h2 style="color: var(--gray-900); margin-bottom: 8px;">Ballot Already Cast</h2>
        <p style="color: var(--gray-600); max-width: 520px; margin: 0 auto 20px; line-height: 1.6;">
          You have already submitted your official ballot for <strong>"${window.escapeHTML(activeElection?.title || 'this election')}"</strong>.
          <br><br>
          In accordance with secret-ballot and double-voting integrity protocols, ballots cannot be modified, viewed, or submitted a second time.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <a href="dashboard.html" class="btn btn-outline">&larr; Return to Dashboard</a>
          <a href="results.html" class="btn btn-primary">View Results Portal &rarr;</a>
        </div>
      </div>
    `;
  }
}

function renderBallot() {
  const container = document.getElementById('ballot-positions-container');
  if (!container) return;

  if (electionPositions.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center; padding:30px;">No positions available on this ballot.</div>`;
    return;
  }

  container.innerHTML = electionPositions.map(pos => {
    const candidates = candidatesByPosition[pos.id] || [];

    return `
      <div class="position-section" id="pos-section-${pos.id}">
        <div class="position-header">
          <div>
            <h3>Position: ${window.escapeHTML(pos.name)}</h3>
            <p style="font-size: 0.85rem; color: var(--gray-500);">${window.escapeHTML(pos.description || '')}</p>
          </div>
          <span class="badge badge-draft">1 Choice Required</span>
        </div>

        <div class="candidate-grid">
          ${candidates.map(cand => {
            const isSelected = selectedCandidates[pos.id] === cand.id;
            const photoUrl = cand.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80';

            return `
              <div class="candidate-card ${isSelected ? 'selected' : ''}" 
                   data-position-id="${pos.id}" 
                   data-candidate-id="${cand.id}"
                   onclick="selectCandidate('${pos.id}', '${cand.id}')">
                <div class="candidate-photo-wrapper">
                  <img src="${window.escapeHTML(photoUrl)}" alt="${window.escapeHTML(cand.name)}" class="candidate-photo">
                </div>
                <div class="candidate-name">${window.escapeHTML(cand.name)}</div>
                <div class="candidate-party">${window.escapeHTML(cand.party)}</div>
                <div class="candidate-symbol">${window.escapeHTML(cand.symbol)}</div>
                <div class="candidate-bio">${window.escapeHTML(cand.bio || '')}</div>
                <div class="candidate-radio">
                  <input type="radio" name="pos_${pos.id}" value="${cand.id}" ${isSelected ? 'checked' : ''}>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function selectCandidate(positionId, candidateId) {
  selectedCandidates[positionId] = candidateId;

  // Update card styles in this position section
  const section = document.getElementById(`pos-section-${positionId}`);
  if (section) {
    section.querySelectorAll('.candidate-card').forEach(card => {
      const isCardSelected = card.getAttribute('data-candidate-id') === candidateId;
      card.classList.toggle('selected', isCardSelected);
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = isCardSelected;
    });
  }
}

function setupReviewAndSubmitHandlers(client) {
  const reviewBtn = document.getElementById('btn-review-ballot');
  const confirmBtn = document.getElementById('btn-confirm-vote');

  if (reviewBtn) {
    reviewBtn.addEventListener('click', () => {
      // Validate that every configured position has a selected candidate
      const missingPositions = [];
      electionPositions.forEach(pos => {
        if (!selectedCandidates[pos.id]) {
          missingPositions.push(pos.name);
        }
      });

      if (missingPositions.length > 0) {
        if (window.showToast) {
          showToast('warning', 'Incomplete Ballot', `Please select a candidate for: ${missingPositions.join(', ')}`);
        }
        return;
      }

      // Populate review modal
      const reviewList = document.querySelector('.ballot-review-list');
      if (reviewList) {
        reviewList.innerHTML = electionPositions.map(pos => {
          const chosenCandId = selectedCandidates[pos.id];
          const cand = (candidatesByPosition[pos.id] || []).find(c => c.id === chosenCandId);

          return `
            <div class="ballot-review-item">
              <span class="ballot-review-pos">${window.escapeHTML(pos.name)}</span>
              <span class="ballot-review-cand">${window.escapeHTML(cand?.name || 'N/A')} (${window.escapeHTML(cand?.symbol || '')})</span>
            </div>
          `;
        }).join('');
      }

      if (window.openModal) {
        window.openModal('review-vote-modal');
      }
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Submitting Ballot...';

      try {
        // Build payload: array of { position_id, candidate_id }
        const votesPayload = electionPositions.map(pos => ({
          position_id: pos.id,
          candidate_id: selectedCandidates[pos.id]
        }));

        console.log('[Cast Ballot] Submitting payload to RPC:', votesPayload);

        // Call atomic cast_ballot RPC
        const { data: rpcRes, error: rpcErr } = await client.rpc('cast_ballot', {
          p_election_id: activeElection.id,
          p_votes: votesPayload
        });

        if (rpcErr) throw rpcErr;

        if (window.closeModal) window.closeModal('review-vote-modal');

        if (window.showToast) {
          showToast('success', 'Ballot Cast Successfully!', 'Your vote has been securely recorded. Thank you for exercising your civic right.');
        }

        // Render already voted state
        renderAlreadyVotedState();

      } catch (err) {
        console.error('[Ballot Submission Error]', err);
        let errorMsg = err.message || 'Failed to submit ballot.';
        if (errorMsg.includes('Double-voting violation')) {
          errorMsg = 'Double-voting violation: You have already voted in this election.';
        }
        if (window.showToast) {
          showToast('error', 'Submission Rejected', errorMsg);
        }
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm & Cast Vote';
      }
    });
  }
}

// Expose globally for onclick event bindings
window.selectCandidate = selectCandidate;
