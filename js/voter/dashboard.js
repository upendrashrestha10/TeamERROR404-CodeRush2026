/**
 * E-CHUNAB - Voter Dashboard Logic (js/voter/dashboard.js)
 * Module: Voter Dashboard State, Verification Badges, & Active Election Detection
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Voter Dashboard] Initializing view...');

  let authData = null;
  if (window.protectPage) {
    authData = await window.protectPage('voter');
    if (!authData) return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client || !authData) return;

  const user = authData.user;
  const profile = authData.profile;

  // 1. Display Voter Name
  if (profile) {
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.textContent = profile.full_name;
  }

  // 2. Load Verification Status
  const voterRecord = await loadVoterVerificationState(client, user.id);

  // 3. Load Active Election State
  await loadActiveElectionState(client, voterRecord);
});

async function loadVoterVerificationState(client, userId) {
  const badgeEl = document.getElementById('voter-verification-badge');

  try {
    const { data: voter, error } = await client
      .from('voters')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    // Update Topbar Badge
    if (badgeEl) {
      if (!voter) {
        badgeEl.className = 'badge badge-draft';
        badgeEl.innerHTML = '<span class="badge-dot"></span><span>Unverified</span>';
      } else if (voter.verification_status === 'approved') {
        badgeEl.className = 'badge badge-approved';
        badgeEl.innerHTML = '<span class="badge-dot"></span><span>Approved Voter</span>';
      } else if (voter.verification_status === 'pending') {
        badgeEl.className = 'badge badge-pending';
        badgeEl.innerHTML = '<span class="badge-dot"></span><span>Verification Pending</span>';
      } else if (voter.verification_status === 'rejected') {
        badgeEl.className = 'badge badge-rejected';
        badgeEl.innerHTML = '<span class="badge-dot"></span><span>Verification Rejected</span>';
      }
    }

    // Update Stat Grid Card 1 (Citizenship Status)
    const statCards = document.querySelectorAll('.stat-card');
    if (statCards[0]) {
      const valEl = statCards[0].querySelector('.stat-value');
      const descEl = statCards[0].querySelector('p');
      if (voter) {
        if (voter.verification_status === 'approved') {
          valEl.textContent = 'Approved';
          valEl.style.color = 'var(--success-700)';
          descEl.textContent = `Citizenship: ${voter.citizenship_number}`;
        } else if (voter.verification_status === 'pending') {
          valEl.textContent = 'Pending Review';
          valEl.style.color = 'var(--warning-700)';
          descEl.textContent = `Under review by election commission`;
        } else if (voter.verification_status === 'rejected') {
          valEl.textContent = 'Action Required';
          valEl.style.color = 'var(--accent-red-600)';
          descEl.textContent = `Reason: ${voter.rejection_reason || 'Resubmission needed'}`;
        }
      } else {
        valEl.textContent = 'Not Submitted';
        valEl.style.color = 'var(--gray-500)';
        descEl.innerHTML = '<a href="../auth/verification.html" style="color:var(--primary-600); font-weight:600;">Upload Documents &rarr;</a>';
      }
    }

    return voter;

  } catch (err) {
    console.error('[Voter Status Error]', err);
    return null;
  }
}

async function loadActiveElectionState(client, voter) {
  const banner = document.getElementById('active-election-banner');
  const badgeText = banner?.querySelector('.election-hero-badge span:last-child');
  const titleEl = document.getElementById('election-hero-title');
  const descEl = document.getElementById('election-hero-desc');
  const voteBtn = document.getElementById('btn-vote-now');

  const statCards = document.querySelectorAll('.stat-card');
  const eligibilityCard = statCards[1];
  const positionsCard = statCards[2];

  try {
    // 1. Fetch current active elections (Array query to handle multiple active elections gracefully)
    const { data: elections, error: elecErr } = await client
      .from('elections')
      .select('*, positions(count)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (elecErr) throw elecErr;

    const election = (elections && elections.length > 0) ? elections[0] : null;

    if (!election) {
      // No active election
      if (badgeText) badgeText.textContent = 'No Active Election Currently';
      if (titleEl) titleEl.textContent = 'No Polls Currently Open';
      if (descEl) descEl.textContent = 'There is no active election cycle underway right now. Upcoming election schedules will be published by the commission.';
      if (voteBtn) {
        voteBtn.classList.add('disabled');
        voteBtn.style.opacity = '0.5';
        voteBtn.style.pointerEvents = 'none';
        voteBtn.textContent = 'Voting Closed';
      }
      if (eligibilityCard) {
        eligibilityCard.querySelector('.stat-value').textContent = 'No Election';
        eligibilityCard.querySelector('p').textContent = 'Waiting for election cycle';
      }
      return;
    }

    // Active election exists!
    if (titleEl) titleEl.textContent = election.title;
    
    // Check if voter has already voted using RPC
    let hasVoted = false;
    if (voter && voter.verification_status === 'approved') {
      const { data: votedData, error: votedErr } = await client.rpc('has_voted', {
        p_election_id: election.id
      });
      if (!votedErr) {
        hasVoted = !!votedData;
      }
    }

    // Check positions count for Card 3
    const { count: posCount } = await client
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .eq('election_id', election.id);

    if (positionsCard) {
      positionsCard.querySelector('.stat-value').textContent = `${posCount || 0} Position(s)`;
      positionsCard.querySelector('p').textContent = 'Contested in active ballot';
    }

    // Determine state
    if (!voter || voter.verification_status !== 'approved') {
      // Unapproved voter
      if (badgeText) badgeText.textContent = 'Election is Active — Verification Required';
      if (descEl) {
        descEl.innerHTML = `${election.description || ''}<br><br><span style="color:#fde047; font-weight:600;">⚠️ Notice: You must have an approved citizenship verification before you can vote.</span>`;
      }
      if (voteBtn) {
        voteBtn.textContent = 'Verify Citizenship to Vote';
        voteBtn.href = '../auth/verification.html';
        voteBtn.classList.remove('btn-accent');
        voteBtn.classList.add('btn-primary');
      }
      if (eligibilityCard) {
        eligibilityCard.querySelector('.stat-value').textContent = 'Not Eligible Yet';
        eligibilityCard.querySelector('.stat-value').style.color = 'var(--warning-700)';
        eligibilityCard.querySelector('p').textContent = 'Verification must be approved';
      }

    } else if (hasVoted) {
      // Approved and already voted
      if (badgeText) badgeText.textContent = 'Election is Active — Ballot Already Cast';
      if (descEl) {
        descEl.textContent = `You have already cast your official ballot for "${election.title}". Your selections have been securely recorded.`;
      }
      if (voteBtn) {
        voteBtn.textContent = 'Ballot Cast ✓';
        voteBtn.classList.add('disabled');
        voteBtn.style.pointerEvents = 'none';
        voteBtn.style.opacity = '0.7';
      }
      if (eligibilityCard) {
        eligibilityCard.querySelector('.stat-value').textContent = 'Vote Recorded';
        eligibilityCard.querySelector('.stat-value').style.color = 'var(--success-700)';
        eligibilityCard.querySelector('p').textContent = 'Ballot submitted successfully';
      }

    } else {
      // Approved and eligible to vote right now!
      if (badgeText) badgeText.textContent = 'Election is Active — You Can Vote Now';
      if (descEl) {
        descEl.textContent = election.description || 'Polls are currently open. Cast your secret ballot for all contestable positions.';
      }
      if (voteBtn) {
        voteBtn.textContent = 'Vote Now →';
        voteBtn.href = 'vote.html';
        voteBtn.classList.remove('disabled');
        voteBtn.style.pointerEvents = 'auto';
        voteBtn.style.opacity = '1';
      }
      if (eligibilityCard) {
        eligibilityCard.querySelector('.stat-value').textContent = 'Eligible to Vote';
        eligibilityCard.querySelector('.stat-value').style.color = 'var(--primary-600)';
        eligibilityCard.querySelector('p').textContent = '1 ballot pending submission';
      }
    }

  } catch (err) {
    console.error('[Active Election Error]', err);
  }
}
