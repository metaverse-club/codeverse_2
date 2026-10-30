-- ============================================================================
-- CodeVerse 2.0 Hackathon Database Schema Migration
-- Feature: Non-VIT / External Students Registration & Dinner/Food Cart Options
-- ============================================================================

-- Execute this script in your Supabase SQL Editor:
-- (Supabase Dashboard -> SQL Editor -> New Query -> Run)

-- 1. Add Non-VIT & Food Cart Columns to teams table:
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS team_type TEXT DEFAULT 'VIT',
ADD COLUMN IF NOT EXISTS has_food BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS food_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS food_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_fee NUMERIC DEFAULT 250;

COMMENT ON COLUMN public.teams.team_type IS 'VIT or NON_VIT';
COMMENT ON COLUMN public.teams.has_food IS 'Whether team opted for dinner/food pass add-on';
COMMENT ON COLUMN public.teams.food_count IS 'Number of members who opted for dinner/food pass';
COMMENT ON COLUMN public.teams.food_amount IS 'Total food add-on amount in INR';
COMMENT ON COLUMN public.teams.total_fee IS 'Grand total registration fee including base fee + food';

-- 2. Add College, Year, Degree, and Food Preference to team_members table:
ALTER TABLE public.team_members 
ADD COLUMN IF NOT EXISTS college_name TEXT,
ADD COLUMN IF NOT EXISTS year_of_study TEXT,
ADD COLUMN IF NOT EXISTS degree TEXT,
ADD COLUMN IF NOT EXISTS wants_food BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.team_members.college_name IS 'College or University name (for Non-VIT / External participants)';
COMMENT ON COLUMN public.team_members.year_of_study IS 'Current year of study (1st, 2nd, 3rd, 4th, PG)';
COMMENT ON COLUMN public.team_members.degree IS 'Degree / Branch of study (e.g. B.Tech CSE, BCA, etc.)';
COMMENT ON COLUMN public.team_members.wants_food IS 'Whether individual member opted for dinner/food pass';

