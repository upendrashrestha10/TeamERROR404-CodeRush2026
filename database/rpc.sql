-- ============================================================================
-- E-CHUNAB: Voting & Results RPC Functions
-- Phase 4 Stored Procedures (PostgreSQL / Supabase)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CAST_BALLOT RPC
-- Atomic ballot submission with strict validation and concurrency control
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cast_ballot(
    p_election_id UUID,
    p_votes JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_voter RECORD;
    v_election RECORD;
    v_total_positions INT;
    v_submitted_count INT;
    v_vote_item JSONB;
    v_pos_id UUID;
    v_cand_id UUID;
    v_pos_ids UUID[] := '{}';
BEGIN
    -- 1. Require an authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: You must be logged in to cast a ballot.';
    END IF;

    -- 2 & 3 & 4. Find voter and lock row to prevent concurrent race conditions
    SELECT * INTO v_voter
    FROM public.voters
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF v_voter.id IS NULL THEN
        RAISE EXCEPTION 'Voter record not found: You must submit voter verification before voting.';
    END IF;

    IF v_voter.verification_status != 'approved' THEN
        RAISE EXCEPTION 'Verification required: Your voter verification status is "%". Only approved voters can vote.', v_voter.verification_status;
    END IF;

    -- 5 & 6 & 7. Confirm election exists, is active, and within date window
    SELECT * INTO v_election
    FROM public.elections
    WHERE id = p_election_id;

    IF v_election.id IS NULL THEN
        RAISE EXCEPTION 'Election not found with ID: %', p_election_id;
    END IF;

    IF v_election.status != 'active' THEN
        RAISE EXCEPTION 'Election is not active. Current status: "%". Voting is only permitted when active.', v_election.status;
    END IF;

    IF now() < v_election.start_date THEN
        RAISE EXCEPTION 'Election has not started yet. Starts at: %', v_election.start_date;
    END IF;

    IF now() > v_election.end_date THEN
        RAISE EXCEPTION 'Election has ended. Ended at: %', v_election.end_date;
    END IF;

    -- 8. Confirm voter has not already voted in this election (election-level check)
    IF EXISTS (
        SELECT 1 FROM public.votes
        WHERE voter_id = v_voter.id AND election_id = p_election_id
    ) THEN
        RAISE EXCEPTION 'Double-voting violation: You have already cast your ballot in this election.';
    END IF;

    -- 12. Validate p_votes format
    IF p_votes IS NULL OR jsonb_typeof(p_votes) != 'array' THEN
        RAISE EXCEPTION 'Malformed ballot: p_votes must be a JSON array.';
    END IF;

    v_submitted_count := jsonb_array_length(p_votes);
    IF v_submitted_count = 0 THEN
        RAISE EXCEPTION 'Empty ballot: At least one position selection is required.';
    END IF;

    -- Count configured positions for this election
    SELECT COUNT(*) INTO v_total_positions
    FROM public.positions
    WHERE election_id = p_election_id;

    IF v_total_positions = 0 THEN
        RAISE EXCEPTION 'Configuration error: No contestable positions configured for this election.';
    END IF;

    -- Enforce complete ballot: voter must vote for all positions in the election
    IF v_submitted_count != v_total_positions THEN
        RAISE EXCEPTION 'Partial or invalid ballot: You submitted % selections, but election requires exactly % position(s).',
            v_submitted_count, v_total_positions;
    END IF;

    -- Loop through each vote and validate
    FOR v_vote_item IN SELECT * FROM jsonb_array_elements(p_votes)
    LOOP
        -- Check structure
        IF NOT (v_vote_item ? 'position_id' AND v_vote_item ? 'candidate_id') THEN
            RAISE EXCEPTION 'Malformed ballot item: Each item must have "position_id" and "candidate_id".';
        END IF;

        BEGIN
            v_pos_id := (v_vote_item->>'position_id')::UUID;
            v_cand_id := (v_vote_item->>'candidate_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Malformed ballot item: Invalid UUID format for position_id or candidate_id.';
        END;

        -- 11. Reject duplicate position selections within the same ballot
        IF v_pos_id = ANY(v_pos_ids) THEN
            RAISE EXCEPTION 'Duplicate position in ballot: You cannot vote multiple times for position %.', v_pos_id;
        END IF;
        v_pos_ids := array_append(v_pos_ids, v_pos_id);

        -- 9. Validate that position belongs to this election
        IF NOT EXISTS (
            SELECT 1 FROM public.positions
            WHERE id = v_pos_id AND election_id = p_election_id
        ) THEN
            RAISE EXCEPTION 'Position mismatch: Position % does not belong to election %.', v_pos_id, p_election_id;
        END IF;

        -- 10. Validate that candidate belongs to this position AND election
        IF NOT EXISTS (
            SELECT 1 FROM public.candidates
            WHERE id = v_cand_id AND position_id = v_pos_id AND election_id = p_election_id
        ) THEN
            RAISE EXCEPTION 'Candidate mismatch: Candidate % is not contesting for position % in election %.',
                v_cand_id, v_pos_id, p_election_id;
        END IF;

        -- 13. Insert the individual vote record
        INSERT INTO public.votes (
            election_id,
            position_id,
            candidate_id,
            voter_id
        ) VALUES (
            p_election_id,
            v_pos_id,
            v_cand_id,
            v_voter.id
        );
    END LOOP;

    -- 17. Return clear success response
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Ballot successfully cast and recorded.',
        'election_id', p_election_id,
        'votes_recorded', v_submitted_count,
        'timestamp', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Permissions for cast_ballot
REVOKE ALL ON FUNCTION public.cast_ballot(UUID, JSONB) FROM public;
REVOKE ALL ON FUNCTION public.cast_ballot(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.cast_ballot(UUID, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. GET_ELECTION_RESULTS RPC
-- Aggregated tallies without revealing secret individual voter choices
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_election_results(
    p_election_id UUID
)
RETURNS TABLE (
    election_id UUID,
    position_id UUID,
    position_name TEXT,
    position_order INT,
    candidate_id UUID,
    candidate_name TEXT,
    candidate_party TEXT,
    candidate_symbol TEXT,
    candidate_photo TEXT,
    candidate_order INT,
    vote_count BIGINT
) AS $$
DECLARE
    v_election RECORD;
    v_caller_is_admin BOOLEAN;
BEGIN
    -- 4. Validate that election exists
    SELECT * INTO v_election
    FROM public.elections
    WHERE id = p_election_id;

    IF v_election.id IS NULL THEN
        RAISE EXCEPTION 'Election not found with ID: %', p_election_id;
    END IF;

    -- 5. Check if results can be viewed
    v_caller_is_admin := public.is_admin();

    IF NOT v_election.results_published AND NOT v_caller_is_admin THEN
        RAISE EXCEPTION 'Results unpublished: Election results have not been officially published yet.';
    END IF;

    -- 6 & 7 & 8. Return aggregated results including candidates with 0 votes
    RETURN QUERY
    SELECT
        p.election_id,
        p.id AS position_id,
        p.name AS position_name,
        p.display_order AS position_order,
        c.id AS candidate_id,
        c.name AS candidate_name,
        c.party AS candidate_party,
        c.symbol AS candidate_symbol,
        c.photo AS candidate_photo,
        c.display_order AS candidate_order,
        COUNT(v.id)::BIGINT AS vote_count
    FROM public.positions p
    JOIN public.candidates c ON c.position_id = p.id AND c.election_id = p.election_id
    LEFT JOIN public.votes v ON v.candidate_id = c.id AND v.position_id = p.id AND v.election_id = p.election_id
    WHERE p.election_id = p_election_id
    GROUP BY p.election_id, p.id, p.name, p.display_order, c.id, c.name, c.party, c.symbol, c.photo, c.display_order
    ORDER BY p.display_order ASC, c.display_order ASC, vote_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Permissions for get_election_results (gated by internal results_published/is_admin check)
REVOKE ALL ON FUNCTION public.get_election_results(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_election_results(UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. HAS_VOTED HELPER RPC
-- Securely check if active voter has voted without exposing selections
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_voted(
    p_election_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_voter_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    SELECT id INTO v_voter_id
    FROM public.voters
    WHERE user_id = auth.uid();

    IF v_voter_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.votes
        WHERE voter_id = v_voter_id AND election_id = p_election_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.has_voted(UUID) FROM public;
REVOKE ALL ON FUNCTION public.has_voted(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_voted(UUID) TO authenticated;
