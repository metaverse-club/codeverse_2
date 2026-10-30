-- ============================================================================
-- CodeVerse 2.0 Hackathon Complete Relational Architecture Migration
-- ============================================================================
-- Run this script in your Supabase SQL Editor:
-- (Supabase Dashboard -> SQL Editor -> New Query -> Paste & Click Run)
--
-- This script provides:
-- 1. A clean, dedicated table for App Settings (purged of all junk keys)
-- 2. A dedicated table & view for Referrals (team_referrals, referrals)
-- 3. A dedicated table/view for VIT Students & Teams (vit_teams)
-- 4. A dedicated table/view for Non-VIT Students & Teams (non_vit_teams)
-- 5. A dedicated master directory for All Participants (all_participants)
-- ============================================================================

-- STEP 1: Clean up app_settings (remove all temporary dump keys)
DELETE FROM public.app_settings 
WHERE key LIKE 'referral_team_%' OR key LIKE 'residence_team_%';

-- STEP 2: Ensure team_referrals table exists and has proper indexes
CREATE TABLE IF NOT EXISTS public.team_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL,
    referral TEXT,
    registration_id TEXT,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_referrals_team_name ON public.team_referrals(team_name);
CREATE INDEX IF NOT EXISTS idx_team_referrals_referral ON public.team_referrals(referral);

-- View for Referrals
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

-- STEP 3: Dedicated Table / View for VIT Students & Teams
-- Automatically aggregates team info, leader info, hostel/day-scholar details, and payment verification
CREATE OR REPLACE VIEW public.vit_teams AS
SELECT 
    t.id,
    t.registration_id,
    t.team_name,
    t.track,
    t.project_title,
    t.member_count,
    t.status,
    m.full_name AS leader_name,
    m.reg_number AS leader_reg_number,
    m.college_email AS leader_email,
    m.phone AS leader_phone,
    COALESCE(m.residence_type, 'HOSTELLER') AS leader_residence_type,
    m.hostel_block AS leader_hostel_block,
    m.room_no AS leader_room_no,
    m.day_scholar_location AS leader_day_scholar_location,
    t.referral,
    COALESCE(t.total_fee, 250) AS total_fee,
    COALESCE(p.status, 'PENDING_PAYMENT') AS payment_status,
    p.utr_number,
    t.created_at,
    t.updated_at
FROM public.teams t
LEFT JOIN public.team_members m ON m.team_id = t.id AND m.is_leader = true
LEFT JOIN public.payments p ON p.team_id = t.id
WHERE COALESCE(t.team_type, 'VIT') = 'VIT';

-- STEP 4: Dedicated Table / View for Non-VIT Students & Teams
-- Dedicated to external colleges, food cart selections, and degree/year details
CREATE OR REPLACE VIEW public.non_vit_teams AS
SELECT 
    t.id,
    t.registration_id,
    t.team_name,
    t.track,
    t.project_title,
    t.member_count,
    t.status,
    m.full_name AS leader_name,
    COALESCE(m.college_name, 'External College') AS leader_college_name,
    m.college_email AS leader_email,
    m.phone AS leader_phone,
    m.year_of_study AS leader_year_of_study,
    m.degree AS leader_degree,
    COALESCE(t.has_food, false) AS has_food,
    COALESCE(t.food_count, 0) AS food_count,
    COALESCE(t.food_amount, 0) AS food_amount,
    COALESCE(t.total_fee, 250) AS total_fee,
    t.referral,
    COALESCE(p.status, 'PENDING_PAYMENT') AS payment_status,
    p.utr_number,
    t.created_at,
    t.updated_at
FROM public.teams t
LEFT JOIN public.team_members m ON m.team_id = t.id AND m.is_leader = true
LEFT JOIN public.payments p ON p.team_id = t.id
WHERE t.team_type = 'NON_VIT';

-- STEP 5: Master Directory Table / View for All Individual Participants
-- Lists every single participant (both VIT and Non-VIT) with full academic, contact, role, and meal information
CREATE OR REPLACE VIEW public.all_participants AS
SELECT 
    m.id,
    m.team_id,
    t.registration_id,
    t.team_name,
    COALESCE(t.team_type, 'VIT') AS category,
    m.is_leader,
    CASE WHEN m.is_leader THEN 'Leader' ELSE 'Member' END AS role,
    m.full_name,
    CASE 
        WHEN COALESCE(t.team_type, 'VIT') = 'VIT' THEN 'VIT Bhopal University' 
        ELSE COALESCE(m.college_name, 'External College') 
    END AS college_name,
    m.reg_number,
    m.college_email,
    m.phone,
    m.year_of_study,
    m.degree,
    m.residence_type,
    m.hostel_block,
    m.room_no,
    m.day_scholar_location,
    m.residence_address,
    COALESCE(m.wants_food, false) AS wants_food,
    COALESCE(p.status, 'PENDING_PAYMENT') AS payment_status,
    m.created_at
FROM public.team_members m
JOIN public.teams t ON m.team_id = t.id
LEFT JOIN public.payments p ON p.team_id = t.id;

-- STEP 6: Permissions & RLS Configuration
ALTER TABLE public.team_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access on team_referrals" ON public.team_referrals;
CREATE POLICY "Allow service role full access on team_referrals" 
ON public.team_referrals FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read on team_referrals" ON public.team_referrals;
CREATE POLICY "Allow public read on team_referrals" 
ON public.team_referrals FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.vit_teams TO anon, authenticated, service_role;
GRANT SELECT ON public.non_vit_teams TO anon, authenticated, service_role;
GRANT SELECT ON public.all_participants TO anon, authenticated, service_role;
GRANT SELECT ON public.referrals TO anon, authenticated, service_role;

-- Verification Queries
SELECT 'Clean App Settings' AS table_name, count(*) AS count FROM public.app_settings
UNION ALL
SELECT 'VIT Teams' AS table_name, count(*) AS count FROM public.vit_teams
UNION ALL
SELECT 'Non-VIT Teams' AS table_name, count(*) AS count FROM public.non_vit_teams
UNION ALL
SELECT 'All Participants' AS table_name, count(*) AS count FROM public.all_participants
UNION ALL
SELECT 'Referrals' AS table_name, count(*) AS count FROM public.team_referrals;

