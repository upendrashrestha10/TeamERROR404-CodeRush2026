/**
 * E-CHUNAB - Admin Results & Turnout Analytics (js/admin/results.js)
 * Module: Live aggregate tallies, turnout percentages, position-wise breakdown via get_election_results RPC
 */

let allElections = [];
let selectedElectionId = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Admin Results] Initializing analytics view...');

  let authData = null;
  if (window.protectPage) {
    authData = await window.protectPage('admin');
    if (!authData) return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  const selector = document.getElementById('audit-election-selector');
  if (selector) {
    selector.addEventListener('change', async (e) => {
      selectedElectionId = e.target.value;
      await loadElectionAudit(client, selectedElectionId);
    });
  }

  // Initial load
  await initializeAuditView(client);
});

async function initializeAuditView(client) {
  const selector = document.getElementById('audit-election-selector');

  try {
    // 1. Fetch all elections
    const { data: elections, error: elecErr } = await client
      .from('elections')
      .select('*')
      .order('created_at', { ascending: false });

    if (elecErr) throw elecErr;

    allElections = elections || [];

    if (allElections.length === 0) {
      if (selector) selector.innerHTML = '<option value="">No elections available</option>';
      const container = document.getElementById('results-cards-container');
      if (container) {
        container.innerHTML = '<div class="card" style="text-align:center; padding:36px; color:var(--gray-500);">No elections found.</div>';
      }
      return;
    }

    // Populate selector
    if (selector) {
      selector.innerHTML = allElections.map(e => `
        <option value="${e.id}">
          ${window.escapeHTML(e.title)} (${e.status.toUpperCase()}${e.results_published ? ' - Results Published' : ''})
        </option>
      `).join('');

      // Default to active or first election
      const activeOne = allElections.find(e => e.status === 'active') || allElections[0];
      selector.value = activeOne.id;
      selectedElectionId = activeOne.id;
    }

    await loadElectionAudit(client, selectedElectionId);

  } catch (err) {
    console.error('[Initialize Audit Error]', err);
  }
}

async function loadElectionAudit(client, electionId) {
  const container = document.getElementById('results-cards-container');
  const statCards = document.querySelectorAll('.stat-card');

  if (!electionId) return;

  try {
    // 1. Fetch system metrics for turnout cards
    // Total registered voters
    const { count: totalRegistered } = await client
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'voter');

    // Total verified voters
    const { count: verifiedVoters } = await client
      .from('voters')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'approved');

    // Total distinct ballots cast in this election (from votes table)
    // In our schema, votes has voter_id, election_id, position_id, candidate_id
    const { data: distinctBallots, error: ballotErr } = await client
      .from('votes')
      .select('voter_id')
      .eq('election_id', electionId);

    const distinctVotersSet = new Set((distinctBallots || []).map(b => b.voter_id));
    const totalBallotsCast = distinctVotersSet.size;

    // Turnout percentage
    const turnoutPct = (verifiedVoters && verifiedVoters > 0)
      ? ((totalBallotsCast / verifiedVoters) * 100).toFixed(1)
      : '0.0';

    // Update 4 stat cards
    if (statCards[0]) {
      statCards[0].querySelector('.stat-value').textContent = (totalRegistered || 0).toLocaleString();
    }
    if (statCards[1]) {
      statCards[1].querySelector('.stat-value').textContent = (verifiedVoters || 0).toLocaleString();
      const verifRate = totalRegistered ? ((verifiedVoters / totalRegistered) * 100).toFixed(1) : '0';
      statCards[1].querySelector('p').textContent = `${verifRate}% verification rate`;
    }
    if (statCards[2]) {
      statCards[2].querySelector('.stat-value').textContent = totalBallotsCast.toLocaleString();
    }
    if (statCards[3]) {
      statCards[3].querySelector('.stat-value').textContent = `${turnoutPct}%`;
    }

    // 2. Call get_election_results RPC to get candidate tallies
    const { data: results, error: rpcErr } = await client.rpc('get_election_results', {
      p_election_id: electionId
    });

    if (rpcErr) throw rpcErr;

    // Group results by position
    const positionsMap = {};
    (results || []).forEach(row => {
      if (!positionsMap[row.position_id]) {
        positionsMap[row.position_id] = {
          id: row.position_id,
          name: row.position_name,
          order: row.position_order,
          candidates: [],
          totalVotes: 0
        };
      }
      const count = Number(row.vote_count) || 0;
      positionsMap[row.position_id].candidates.push({
        id: row.candidate_id,
        name: row.candidate_name,
        party: row.candidate_party,
        symbol: row.candidate_symbol,
        count: count
      });
      positionsMap[row.position_id].totalVotes += count;
    });

    const positionList = Object.values(positionsMap).sort((a, b) => a.order - b.order);

    if (positionList.length === 0) {
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 40px; color: var(--gray-500);">
            No positions or candidates configured for this election cycle.
          </div>
        `;
      }
      return;
    }

    if (container) {
      container.innerHTML = positionList.map(pos => {
        // Sort candidates descending by votes
        const sortedCandidates = [...pos.candidates].sort((a, b) => b.count - a.count);
        const topCandidate = sortedCandidates[0];
        const winnerBadge = (topCandidate && topCandidate.count > 0)
          ? `<span class="badge badge-approved">Leader: ${window.escapeHTML(topCandidate.name)}</span>`
          : `<span class="badge badge-draft">No votes recorded</span>`;

        return `
          <div class="card" style="margin-bottom: 24px;">
            <div class="card-header">
              <div>
                <h3 class="card-title">Position: ${window.escapeHTML(pos.name)}</h3>
                <p class="card-subtitle">${pos.totalVotes.toLocaleString()} Votes Recorded</p>
              </div>
              ${winnerBadge}
            </div>

            <div class="table-responsive">
              <table class="table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Party</th>
                    <th>Symbol</th>
                    <th>Vote Count</th>
                    <th>Percentage</th>
                    <th>Standing</th>
                  </tr>
                </thead>
                <tbody>
                  ${sortedCandidates.map((c, idx) => {
                    const pct = pos.totalVotes > 0 ? ((c.count / pos.totalVotes) * 100).toFixed(1) : '0.0';
                    const isLeader = idx === 0 && c.count > 0;
                    const standingBadge = isLeader
                      ? '<span class="badge badge-approved">Leader</span>'
                      : '<span class="badge badge-draft">Nominee</span>';

                    return `
                      <tr>
                        <td><strong>${window.escapeHTML(c.name)}</strong></td>
                        <td>${window.escapeHTML(c.party || 'Independent')}</td>
                        <td>${window.escapeHTML(c.symbol || '—')}</td>
                        <td><strong>${c.count.toLocaleString()}</strong></td>
                        <td>${pct}%</td>
                        <td>${standingBadge}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('[Load Election Audit Error]', err);
    if (container) {
      container.innerHTML = `
        <div class="card" style="padding: 24px; color: var(--accent-red-600);">
          Failed to load election audit: ${err.message}
        </div>
      `;
    }
  }
}
