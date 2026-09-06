-- ============================================================================
-- E-CHUNAB: Row Level Security (RLS) & Storage Policies
-- Phase 3 Security Implementation (PostgreSQL / Supabase)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. SECURITY TRIGGER GUARDS (Preventing Privilege Escalation)
-- ----------------------------------------------------------------------------

-- Prevent users from updating their own civic role (voter -> admin)
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Security violation: Only administrators can modify user roles.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- Prevent voters from self-approving or altering verification review data
CREATE OR REPLACE FUNCTION public.protect_voter_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.verification_status IN ('approved', 'rejected') AND OLD.verification_status != NEW.verification_status)
       OR (NEW.verified_by IS DISTINCT FROM OLD.verified_by)
       OR (NEW.verified_at IS DISTINCT FROM OLD.verified_at) THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Security violation: Only administrators can approve or reject voter verifications.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_voter_approval ON public.voters;
CREATE TRIGGER trg_protect_voter_approval
    BEFORE UPDATE ON public.voters
    FOR EACH ROW EXECUTE FUNCTION public.protect_voter_approval();

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile; Admins can view all profiles
DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON public.profiles;
CREATE POLICY "Users can view own profile or admins view all"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.is_admin());

-- Users can update their own profile; Admins can update any profile
-- (Role changes are strictly blocked by trg_protect_profile_role)
DROP POLICY IF EXISTS "Users can update own profile or admins update all" ON public.profiles;
CREATE POLICY "Users can update own profile or admins update all"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());

-- Users can insert their own initial profile during registration
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id OR public.is_admin());

-- Only admins can delete profiles
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. VOTERS TABLE RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.voters ENABLE ROW LEVEL SECURITY;

-- Voters can view their own verification record; Admins can view all
DROP POLICY IF EXISTS "Voters view own record or admins view all" ON public.voters;
CREATE POLICY "Voters view own record or admins view all"
ON public.voters FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

-- Authenticated voters can submit their initial verification request
DROP POLICY IF EXISTS "Voters can submit verification request" ON public.voters;
CREATE POLICY "Voters can submit verification request"
ON public.voters FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id AND
    verification_status = 'pending'
);

-- Voters can resubmit only when status is 'rejected' (resubmission resets to 'pending')
DROP POLICY IF EXISTS "Voters can resubmit rejected verification" ON public.voters;
CREATE POLICY "Voters can resubmit rejected verification"
ON public.voters FOR UPDATE
TO authenticated
USING (
    auth.uid() = user_id AND
    verification_status = 'rejected'
)
WITH CHECK (
    auth.uid() = user_id AND
    verification_status = 'pending'
);

-- Admins can update voter records (approving / rejecting)
DROP POLICY IF EXISTS "Admins can verify or reject voters" ON public.voters;
CREATE POLICY "Admins can verify or reject voters"
ON public.voters FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Admins can delete voter records if needed
DROP POLICY IF EXISTS "Admins can delete voter records" ON public.voters;
CREATE POLICY "Admins can delete voter records"
ON public.voters FOR DELETE
TO authenticated
USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. ELECTIONS TABLE RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.elections ENABLE ROW LEVEL SECURITY;

-- Public and authenticated users can view non-draft elections; Admins can view all
DROP POLICY IF EXISTS "Anyone can view published elections" ON public.elections;
CREATE POLICY "Anyone can view published elections"
ON public.elections FOR SELECT
TO public
USING (status != 'draft' OR public.is_admin());

-- Only admins can create, update, or delete elections
DROP POLICY IF EXISTS "Admins can manage elections" ON public.elections;
CREATE POLICY "Admins can manage elections"
ON public.elections FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. POSITIONS TABLE RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- Public/authenticated users can view positions of published elections
DROP POLICY IF EXISTS "Anyone can view positions of published elections" ON public.positions;
CREATE POLICY "Anyone can view positions of published elections"
ON public.positions FOR SELECT
TO public
USING (
    EXISTS (
        SELECT 1 FROM public.elections e
        WHERE e.id = positions.election_id
          AND (e.status != 'draft' OR public.is_admin())
    )
);

-- Only admins can create, update, or delete positions
DROP POLICY IF EXISTS "Admins can manage positions" ON public.positions;
CREATE POLICY "Admins can manage positions"
ON public.positions FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. CANDIDATES TABLE RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

-- Public/authenticated users can view candidates of published elections
DROP POLICY IF EXISTS "Anyone can view candidates of published elections" ON public.candidates;
CREATE POLICY "Anyone can view candidates of published elections"
ON public.candidates FOR SELECT
TO public
USING (
    EXISTS (
        SELECT 1 FROM public.elections e
        WHERE e.id = candidates.election_id
          AND (e.status != 'draft' OR public.is_admin())
    )
);

-- Only admins can create, update, or delete candidates
DROP POLICY IF EXISTS "Admins can manage candidates" ON public.candidates;
CREATE POLICY "Admins can manage candidates"
ON public.candidates FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. VOTES TABLE RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- Secret ballot protection: Normal voters and anonymous users CANNOT select votes.
-- Only administrators can select votes for counting audits.
DROP POLICY IF EXISTS "Admins can audit votes" ON public.votes;
CREATE POLICY "Admins can audit votes"
ON public.votes FOR SELECT
TO authenticated
USING (public.is_admin());

-- DIRECT INSERTS ARE BLOCKED FOR ALL CLIENTS:
-- No INSERT policy is defined for anon or regular authenticated users.
-- All ballot submissions must execute via the Phase 4 atomic SECURITY DEFINER RPC.
-- No UPDATE or DELETE policies exist (votes are immutable once cast).

-- ----------------------------------------------------------------------------
-- 7. SUPABASE STORAGE POLICIES: citizenship-docs (Private)
-- ----------------------------------------------------------------------------

-- Policy: Authenticated users can upload only to their own user-id folder
DROP POLICY IF EXISTS "Users can upload own citizenship documents" ON storage.objects;
CREATE POLICY "Users can upload own citizenship documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'citizenship-docs' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can view only their own uploaded documents
DROP POLICY IF EXISTS "Users can view own citizenship documents" ON storage.objects;
CREATE POLICY "Users can view own citizenship documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'citizenship-docs' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Admins can view all verification documents
DROP POLICY IF EXISTS "Admins can view all citizenship documents" ON storage.objects;
CREATE POLICY "Admins can view all citizenship documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'citizenship-docs' AND
    public.is_admin()
);

-- Policy: Users can update own files in their own folder (resubmission)
DROP POLICY IF EXISTS "Users can update own citizenship documents" ON storage.objects;
CREATE POLICY "Users can update own citizenship documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'citizenship-docs' AND
    (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'citizenship-docs' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete only their own files in their own folder
DROP POLICY IF EXISTS "Users can delete own citizenship documents" ON storage.objects;
CREATE POLICY "Users can delete own citizenship documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'citizenship-docs' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Admins can delete citizenship documents if required
DROP POLICY IF EXISTS "Admins can delete citizenship documents" ON storage.objects;
CREATE POLICY "Admins can delete citizenship documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'citizenship-docs' AND
    public.is_admin()
);

-- ----------------------------------------------------------------------------
-- 8. SUPABASE STORAGE POLICIES: candidate-media (Public)
-- ----------------------------------------------------------------------------

-- Policy: Public read access for candidate photos and party symbols
DROP POLICY IF EXISTS "Public can view candidate media" ON storage.objects;
CREATE POLICY "Public can view candidate media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'candidate-media');

-- Policy: Only admins can upload candidate media
DROP POLICY IF EXISTS "Admins can upload candidate media" ON storage.objects;
CREATE POLICY "Admins can upload candidate media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'candidate-media' AND
    public.is_admin()
);

-- Policy: Only admins can update candidate media
DROP POLICY IF EXISTS "Admins can update candidate media" ON storage.objects;
CREATE POLICY "Admins can update candidate media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'candidate-media' AND
    public.is_admin()
)
WITH CHECK (
    bucket_id = 'candidate-media' AND
    public.is_admin()
);

-- Policy: Only admins can delete candidate media
DROP POLICY IF EXISTS "Admins can delete candidate media" ON storage.objects;
CREATE POLICY "Admins can delete candidate media"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'candidate-media' AND
    public.is_admin()
);
