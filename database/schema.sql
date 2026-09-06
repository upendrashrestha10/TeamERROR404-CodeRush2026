-- ============================================================================
-- E-CHUNAB: Digital Election Management System
-- Phase 1 Database Schema Definition (PostgreSQL / Supabase)
-- ============================================================================

-- Enable pgcrypto and uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 0. UPDATED_AT TIMESTAMP TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. PROFILES TABLE
-- Extends Supabase auth.users with civic role and contact info
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'voter' CHECK (role IN ('voter', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2. VOTERS TABLE
-- Stores citizenship verification documents and verification lifecycle
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.voters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    citizenship_number TEXT NOT NULL UNIQUE,
    date_of_birth DATE NOT NULL,
    address TEXT NOT NULL,
    citizenship_front TEXT NOT NULL,
    citizenship_back TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_dob_reasonable CHECK (date_of_birth > '1900-01-01')
);

-- Age eligibility validation trigger (enforcing >= 18 years dynamically)
CREATE OR REPLACE FUNCTION public.check_voter_age()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.date_of_birth > (CURRENT_DATE - INTERVAL '18 years') THEN
        RAISE EXCEPTION 'Eligibility violation: Voter must be at least 18 years of age. Given DOB: %', NEW.date_of_birth;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voters_age_check ON public.voters;
CREATE TRIGGER trg_voters_age_check
    BEFORE INSERT OR UPDATE OF date_of_birth ON public.voters
    FOR EACH ROW EXECUTE FUNCTION public.check_voter_age();

DROP TRIGGER IF EXISTS trg_voters_updated_at ON public.voters;
CREATE TRIGGER trg_voters_updated_at
    BEFORE UPDATE ON public.voters
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. ELECTIONS TABLE
-- Represents an election cycle
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.elections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    banner_url TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'upcoming', 'active', 'completed')),
    results_published BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT valid_election_dates CHECK (end_date > start_date)
);

DROP TRIGGER IF EXISTS trg_elections_updated_at ON public.elections;
CREATE TRIGGER trg_elections_updated_at
    BEFORE UPDATE ON public.elections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 4. POSITIONS TABLE
-- Contestable positions within an election (e.g., President, Vice President)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_position_per_election UNIQUE (election_id, name),
    CONSTRAINT uq_positions_id_election UNIQUE (id, election_id)
);

DROP TRIGGER IF EXISTS trg_positions_updated_at ON public.positions;
CREATE TRIGGER trg_positions_updated_at
    BEFORE UPDATE ON public.positions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 5. CANDIDATES TABLE
-- Nominees contesting for a specific position in an election
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    party TEXT NOT NULL,
    symbol TEXT NOT NULL,
    photo TEXT,
    bio TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Position-election relationship integrity
    CONSTRAINT fk_candidate_position_election FOREIGN KEY (position_id, election_id)
        REFERENCES public.positions(id, election_id) ON DELETE CASCADE,
    -- Composite unique key for vote relationship verification
    CONSTRAINT uq_candidates_id_pos_elec UNIQUE (id, position_id, election_id)
);

DROP TRIGGER IF EXISTS trg_candidates_updated_at ON public.candidates;
CREATE TRIGGER trg_candidates_updated_at
    BEFORE UPDATE ON public.candidates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 6. VOTES TABLE
-- Stores cast ballots with strict relational and composite integrity
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID NOT NULL REFERENCES public.elections(id) ON DELETE RESTRICT,
    position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE RESTRICT,
    candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE RESTRICT,
    voter_id UUID NOT NULL REFERENCES public.voters(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- CRITICAL INTEGRITY: Ensure position belongs to election
    CONSTRAINT fk_vote_position_election FOREIGN KEY (position_id, election_id)
        REFERENCES public.positions(id, election_id) ON DELETE RESTRICT,
    -- CRITICAL INTEGRITY: Ensure candidate belongs to that exact position and election
    CONSTRAINT fk_vote_candidate_pos_elec FOREIGN KEY (candidate_id, position_id, election_id)
        REFERENCES public.candidates(id, position_id, election_id) ON DELETE RESTRICT,
    -- CRITICAL RULE: Enforce one vote per voter + election + position
    CONSTRAINT unique_vote_per_voter_position UNIQUE (voter_id, election_id, position_id)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE AND INTEGRITY
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_voters_user_id ON public.voters(user_id);
CREATE INDEX IF NOT EXISTS idx_voters_status ON public.voters(verification_status);
CREATE INDEX IF NOT EXISTS idx_elections_status_dates ON public.elections(status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_positions_election_order ON public.positions(election_id, display_order);
CREATE INDEX IF NOT EXISTS idx_candidates_pos_elec_order ON public.candidates(election_id, position_id, display_order);
CREATE INDEX IF NOT EXISTS idx_votes_voter_election ON public.votes(voter_id, election_id);
CREATE INDEX IF NOT EXISTS idx_votes_tally ON public.votes(election_id, position_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_votes_candidate ON public.votes(candidate_id);

-- ============================================================================
-- SECURITY DEFINER HELPER FUNCTIONS (Explicit search_path set)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Automatic profile creation trigger on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, phone, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Civic Voter'),
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        'voter' -- Strictly enforce voter role on self-registration
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
