/**
 * E-CHUNAB - Admin Dashboard Logic (js/admin/dashboard.js)
 * Module: Live commission metrics, system statistics, and pending applications feed
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Admin Dashboard] Initializing view...');

  let authData = null;
  if (window.protectPage) {
    authData = await window.protectPage('admin');
    if (!authData) return;
  }

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  if (authData && authData.profile) {
    const adminNameEl = document.getElementById('admin-display-name');
    if (adminNameEl) adminNameEl.textContent = authData.profile.full_name;
  }

  // Load live system metrics
  await loadAdminMetrics(client);
});

async function loadAdminMetrics(client) {
  const statCards = document.querySelectorAll('.stat-card');

  try {
    // 1. Total Registered Voters
    const { count: totalVoters } = await client
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'voter');

    if (statCards[0]) {
      statCards[0].querySelector('.stat-value').textContent = totalVoters || 0;
    }

    // 2. Pending Verification
    const { count: pendingVoters } = await client
      .from('voters')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'pending');

    if (statCards[1]) {
      statCards[1].querySelector('.stat-value').textContent = pendingVoters || 0;
    }

    // 3. Approved Voters
    const { count: approvedVoters } = await client
      .from('voters')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'approved');

    if (statCards[2]) {
      statCards[2].querySelector('.stat-value').textContent = approvedVoters || 0;
    }

    // 4. Active Election
    const { data: activeElec } = await client
      .from('elections')
      .select('id, title, end_date')
      .eq('status', 'active')
      .maybeSingle();

    if (statCards[3]) {
      statCards[3].querySelector('.stat-value').textContent = activeElec ? '1 Active' : '0 Active';
      statCards[3].querySelector('p').textContent = activeElec ? activeElec.title : 'No active election';
    }

    // 5. Total Candidates
    const { count: totalCandidates } = await client
      .from('candidates')
      .select('*', { count: 'exact', head: true });

    if (statCards[4]) {
      statCards[4].querySelector('.stat-value').textContent = totalCandidates || 0;
    }

    // 6. Total Votes Cast
    const { count: totalVotes } = await client
      .from('votes')
      .select('*', { count: 'exact', head: true });

    if (statCards[5]) {
      statCards[5].querySelector('.stat-value').textContent = totalVotes || 0;
      const turnout = approvedVoters ? ((totalVotes / (approvedVoters * 3 || 1)) * 100).toFixed(1) : 0;
      statCards[5].querySelector('p').textContent = `Total ballot records logged`;
    }

    // 7. Recent Pending Verifications Feed
    await loadRecentPendingVerifications(client);

  } catch (err) {
    console.error('[Admin Metrics Error]', err);
  }
}

async function loadRecentPendingVerifications(client) {
  const tbody = document.querySelector('.card .table-responsive tbody');
  if (!tbody) return;

  try {
    const { data: pendingList, error } = await client
      .from('voters')
      .select(`
        id,
        citizenship_number,
        created_at,
        verification_status,
        profiles:user_id (
          full_name,
          email
        )
      `)
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!pendingList || pendingList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; color:var(--gray-500); padding:24px;">
            No pending voter verification requests.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = pendingList.map(v => `
      <tr>
        <td><strong>${window.escapeHTML(v.profiles?.full_name || 'N/A')}</strong><br><small style="color:var(--gray-500)">${window.escapeHTML(v.profiles?.email || '')}</small></td>
        <td><code>${window.escapeHTML(v.citizenship_number)}</code></td>
        <td>${window.formatDate ? window.formatDate(v.created_at) : v.created_at?.slice(0, 10)}</td>
        <td><span class="badge badge-pending">Pending</span></td>
        <td><a href="voters.html" class="btn btn-outline btn-sm">Review</a></td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('[Pending Feed Error]', err);
  }
}
