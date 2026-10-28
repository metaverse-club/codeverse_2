-- ============================================================================
-- CodeVerse 2.0 Hackathon Database Schema Migration
-- Feature: Referral System (Optional Referral Column & Team Referrals Table)
-- ============================================================================

-- Execute this script in your Supabase SQL Editor:
-- (Supabase Dashboard -> SQL Editor -> New Query -> Run)

-- 1. Add referral column to public.teams table (Optional / Nullable)
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS referral TEXT;

COMMENT ON COLUMN public.teams.referral IS 'Optional referral code provided during team registration';

-- 2. Create the team_referrals table where Team Name and its Referral is written
CREATE TABLE IF NOT EXISTS public.team_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL,
    referral TEXT,
    registration_id TEXT,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create view/alias 'referrals' for convenience
CREATE OR REPLACE VIEW public.referrals AS 
SELECT 
    id, 
    team_name, 
    referral, 
    registration_id, 
    team_id, 
    created_at, 
    updated_at 
FROM public.team_referrals;

-- 4. Create indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_team_referrals_team_name ON public.team_referrals(team_name);
CREATE INDEX IF NOT EXISTS idx_team_referrals_referral ON public.team_referrals(referral);

-- 5. Enable Row Level Security (RLS) policies for secure access
ALTER TABLE public.team_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access on team_referrals" ON public.team_referrals;
CREATE POLICY "Allow service role full access on team_referrals" 
ON public.team_referrals 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read access on team_referrals" ON public.team_referrals;
CREATE POLICY "Allow public read access on team_referrals" 
ON public.team_referrals 
FOR SELECT 
TO anon, authenticated 
USING (true);

DROP POLICY IF EXISTS "Allow public insert on team_referrals" ON public.team_referrals;
CREATE POLICY "Allow public insert on team_referrals" 
ON public.team_referrals 
FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

