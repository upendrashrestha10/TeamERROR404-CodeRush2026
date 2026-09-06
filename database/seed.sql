-- ============================================================================
-- E-CHUNAB: Seed Demo Data
-- Phase 5 Development / Demonstration Dataset
-- ============================================================================

DO $$
DECLARE
    v_election_id UUID := '11111111-1111-1111-1111-111111111111';
    v_pos_pres UUID := '22222222-2222-2222-2222-222222222221';
    v_pos_vpres UUID := '22222222-2222-2222-2222-222222222222';
    v_pos_sec UUID := '22222222-2222-2222-2222-222222222223';
BEGIN
    -- 1. Insert Active Demo Election
    INSERT INTO public.elections (
        id,
        title,
        description,
        banner_url,
        start_date,
        end_date,
        status,
        results_published
    ) VALUES (
        v_election_id,
        'E-Chunab Demo Election 2026',
        'Official digital voting cycle for the Federal Civic Representative Council demonstration.',
        'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=1200&auto=format&fit=crop&q=80',
        now() - INTERVAL '1 hour',
        now() + INTERVAL '7 days',
        'active',
        false
    )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        status = EXCLUDED.status,
        results_published = EXCLUDED.results_published;

    -- 2. Insert Contestable Positions
    INSERT INTO public.positions (
        id,
        election_id,
        name,
        description,
        display_order
    ) VALUES 
        (v_pos_pres, v_election_id, 'President', 'Chief Executive Officer representing all civic delegates.', 1),
        (v_pos_vpres, v_election_id, 'Vice President', 'Deputy council head overseeing governance operations.', 2),
        (v_pos_sec, v_election_id, 'General Secretary', 'Secretary coordinating civic records and transparency.', 3)
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        display_order = EXCLUDED.display_order;

    -- 3. Insert Candidates for President
    INSERT INTO public.candidates (
        id,
        election_id,
        position_id,
        name,
        party,
        symbol,
        photo,
        bio,
        display_order
    ) VALUES
        (
            '33333333-3333-3333-3333-333333333311',
            v_election_id,
            v_pos_pres,
            'Aarav Sharma',
            'Progressive Civic Alliance',
            '☀️ Sun',
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
            'Advocating for institutional transparency, technological modernization, and youth governance.',
            1
        ),
        (
            '33333333-3333-3333-3333-333333333312',
            v_election_id,
            v_pos_pres,
            'Pooja Adhikari',
            'Democratic Reform Movement',
            '🌲 Tree',
            'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80',
            'Committed to ethical civic engagement, sustainable education, and community advocacy.',
            2
        )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        party = EXCLUDED.party,
        symbol = EXCLUDED.symbol,
        photo = EXCLUDED.photo,
        bio = EXCLUDED.bio,
        display_order = EXCLUDED.display_order;

    -- 4. Insert Candidates for Vice President
    INSERT INTO public.candidates (
        id,
        election_id,
        position_id,
        name,
        party,
        symbol,
        photo,
        bio,
        display_order
    ) VALUES
        (
            '33333333-3333-3333-3333-333333333321',
            v_election_id,
            v_pos_vpres,
            'Rohan Karki',
            'Progressive Civic Alliance',
            '🕊️ Dove',
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
            'Experienced organizer focusing on student welfare and equitable digital accessibility.',
            1
        ),
        (
            '33333333-3333-3333-3333-333333333322',
            v_election_id,
            v_pos_vpres,
            'Sunita Maharjan',
            'Independent Civic Voice',
            '⚖️ Scales',
            'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80',
            'Independent activist fostering accountability and open council debates.',
            2
        )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        party = EXCLUDED.party,
        symbol = EXCLUDED.symbol,
        photo = EXCLUDED.photo,
        bio = EXCLUDED.bio,
        display_order = EXCLUDED.display_order;

    -- 5. Insert Candidates for General Secretary
    INSERT INTO public.candidates (
        id,
        election_id,
        position_id,
        name,
        party,
        symbol,
        photo,
        bio,
        display_order
    ) VALUES
        (
            '33333333-3333-3333-3333-333333333331',
            v_election_id,
            v_pos_sec,
            'Bibek Thapa',
            'Democratic Reform Movement',
            '📖 Book',
            'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
            'Champion of transparent documentation, open meeting records, and civic auditability.',
            1
        ),
        (
            '33333333-3333-3333-3333-333333333332',
            v_election_id,
            v_pos_sec,
            'Ananya Shrestha',
            'Youth Civic Forum',
            '🔔 Bell',
            'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
            'Advocating for institutional efficiency, digital recordkeeping, and active youth representation.',
            2
        )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        party = EXCLUDED.party,
        symbol = EXCLUDED.symbol,
        photo = EXCLUDED.photo,
        bio = EXCLUDED.bio,
        display_order = EXCLUDED.display_order;

END $$;
