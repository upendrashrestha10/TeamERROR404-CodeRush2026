/**
 * E-CHUNAB - Voter Results Logic (js/voter/results.js)
 * Module: View Live / Concluded Election Results (Anonymized & Aggregated)
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Voter Results] Initializing results view...');

  let authData = null;
  if (window.protectPage) {
    authData = await window.protectPage('voter');
    if (!authData) return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  await loadElectionResults(client);
});

async function loadElectionResults(client) {
  const container = document.getElementById('results-positions-container');

  try {
    // 1. Get active or most recent election
    const { data: election, error: elecErr } = await client
      .from('elections')
      .select('*')
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (elecErr) throw elecErr;

    if (!election) {
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 48px 24px;">
            <div style="font-size: 3rem; margin-bottom: 12px;">📊</div>
            <h3 style="margin-bottom: 8px;">No Election Results Available</h3>
            <p style="color: var(--gray-600); max-width: 480px; margin: 0 auto 16px;">
              There are currently no active or concluded elections to report.
            </p>
            <a href="dashboard.html" class="btn btn-outline">&larr; Return to Dashboard</a>
          </div>
        `;
      }
      return;
    }

    // 2. Call RPC get_election_results
    const { data: results, error: rpcErr } = await client.rpc('get_election_results', {
      p_election_id: election.id
    });

    if (rpcErr) {
      if (rpcErr.message && rpcErr.message.includes('Results unpublished')) {
        // Results are officially sealed
        if (container) {
          container.innerHTML = `
            <div class="card" style="text-align: center; padding: 48px 24px;">
              <div style="font-size: 3rem; margin-bottom: 12px;">🔒</div>
              <h2 style="color: var(--gray-900); margin-bottom: 8px;">Results Sealed by Election Commission</h2>
              <p style="color: var(--gray-600); max-width: 520px; margin: 0 auto 20px; line-height: 1.6;">
                Official tallies for <strong>"${window.escapeHTML(election.title)}"</strong> have not yet been certified and published by the electoral commission.
                <br><br>
                Per electoral standards, partial tallies remain confidential to protect voting integrity until voting officially concludes.
              </p>
              <div>
                <a href="dashboard.html" class="btn btn-outline">&larr; Return to Dashboard</a>
              </div>
            </div>
          `;
        }
        return;
      }
      throw rpcErr;
    }

    // Group results by position
    const positionsMap = {};
    (results || []).forEach(row => {
      if (!positionsMap[row.position_id]) {
        positionsMap[row.position_id] = {
          name: row.position_name,
          order: row.position_order,
          candidates: [],
          totalVotes: 0
        };
      }
      const count = Number(row.vote_count) || 0;
      positionsMap[row.position_id].candidates.push({
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
        container.innerHTML = `<div class="card" style="text-align: center; padding: 30px;">No candidate results recorded.</div>`;
      }
      return;
    }

    container.innerHTML = positionList.map(pos => {
      return `
        <div class="card" style="margin-bottom: 24px;">
          <div class="card-header">
            <div>
              <h3 class="card-title">Position: ${window.escapeHTML(pos.name)}</h3>
              <p class="card-subtitle">Total Valid Votes Cast: ${pos.totalVotes.toLocaleString()}</p>
            </div>
            <span class="badge badge-approved">Certified</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 16px;">
            ${pos.candidates.map((c, idx) => {
              const pct = pos.totalVotes > 0 ? ((c.count / pos.totalVotes) * 100).toFixed(1) : '0.0';
              const barColor = idx === 0 ? 'var(--primary-600)' : (idx === 1 ? 'var(--accent-red-600)' : 'var(--warning-600)');

              return `
                <div>
                  <div class="flex-between" style="margin-bottom: 6px; font-size: 0.9rem;">
                    <span class="font-bold">${window.escapeHTML(c.name)} (${window.escapeHTML(c.symbol)}) <span style="font-size: 0.75rem; color: var(--gray-500); font-weight: normal;">${window.escapeHTML(c.party)}</span></span>
                    <span><strong>${c.count.toLocaleString()} votes</strong> (${pct}%)</span>
                  </div>
                  <div style="height: 10px; background: var(--gray-200); border-radius: var(--radius-full); overflow: hidden;">
                    <div style="width: ${pct}%; height: 100%; background: ${barColor}; border-radius: var(--radius-full); transition: width 0.5s ease;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('[Results Loading Error]', err);
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; color: var(--accent-red-600);">
          Failed to load election results: ${err.message}
        </div>
      `;
    }
  }
}
