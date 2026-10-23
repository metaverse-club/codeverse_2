-- ============================================================================
-- CodeVerse 2.0 Hackathon Database Schema Migration (Updated)
-- Feature: Residence Information (Hosteller / Day Scholar)
-- ============================================================================

-- Execute this script in your Supabase SQL Editor:
-- (Supabase Dashboard -> SQL Editor -> New Query -> Run)

-- 1. Add the 6 Active Residence Columns:
ALTER TABLE public.team_members 
ADD COLUMN IF NOT EXISTS residence_type TEXT DEFAULT 'HOSTELLER',
ADD COLUMN IF NOT EXISTS hostel_block TEXT,
ADD COLUMN IF NOT EXISTS room_no TEXT,
ADD COLUMN IF NOT EXISTS day_scholar_type TEXT,
ADD COLUMN IF NOT EXISTS day_scholar_location TEXT,
ADD COLUMN IF NOT EXISTS residence_address TEXT;

-- 2. (Optional) If you previously added floor/wing details or commute mode,
-- you can drop them to keep the schema clean:
ALTER TABLE public.team_members
DROP COLUMN IF EXISTS hostel_details,
DROP COLUMN IF EXISTS commute_mode;

-- 3. Column Descriptions & Documentation:
COMMENT ON COLUMN public.team_members.residence_type IS 'HOSTELLER or DAY_SCHOLAR';
COMMENT ON COLUMN public.team_members.hostel_block IS 'Hostel Block name (e.g. Block 1, Block 2, Girls Block 1)';
COMMENT ON COLUMN public.team_members.room_no IS 'Room Number (e.g. 204, A001)';
COMMENT ON COLUMN public.team_members.day_scholar_type IS 'LOCAL (Local Resident) or NON_LOCAL (Non-Local staying in PG/flat)';
COMMENT ON COLUMN public.team_members.day_scholar_location IS 'City or Area name (e.g. Bhopal, Kothri, Sehore)';
COMMENT ON COLUMN public.team_members.residence_address IS 'Detailed residential address or PG name (e.g. Balaji PG, Saket Nagar)';
