const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase URL or Key is missing. Check your .env file.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const path = require('path');
const fs = require('fs');

// Local SQLite synchronization
let sqliteDb = null;
try {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(__dirname, 'data', 'codeverse.db');
  if (fs.existsSync(dbPath)) {
    sqliteDb = new DatabaseSync(dbPath);
  }
} catch (e) {
  console.warn('[DB] SQLite sync running with in-memory/optional mode');
}

// Helper functions to map Supabase snake_case to app camelCase
function mapTeam(row) {
  if (!row) return null;
  const mapped = {
    id: row.id,
    registrationId: row.registration_id,
    teamName: row.team_name,
    teamType: row.team_type || 'VIT',
    track: row.track,
    projectTitle: row.project_title,
    referral: row.referral || '',
    hasFood: row.has_food === true || row.has_food === 1 || row.has_food === 'true',
    foodCount: Number(row.food_count) || 0,
    foodAmount: Number(row.food_amount) || 0,
    totalFee: Number(row.total_fee) || 250,
    memberCount: row.member_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  // If local SQLite is available, overlay any non-VIT or food attributes
  if (sqliteDb && (row.id || row.registration_id)) {
    try {
      const sqlRow = sqliteDb.prepare(`
        SELECT team_type, referral, has_food, food_count, food_amount, total_fee 
        FROM teams 
        WHERE id = ? OR registration_id = ?
      `).get(row.id || '', row.registration_id || '');
      if (sqlRow) {
        if (sqlRow.team_type) mapped.teamType = sqlRow.team_type;
        if (sqlRow.referral && !mapped.referral) mapped.referral = sqlRow.referral;
        if (sqlRow.has_food !== null && sqlRow.has_food !== undefined) {
          mapped.hasFood = Boolean(sqlRow.has_food);
        }
        if (sqlRow.food_count !== null && sqlRow.food_count !== undefined) {
          mapped.foodCount = Number(sqlRow.food_count);
        }
        if (sqlRow.food_amount !== null && sqlRow.food_amount !== undefined) {
          mapped.foodAmount = Number(sqlRow.food_amount);
        }
        if (sqlRow.total_fee !== null && sqlRow.total_fee !== undefined) {
          mapped.totalFee = Number(sqlRow.total_fee);
        }
      }
    } catch (e) {}
  }

  return mapped;
}

function mapMember(row, residenceMetadata = {}) {
  if (!row) return null;
  const regKey = (row.reg_number || '').trim().toUpperCase();
  const emailKey = (row.college_email || '').trim().toLowerCase();
  const meta = residenceMetadata[regKey] || residenceMetadata[emailKey] || {};

  let residenceType = row.residence_type;
  if (!residenceType && (row.hostel_block || row.room_no)) {
    residenceType = 'HOSTELLER';
  } else if (!residenceType && (meta.residenceType || meta.dayScholarLocation)) {
    residenceType = meta.residenceType || 'HOSTELLER';
  }

  const mapped = {
    id: row.id,
    teamId: row.team_id,
    fullName: row.full_name,
    regNumber: row.reg_number || meta.regNumber || '',
    collegeEmail: row.college_email,
    phone: row.phone,
    isLeader: row.is_leader === true || row.is_leader === 'true' || row.is_leader === 1,
    residenceType: residenceType || 'HOSTELLER',
    hostelBlock: row.hostel_block || meta.hostelBlock || '',
    roomNo: row.room_no || meta.roomNo || '',
    dayScholarType: row.day_scholar_type || meta.dayScholarType || '',
    dayScholarLocation: row.day_scholar_location || meta.dayScholarLocation || '',
    residenceAddress: row.residence_address || meta.residenceAddress || '',
    collegeName: row.college_name || meta.collegeName || '',
    yearOfStudy: row.year_of_study || meta.yearOfStudy || '',
    degree: row.degree || meta.degree || '',
    wantsFood: row.wants_food === true || row.wants_food === 1 || row.wants_food === 'true' || meta.wantsFood === true,
    createdAt: row.created_at
  };

  // If local SQLite is available, overlay any member attributes
  if (sqliteDb && (row.team_id || emailKey)) {
    try {
      const sqlMem = sqliteDb.prepare(`
        SELECT college_name, year_of_study, degree, wants_food 
        FROM team_members 
        WHERE (team_id = ? AND LOWER(college_email) = ?) OR LOWER(college_email) = ?
      `).get(row.team_id || '', emailKey, emailKey);
      if (sqlMem) {
        if (sqlMem.college_name && !mapped.collegeName) mapped.collegeName = sqlMem.college_name;
        if (sqlMem.year_of_study && !mapped.yearOfStudy) mapped.yearOfStudy = sqlMem.year_of_study;
        if (sqlMem.degree && !mapped.degree) mapped.degree = sqlMem.degree;
        if (sqlMem.wants_food !== null && sqlMem.wants_food !== undefined) {
          mapped.wantsFood = mapped.wantsFood || Boolean(sqlMem.wants_food);
        }
      }
    } catch (e) {}
  }

  return mapped;
}

async function saveTeamResidenceMetadata(teamId, members = []) {
  if (!teamId || !Array.isArray(members)) return;
  const metaObj = {};
  for (const m of members) {
    const regKey = (m.regNumber || m.reg_number || '').trim().toUpperCase();
    const emailKey = (m.collegeEmail || m.college_email || '').trim().toLowerCase();
    const key = regKey || emailKey;
    if (key) {
      metaObj[key] = {
        residenceType: m.residenceType || m.residence_type || 'HOSTELLER',
        hostelBlock: m.hostelBlock || m.hostel_block || '',
        roomNo: m.roomNo || m.room_no || '',
        hostelDetails: m.hostelDetails || m.hostel_details || '',
        dayScholarType: m.dayScholarType || m.day_scholar_type || '',
        dayScholarLocation: m.dayScholarLocation || m.day_scholar_location || '',
        residenceAddress: m.residenceAddress || m.residence_address || '',
        commuteMode: m.commuteMode || m.commute_mode || '',
        collegeName: m.collegeName || m.college_name || '',
        yearOfStudy: m.yearOfStudy || m.year_of_study || '',
        degree: m.degree || '',
        wantsFood: Boolean(m.wantsFood || m.wants_food)
      };
    }
  }

  // Sync to local SQLite if available
  try {
    if (sqliteDb) {
      for (const m of members) {
        const reg = (m.regNumber || m.reg_number || '').trim().toUpperCase();
        const email = (m.collegeEmail || m.college_email || '').trim().toLowerCase();
        const resType = m.residenceType || m.residence_type || 'HOSTELLER';
        const hBlock = m.hostelBlock || m.hostel_block || '';
        const rNo = m.roomNo || m.room_no || '';
        const hDetails = m.hostelDetails || m.hostel_details || '';
        const dsType = m.dayScholarType || m.day_scholar_type || '';
        const dsLoc = m.dayScholarLocation || m.day_scholar_location || '';
        const rAddr = m.residenceAddress || m.residence_address || '';
        const cMode = m.commuteMode || m.commute_mode || '';
        const clgName = m.collegeName || m.college_name || '';
        const yrStudy = m.yearOfStudy || m.year_of_study || '';
        const deg = m.degree || '';
        const food = (m.wantsFood || m.wants_food) ? 1 : 0;

        sqliteDb.prepare(`
          UPDATE team_members
          SET residence_type = ?, hostel_block = ?, room_no = ?, hostel_details = ?,
              day_scholar_type = ?, day_scholar_location = ?, residence_address = ?, commute_mode = ?,
              college_name = ?, year_of_study = ?, degree = ?, wants_food = ?
          WHERE (reg_number != '' AND UPPER(reg_number) = ?) OR LOWER(college_email) = ?
        `).run(resType, hBlock, rNo, hDetails, dsType, dsLoc, rAddr, cMode, clgName, yrStudy, deg, food, reg, email);
      }
    }
  } catch (sqlErr) {
    console.warn('[DB] SQLite sync error:', sqlErr.message);
  }
}

async function getTeamResidenceMetadata(teamId) {
  if (!teamId) return {};

  // 1. Check local SQLite first (instant, 0ms)
  if (sqliteDb) {
    try {
      const rows = sqliteDb.prepare('SELECT * FROM team_members WHERE team_id = ?').all(teamId);
      if (rows && rows.length > 0) {
        const meta = {};
        for (const r of rows) {
          const key = (r.reg_number || r.college_email || '').toUpperCase();
          if (key) {
            meta[key] = {
              residenceType: r.residence_type || 'HOSTELLER',
              hostelBlock: r.hostel_block || '',
              roomNo: r.room_no || '',
              dayScholarType: r.day_scholar_type || '',
              dayScholarLocation: r.day_scholar_location || '',
              residenceAddress: r.residence_address || '',
              collegeName: r.college_name || '',
              yearOfStudy: r.year_of_study || '',
              degree: r.degree || '',
              wantsFood: Boolean(r.wants_food)
            };
          }
        }
        return meta;
      }
    } catch (e) {}
  }

  // 2. Fallback to Supabase
  try {
    const { data: members } = await supabase.from('team_members').select('*').eq('team_id', teamId);
    if (members && members.length > 0) {
      const meta = {};
      for (const m of members) {
        const key = (m.reg_number || m.college_email || '').toUpperCase();
        if (key) {
          meta[key] = {
            residenceType: m.residence_type || 'HOSTELLER',
            hostelBlock: m.hostel_block || '',
            roomNo: m.room_no || '',
            dayScholarType: m.day_scholar_type || '',
            dayScholarLocation: m.day_scholar_location || '',
            residenceAddress: m.residence_address || '',
            collegeName: m.college_name || '',
            yearOfStudy: m.year_of_study || '',
            degree: m.degree || '',
            wantsFood: Boolean(m.wants_food)
          };
        }
      }
      return meta;
    }
  } catch (e) {}

  return {};
}

async function saveTeamReferralRecord({ teamId, teamName, registrationId, referral }) {
  if (!teamName) return;
  const cleanReferral = referral && typeof referral === 'string' && referral.trim() ? referral.trim() : null;
  if (!cleanReferral) return;

  // 1. Supabase team_referrals table
  try {
    const { error } = await supabase.from('team_referrals').insert([{
      team_id: teamId || null,
      team_name: teamName.trim(),
      registration_id: registrationId || null,
      referral: cleanReferral
    }]);
    if (error) {
      console.warn('[DB] Supabase team_referrals notice:', error.message);
    }
  } catch (err) {
    console.warn('[DB] Supabase team_referrals error:', err.message);
  }

  // 2. Set referral in teams table directly
  if (teamId) {
    try {
      await supabase.from('teams').update({ referral: cleanReferral }).eq('id', teamId);
    } catch (e) {}
  }

  // 3. Sync to SQLite team_referrals table
  if (sqliteDb) {
    try {
      const recordId = crypto.randomUUID ? crypto.randomUUID() : `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      sqliteDb.prepare(`
        INSERT INTO team_referrals (id, team_name, referral, registration_id, team_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        recordId,
        teamName.trim(),
        cleanReferral,
        registrationId || null,
        teamId || null,
        new Date().toISOString()
      );
    } catch (sqlErr) {
      console.warn('[DB] SQLite team_referrals sync error:', sqlErr.message);
    }
  }
}

async function getTeamReferral(teamId, teamName) {
  // 1. Check Supabase team_referrals
  try {
    if (teamId) {
      const { data } = await supabase.from('team_referrals').select('referral').eq('team_id', teamId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data && data.referral) return data.referral;
    }
    if (teamName) {
      const { data } = await supabase.from('team_referrals').select('referral').ilike('team_name', teamName.trim()).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data && data.referral) return data.referral;
    }
  } catch (e) {}

  // 2. Check teams column
  try {
    if (teamId) {
      const { data } = await supabase.from('teams').select('referral').eq('id', teamId).limit(1).maybeSingle();
      if (data && data.referral) return data.referral;
    }
  } catch (e) {}

  // 3. Check SQLite
  if (sqliteDb) {
    try {
      if (teamId) {
        const row = sqliteDb.prepare('SELECT referral FROM teams WHERE id = ?').get(teamId);
        if (row && row.referral) return row.referral;
        const refRow = sqliteDb.prepare('SELECT referral FROM team_referrals WHERE team_id = ? ORDER BY created_at DESC LIMIT 1').get(teamId);
        if (refRow && refRow.referral) return refRow.referral;
      }
      if (teamName) {
        const refRow2 = sqliteDb.prepare('SELECT referral FROM team_referrals WHERE LOWER(team_name) = ? ORDER BY created_at DESC LIMIT 1').get(teamName.trim().toLowerCase());
        if (refRow2 && refRow2.referral) return refRow2.referral;
      }
    } catch (e) {}
  }

  return '';
}

async function getAllTeamReferrals() {
  try {
    const { data, error } = await supabase.from('team_referrals').select('*').order('created_at', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (e) {}

  if (sqliteDb) {
    try {
      const rows = sqliteDb.prepare('SELECT * FROM team_referrals ORDER BY created_at DESC').all();
      if (rows && rows.length > 0) return rows;
    } catch (e) {}
  }

  return [];
}

async function syncDedicatedTables(teamId) {
  if (!teamId) return;
  try {
    const { data: team } = await supabase.from('teams').select('*').eq('id', teamId).maybeSingle();
    if (!team) {
      if (sqliteDb) {
        sqliteDb.prepare('DELETE FROM vit_teams WHERE id = ?').run(teamId);
        sqliteDb.prepare('DELETE FROM non_vit_teams WHERE id = ?').run(teamId);
        sqliteDb.prepare('DELETE FROM all_participants WHERE team_id = ?').run(teamId);
      }
      return;
    }

    const { data: members } = await supabase.from('team_members').select('*').eq('team_id', teamId);
    const { data: payment } = await supabase.from('payments').select('*').eq('team_id', teamId).maybeSingle();

    const memList = members || [];
    const leader = memList.find(m => m.is_leader) || memList[0] || {};
    const paymentStatus = payment ? (payment.status || 'PENDING_PAYMENT') : 'PENDING_PAYMENT';
    const utr = payment ? (payment.utr_number || '') : '';
    const isVit = (team.team_type || 'VIT').toUpperCase() !== 'NON_VIT';

    if (sqliteDb) {
      if (isVit) {
        sqliteDb.prepare('DELETE FROM non_vit_teams WHERE id = ?').run(teamId);
        sqliteDb.prepare(`
          INSERT INTO vit_teams (
            id, registration_id, team_name, track, project_title, member_count, status,
            leader_name, leader_reg_number, leader_email, leader_phone,
            leader_residence_type, leader_hostel_block, leader_room_no, leader_day_scholar_location,
            referral, total_fee, payment_status, utr_number, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            team_name = excluded.team_name,
            track = excluded.track,
            project_title = excluded.project_title,
            member_count = excluded.member_count,
            status = excluded.status,
            leader_name = excluded.leader_name,
            leader_reg_number = excluded.leader_reg_number,
            leader_email = excluded.leader_email,
            leader_phone = excluded.leader_phone,
            leader_residence_type = excluded.leader_residence_type,
            leader_hostel_block = excluded.leader_hostel_block,
            leader_room_no = excluded.leader_room_no,
            leader_day_scholar_location = excluded.leader_day_scholar_location,
            referral = excluded.referral,
            total_fee = excluded.total_fee,
            payment_status = excluded.payment_status,
            utr_number = excluded.utr_number,
            updated_at = excluded.updated_at
        `).run(
          team.id,
          team.registration_id,
          team.team_name,
          team.track || 'Open Innovation',
          team.project_title || '',
          team.member_count || memList.length,
          team.status || 'PENDING_PAYMENT',
          leader.full_name || '',
          leader.reg_number || '',
          leader.college_email || '',
          leader.phone || '',
          leader.residence_type || 'HOSTELLER',
          leader.hostel_block || '',
          leader.room_no || '',
          leader.day_scholar_location || '',
          team.referral || '',
          team.total_fee || 250,
          paymentStatus,
          utr,
          team.created_at,
          team.updated_at || new Date().toISOString()
        );
      } else {
        sqliteDb.prepare('DELETE FROM vit_teams WHERE id = ?').run(teamId);
        sqliteDb.prepare(`
          INSERT INTO non_vit_teams (
            id, registration_id, team_name, track, project_title, member_count, status,
            leader_name, leader_college_name, leader_email, leader_phone,
            leader_year_of_study, leader_degree,
            has_food, food_count, food_amount, total_fee,
            referral, payment_status, utr_number, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            team_name = excluded.team_name,
            track = excluded.track,
            project_title = excluded.project_title,
            member_count = excluded.member_count,
            status = excluded.status,
            leader_name = excluded.leader_name,
            leader_college_name = excluded.leader_college_name,
            leader_email = excluded.leader_email,
            leader_phone = excluded.leader_phone,
            leader_year_of_study = excluded.leader_year_of_study,
            leader_degree = excluded.leader_degree,
            has_food = excluded.has_food,
            food_count = excluded.food_count,
            food_amount = excluded.food_amount,
            total_fee = excluded.total_fee,
            referral = excluded.referral,
            payment_status = excluded.payment_status,
            utr_number = excluded.utr_number,
            updated_at = excluded.updated_at
        `).run(
          team.id,
          team.registration_id,
          team.team_name,
          team.track || 'Open Innovation',
          team.project_title || '',
          team.member_count || memList.length,
          team.status || 'PENDING_PAYMENT',
          leader.full_name || '',
          leader.college_name || 'External College',
          leader.college_email || '',
          leader.phone || '',
          leader.year_of_study || '',
          leader.degree || '',
          team.has_food ? 1 : 0,
          team.food_count || 0,
          team.food_amount || 0,
          team.total_fee || 250,
          team.referral || '',
          paymentStatus,
          utr,
          team.created_at,
          team.updated_at || new Date().toISOString()
        );
      }

      sqliteDb.prepare('DELETE FROM all_participants WHERE team_id = ?').run(teamId);
      const insertPart = sqliteDb.prepare(`
        INSERT INTO all_participants (
          id, team_id, registration_id, team_name, category, is_leader, role,
          full_name, college_name, reg_number, college_email, phone,
          year_of_study, degree, residence_type, hostel_block, room_no,
          day_scholar_location, residence_address, wants_food, payment_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of memList) {
        const isLeader = Boolean(m.is_leader);
        insertPart.run(
          m.id,
          team.id,
          team.registration_id,
          team.team_name,
          isVit ? 'VIT' : 'NON_VIT',
          isLeader ? 1 : 0,
          isLeader ? 'Leader' : 'Member',
          m.full_name || '',
          isVit ? 'VIT Bhopal University' : (m.college_name || 'External College'),
          m.reg_number || '',
          m.college_email || '',
          m.phone || '',
          m.year_of_study || '',
          m.degree || '',
          m.residence_type || (isVit ? 'HOSTELLER' : ''),
          m.hostel_block || '',
          m.room_no || '',
          m.day_scholar_location || '',
          m.residence_address || '',
          m.wants_food ? 1 : 0,
          paymentStatus,
          m.created_at || team.created_at
        );
      }
    }

    // Also sync to Supabase physical tables if they are tables
    try {
      if (isVit) {
        await supabase.from('vit_teams').upsert([{
          id: team.id,
          registration_id: team.registration_id,
          team_name: team.team_name,
          track: team.track || 'Open Innovation',
          project_title: team.project_title || '',
          member_count: team.member_count || memList.length,
          status: team.status || 'PENDING_PAYMENT',
          leader_name: leader.full_name || '',
          leader_reg_number: leader.reg_number || '',
          leader_email: leader.college_email || '',
          leader_phone: leader.phone || '',
          leader_residence_type: leader.residence_type || 'HOSTELLER',
          leader_hostel_block: leader.hostel_block || '',
          leader_room_no: leader.room_no || '',
          leader_day_scholar_location: leader.day_scholar_location || '',
          referral: team.referral || '',
          total_fee: team.total_fee || 250,
          payment_status: paymentStatus,
          utr_number: utr,
          updated_at: new Date().toISOString()
        }]);
      } else {
        await supabase.from('non_vit_teams').upsert([{
          id: team.id,
          registration_id: team.registration_id,
          team_name: team.team_name,
          track: team.track || 'Open Innovation',
          project_title: team.project_title || '',
          member_count: team.member_count || memList.length,
          status: team.status || 'PENDING_PAYMENT',
          leader_name: leader.full_name || '',
          leader_college_name: leader.college_name || 'External College',
          leader_email: leader.college_email || '',
          leader_phone: leader.phone || '',
          leader_year_of_study: leader.year_of_study || '',
          leader_degree: leader.degree || '',
          has_food: Boolean(team.has_food),
          food_count: team.food_count || 0,
          food_amount: team.food_amount || 0,
          total_fee: team.total_fee || 250,
          referral: team.referral || '',
          payment_status: paymentStatus,
          utr_number: utr,
          updated_at: new Date().toISOString()
        }]);
      }

      for (const m of memList) {
        const isLeader = Boolean(m.is_leader);
        await supabase.from('all_participants').upsert([{
          id: m.id,
          team_id: team.id,
          registration_id: team.registration_id,
          team_name: team.team_name,
          category: isVit ? 'VIT' : 'NON_VIT',
          is_leader: isLeader,
          role: isLeader ? 'Leader' : 'Member',
          full_name: m.full_name || '',
          college_name: isVit ? 'VIT Bhopal University' : (m.college_name || 'External College'),
          reg_number: m.reg_number || '',
          college_email: m.college_email || '',
          phone: m.phone || '',
          year_of_study: m.year_of_study || '',
          degree: m.degree || '',
          residence_type: m.residence_type || (isVit ? 'HOSTELLER' : ''),
          hostel_block: m.hostel_block || '',
          room_no: m.room_no || '',
          day_scholar_location: m.day_scholar_location || '',
          residence_address: m.residence_address || '',
          wants_food: Boolean(m.wants_food),
          payment_status: paymentStatus
        }]);
      }
    } catch (supaSyncErr) {
      // If vit_teams or all_participants is still a view or doesn't allow upsert, ignore safely
    }
  } catch (err) {
    console.warn('[DB] syncDedicatedTables notice:', err.message);
  }
}

async function getVitTeams() {
  try {
    const { data, error } = await supabase.from('vit_teams').select('*').order('created_at', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) return data;
  } catch(e) {}
  if (sqliteDb) {
    try {
      return sqliteDb.prepare('SELECT * FROM vit_teams ORDER BY created_at DESC').all();
    } catch(e) {}
  }
  const all = await getAllTeams();
  return all.filter(t => (t.teamType || 'VIT').toUpperCase() !== 'NON_VIT');
}

async function getNonVitTeams() {
  try {
    const { data, error } = await supabase.from('non_vit_teams').select('*').order('created_at', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) return data;
  } catch(e) {}
  if (sqliteDb) {
    try {
      return sqliteDb.prepare('SELECT * FROM non_vit_teams ORDER BY created_at DESC').all();
    } catch(e) {}
  }
  const all = await getAllTeams();
  return all.filter(t => (t.teamType || '').toUpperCase() === 'NON_VIT');
}

async function getAllParticipants() {
  try {
    const { data, error } = await supabase.from('all_participants').select('*').order('created_at', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) return data;
  } catch(e) {}
  if (sqliteDb) {
    try {
      return sqliteDb.prepare('SELECT * FROM all_participants ORDER BY created_at DESC').all();
    } catch(e) {}
  }
  const all = await getAllTeams();
  const list = [];
  for (const t of all) {
    const isVit = (t.teamType || 'VIT').toUpperCase() !== 'NON_VIT';
    for (const m of (t.members || [])) {
      list.push({
        id: m.id,
        team_id: t.id,
        registration_id: t.registrationId,
        team_name: t.teamName,
        category: isVit ? 'VIT' : 'NON_VIT',
        is_leader: m.isLeader,
        role: m.isLeader ? 'Leader' : 'Member',
        full_name: m.fullName,
        college_name: isVit ? 'VIT Bhopal University' : (m.collegeName || 'External College'),
        reg_number: m.regNumber,
        college_email: m.collegeEmail,
        phone: m.phone,
        year_of_study: m.yearOfStudy,
        degree: m.degree,
        residence_type: m.residenceType,
        hostel_block: m.hostelBlock,
        room_no: m.roomNo,
        day_scholar_location: m.dayScholarLocation,
        residence_address: m.residenceAddress,
        wants_food: m.wantsFood,
        payment_status: t.status,
        created_at: m.createdAt || t.createdAt
      });
    }
  }
  return list;
}

function mapPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    registrationId: row.registration_id,
    paymentMethod: row.payment_method,
    utrNumber: row.utr_number,
    transactionDate: row.transaction_date,
    amountPaid: row.amount_paid,
    proofFilePath: row.proof_file_path,
    status: row.status,
    adminNotes: row.admin_notes,
    submittedAt: row.submitted_at
  };
}

function generateRegistrationId() {
  const randomDigits = Math.floor(10000 + Math.random() * 90000);
  return `CV26-TM-${randomDigits}`;
}

async function createTeam({ teamName, track, projectTitle, members, referral, teamType = 'VIT', hasFood = false, foodCount = 0, foodAmount = 0, totalFee = 250 }) {
  if (!Array.isArray(members) || members.length < 2 || members.length > 5) throw new Error('A team must have between 2 and 5 members (1 Team Leader + 1 to 4 Members).');
  const leaderCount = members.filter(m => m.isLeader).length;
  if (leaderCount !== 1) throw new Error('Exactly one member must be designated as the Team Leader.');
  if (!members[0].isLeader) throw new Error('The Team Leader details must be entered first.');

  const isNonVit = teamType === 'NON_VIT';

  // Ensure regNumber exists for every member (generate unique ID for externals if not provided)
  members.forEach((m, idx) => {
    if (!m.regNumber || !m.regNumber.trim()) {
      if (isNonVit) {
        m.regNumber = `EXT-${Math.floor(100000 + Math.random() * 900000)}`;
      }
    }
  });

  const emails = new Set();
  const regNumbers = new Set();
  for (const m of members) {
    if (!m.fullName || !m.collegeEmail || !m.phone) throw new Error('All member fields are required.');
    if (!isNonVit && !m.regNumber) throw new Error('Registration number is required.');
    const cleanEmail = m.collegeEmail.trim().toLowerCase();
    const cleanReg = (m.regNumber || '').trim().toUpperCase();
    if (emails.has(cleanEmail)) throw new Error(`Duplicate college email in team: ${m.collegeEmail}`);
    if (cleanReg && regNumbers.has(cleanReg)) throw new Error(`Duplicate registration number in team: ${m.regNumber}`);
    emails.add(cleanEmail);
    if (cleanReg) regNumbers.add(cleanReg);
  }

  // Cross-team check
  for (const m of members) {
    const cleanEmail = m.collegeEmail.trim().toLowerCase();
    const cleanReg = (m.regNumber || '').trim().toUpperCase();

    const { data: existingEmailData } = await supabase.from('team_members').select('college_email, teams(team_name, registration_id)').ilike('college_email', cleanEmail).limit(1).single();
    if (existingEmailData) throw new Error(`The email "${m.collegeEmail}" is already registered. A student can only be part of one team.`);

    if (cleanReg && !cleanReg.startsWith('EXT-')) {
      const { data: existingRegData } = await supabase.from('team_members').select('reg_number, teams(team_name, registration_id)').ilike('reg_number', cleanReg).limit(1).single();
      if (existingRegData) throw new Error(`The registration number "${m.regNumber}" is already registered. A student can only be part of one team.`);
    }
  }

  const { data: existingTeam } = await supabase.from('teams').select('id').ilike('team_name', teamName.trim()).limit(1).single();
  if (existingTeam) throw new Error(`Team name "${teamName}" is already taken.`);

  let registrationId;
  while (true) {
    registrationId = generateRegistrationId();
    const { data: collision } = await supabase.from('teams').select('id').eq('registration_id', registrationId).limit(1).maybeSingle();
    if (!collision) break;
  }

  const cleanReferral = referral && typeof referral === 'string' && referral.trim() ? referral.trim() : null;

  let team;
  const fullTeamPayload = {
    registration_id: registrationId,
    team_name: teamName.trim(),
    team_type: teamType || 'VIT',
    track: track || 'Open Innovation',
    project_title: projectTitle || '',
    referral: cleanReferral,
    has_food: Boolean(hasFood),
    food_count: Number(foodCount) || 0,
    food_amount: Number(foodAmount) || 0,
    total_fee: Number(totalFee) || 250,
    member_count: members.length,
    status: 'PENDING_PAYMENT'
  };

  const { data: teamData, error: teamError } = await supabase.from('teams').insert([fullTeamPayload]).select().single();

  if (teamError) {
    // If Supabase schema does not have the new columns yet, retry with base fields
    console.warn('[DB] Teams insert with extended fields failed, retrying base fields:', teamError.message);
    const baseTeamPayload = {
      registration_id: registrationId,
      team_name: teamName.trim(),
      track: track || 'Open Innovation',
      project_title: projectTitle || '',
      member_count: members.length,
      status: 'PENDING_PAYMENT'
    };
    const { data: fallbackTeam, error: fallbackError } = await supabase.from('teams').insert([baseTeamPayload]).select().single();
    if (fallbackError) throw new Error('Failed to create team: ' + fallbackError.message);
    team = fallbackTeam;
  } else {
    team = teamData;
  }

  // Always record into team_referrals table (where Team Name and its Referral is written)
  await saveTeamReferralRecord({
    teamId: team.id,
    teamName: team.team_name || teamName.trim(),
    registrationId: team.registration_id || registrationId,
    referral: cleanReferral
  });

  const fullMembersToInsert = members.map(m => ({
    team_id: team.id,
    full_name: m.fullName.trim(),
    reg_number: (m.regNumber || '').trim().toUpperCase(),
    college_email: m.collegeEmail.trim().toLowerCase(),
    phone: m.phone.trim(),
    is_leader: m.isLeader,
    residence_type: m.residenceType || 'HOSTELLER',
    hostel_block: m.hostelBlock || '',
    room_no: m.roomNo || '',
    day_scholar_type: m.dayScholarType || '',
    day_scholar_location: m.dayScholarLocation || '',
    residence_address: m.residenceAddress || '',
    college_name: m.collegeName || '',
    year_of_study: m.yearOfStudy || '',
    degree: m.degree || '',
    wants_food: Boolean(m.wantsFood)
  }));

  const { error: fullMembersError } = await supabase.from('team_members').insert(fullMembersToInsert);
  if (fullMembersError) {
    console.error('[DB] Full members insert failed, retrying base fields:', fullMembersError.message);
    const baseMembersToInsert = members.map(m => ({
      team_id: team.id,
      full_name: m.fullName.trim(),
      reg_number: (m.regNumber || '').trim().toUpperCase(),
      college_email: m.collegeEmail.trim().toLowerCase(),
      phone: m.phone.trim(),
      is_leader: m.isLeader
    }));
    const { error: baseError } = await supabase.from('team_members').insert(baseMembersToInsert);
    if (baseError) throw new Error('Failed to add members: ' + baseError.message);
  }

  // Always save residence/non-vit metadata backup
  await saveTeamResidenceMetadata(team.id, members);

  // Sync into local SQLite if available
  if (sqliteDb) {
    try {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO teams (id, registration_id, team_name, team_type, track, project_title, member_count, status, referral, has_food, food_count, food_amount, total_fee, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        team.id,
        registrationId,
        teamName.trim(),
        teamType || 'VIT',
        track || 'Open Innovation',
        projectTitle || '',
        members.length,
        'PENDING_PAYMENT',
        cleanReferral,
        hasFood ? 1 : 0,
        Number(foodCount) || 0,
        Number(foodAmount) || 0,
        Number(totalFee) || 250,
        new Date().toISOString(),
        new Date().toISOString()
      );

      for (const m of members) {
        sqliteDb.prepare(`
          INSERT OR REPLACE INTO team_members (team_id, full_name, reg_number, college_email, phone, is_leader, residence_type, hostel_block, room_no, hostel_details, day_scholar_type, day_scholar_location, residence_address, commute_mode, college_name, year_of_study, degree, wants_food, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          team.id,
          m.fullName.trim(),
          (m.regNumber || '').trim().toUpperCase(),
          m.collegeEmail.trim().toLowerCase(),
          m.phone.trim(),
          m.isLeader ? 1 : 0,
          m.residenceType || 'HOSTELLER',
          m.hostelBlock || '',
          m.roomNo || '',
          m.hostelDetails || '',
          m.dayScholarType || '',
          m.dayScholarLocation || '',
          m.residenceAddress || '',
          m.commuteMode || '',
          m.collegeName || '',
          m.yearOfStudy || '',
          m.degree || '',
          m.wantsFood ? 1 : 0,
          new Date().toISOString()
        );
      }
    } catch (e) {
      console.warn('[DB] Local SQLite write notice:', e.message);
    }
  }

  await syncDedicatedTables(team.id);
  return await getTeamByRegistrationId(registrationId);
}

async function getTeamByRegistrationId(registrationId) {
  const { data: team } = await supabase.from('teams').select('*').eq('registration_id', registrationId).limit(1).maybeSingle();
  if (!team) return null;

  const { data: members } = await supabase.from('team_members').select('*').eq('team_id', team.id).order('is_leader', { ascending: false }).order('created_at', { ascending: true });
  const { data: payment } = await supabase.from('payments').select('*').eq('team_id', team.id).limit(1).maybeSingle();

  const resMeta = await getTeamResidenceMetadata(team.id);
  const mappedMembers = (members || []).map(m => mapMember(m, resMeta));
  const referral = team.referral || await getTeamReferral(team.id, team.team_name);

  return {
    ...mapTeam(team),
    referral: referral || team.referral || '',
    members: mappedMembers,
    leader: mappedMembers.find(m => m.isLeader) || mappedMembers[0] || null,
    payment: mapPayment(payment)
  };
}

async function getTeamByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();
  const { data: memberData } = await supabase
    .from('team_members')
    .select('team_id')
    .ilike('college_email', cleanEmail)
    .limit(1)
    .maybeSingle();

  if (!memberData || !memberData.team_id) return null;

  const { data: team } = await supabase
    .from('teams')
    .select('registration_id')
    .eq('id', memberData.team_id)
    .limit(1)
    .maybeSingle();

  if (!team || !team.registration_id) return null;
  return await getTeamByRegistrationId(team.registration_id);
}

async function getPendingTeam(identifier) {
  if (!identifier) return null;
  const clean = identifier.trim();
  let team = null;
  if (clean.includes('@')) {
    team = await getTeamByEmail(clean);
  } else {
    team = await getTeamByRegistrationId(clean.toUpperCase());
    if (!team) {
      team = await getTeamByRegistrationId(clean);
    }
  }
  return team;
}

async function updateTeamDetails({ registrationId, teamName, track, projectTitle, members, referral }) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error(`Team ${registrationId} not found.`);

  if (teamName && teamName.trim().toLowerCase() !== team.teamName.toLowerCase()) {
    const { data: existing } = await supabase.from('teams').select('id').ilike('team_name', teamName.trim()).limit(1).maybeSingle();
    if (existing) throw new Error(`Team name "${teamName}" is already taken.`);
  }

  const cleanReferral = referral !== undefined ? (referral && typeof referral === 'string' && referral.trim() ? referral.trim() : null) : undefined;

  const updateFields = {
    team_name: teamName ? teamName.trim() : team.teamName,
    track: track || team.track,
    project_title: projectTitle || team.projectTitle,
    updated_at: new Date().toISOString()
  };
  if (cleanReferral !== undefined) {
    updateFields.referral = cleanReferral;
  }

  try {
    await supabase.from('teams').update(updateFields).eq('id', team.id);
  } catch (err) {
    if (updateFields.referral !== undefined) {
      delete updateFields.referral;
      await supabase.from('teams').update(updateFields).eq('id', team.id);
    }
  }

  if (cleanReferral !== undefined) {
    await saveTeamReferralRecord({
      teamId: team.id,
      teamName: teamName ? teamName.trim() : team.teamName,
      registrationId: team.registrationId,
      referral: cleanReferral
    });
  }

  if (members && Array.isArray(members) && members.length > 0) {
    if (team.memberCount && members.length !== team.memberCount) {
      throw new Error(`Team size is fixed at ${team.memberCount} members based on paid registration. Adding or removing members is not allowed.`);
    }
    if (members.length < 2 || members.length > 5) throw new Error('A team must have between 2 and 5 members.');
    const leaderCount = members.filter(m => m.isLeader).length;
    if (leaderCount !== 1) throw new Error('Exactly one member must be designated as the Team Leader.');

    for (const m of members) {
      const cleanEmail = m.collegeEmail.trim().toLowerCase();
      const cleanReg = m.regNumber.trim().toUpperCase();

      const { data: existingByEmail } = await supabase.from('team_members').select('team_id').ilike('college_email', cleanEmail).neq('team_id', team.id).limit(1).maybeSingle();
      if (existingByEmail) throw new Error(`The email "${m.collegeEmail}" is already registered in another team.`);

      const { data: existingByReg } = await supabase.from('team_members').select('team_id').ilike('reg_number', cleanReg).neq('team_id', team.id).limit(1).maybeSingle();
      if (existingByReg) throw new Error(`The registration number "${m.regNumber}" is already registered in another team.`);
    }

    await supabase.from('team_members').delete().eq('team_id', team.id);

    const fullMembersToInsert = members.map(m => ({
      team_id: team.id,
      full_name: m.fullName.trim(),
      reg_number: (m.regNumber || '').trim().toUpperCase(),
      college_email: m.collegeEmail.trim().toLowerCase(),
      phone: m.phone.trim(),
      is_leader: m.isLeader,
      residence_type: m.residenceType || 'HOSTELLER',
      hostel_block: m.hostelBlock || '',
      room_no: m.roomNo || '',
      day_scholar_type: m.dayScholarType || '',
      day_scholar_location: m.dayScholarLocation || '',
      residence_address: m.residenceAddress || '',
      college_name: m.collegeName || '',
      year_of_study: m.yearOfStudy || '',
      degree: m.degree || '',
      wants_food: Boolean(m.wantsFood)
    }));

    const { error: fullInsertError } = await supabase.from('team_members').insert(fullMembersToInsert);
    if (fullInsertError) {
      console.error('[DB] Update team members insert failed, retrying base fields:', fullInsertError.message);
      const baseMembersToInsert = members.map(m => ({
        team_id: team.id,
        full_name: m.fullName.trim(),
        reg_number: m.regNumber.trim().toUpperCase(),
        college_email: m.collegeEmail.trim().toLowerCase(),
        phone: m.phone.trim(),
        is_leader: m.isLeader
      }));
      await supabase.from('team_members').insert(baseMembersToInsert);
    }
    await saveTeamResidenceMetadata(team.id, members);
    await supabase.from('teams').update({ member_count: members.length }).eq('id', team.id);
  }

  await syncDedicatedTables(team.id);
  return await getTeamByRegistrationId(registrationId);
}

async function submitPayment({ registrationId, paymentMethod, utrNumber, transactionDate, amountPaid, proofFilePath }) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error(`Team with Registration ID "${registrationId}" not found.`);

  if (!utrNumber || utrNumber.trim().length < 4) throw new Error('Valid Transaction ID / UTR Number is required.');

  const { data: existingUtr } = await supabase.from('payments').select('registration_id').eq('utr_number', utrNumber.trim()).neq('team_id', team.id).limit(1).maybeSingle();
  if (existingUtr) throw new Error(`Transaction ID/UTR "${utrNumber}" has already been submitted for another team.`);

  const { data: existingPayment } = await supabase.from('payments').select('id').eq('team_id', team.id).limit(1).maybeSingle();
  const now = new Date().toISOString();

  const tiers = { 2: 250, 3: 330, 4: 400, 5: 470 };
  const feeFallback = team.totalFee || tiers[team.memberCount] || 250;
  const resolvedAmount = Number(amountPaid) || feeFallback;

  if (existingPayment) {
    const updateData = {
      payment_method: paymentMethod,
      utr_number: utrNumber.trim(),
      transaction_date: transactionDate || now.split('T')[0],
      amount_paid: resolvedAmount,
      status: 'PENDING',
      admin_notes: '',
      submitted_at: now
    };
    if (proofFilePath) updateData.proof_file_path = proofFilePath;

    const { error: updateError } = await supabase.from('payments').update(updateData).eq('id', existingPayment.id);
    if (updateError) throw new Error('Failed to update payment: ' + updateError.message);
  } else {
    const { error: insertError } = await supabase.from('payments').insert([{
      team_id: team.id,
      registration_id: team.registrationId,
      payment_method: paymentMethod,
      utr_number: utrNumber.trim(),
      transaction_date: transactionDate || now.split('T')[0],
      amount_paid: resolvedAmount,
      proof_file_path: proofFilePath || null,
      status: 'PENDING'
    }]);
    if (insertError) throw new Error('Failed to insert payment: ' + insertError.message);
  }

  const { error: teamUpdateError } = await supabase.from('teams').update({ status: 'PENDING_VERIFICATION', updated_at: now }).eq('id', team.id);
  if (teamUpdateError) throw new Error('Failed to update team status: ' + teamUpdateError.message);

  await syncDedicatedTables(team.id);
  return await getTeamByRegistrationId(registrationId);
}

async function getAllTeams({ status = 'ALL', search = '', onlyCompleted = true } = {}) {
  let query = supabase.from('teams').select(`*, payments!inner(*)`);

  if (status && status !== 'ALL') {
    query = query.eq('status', status);
  }

  if (onlyCompleted) {
    query = query.neq('status', 'PENDING_PAYMENT');
  }

  if (search && search.trim()) {
    const searchStr = `%${search.trim()}%`;
    query = query.or(`registration_id.ilike.${searchStr},team_name.ilike.${searchStr},track.ilike.${searchStr}`);
  }

  const { data: results, error } = await query;
  if (error) throw error;
  if (!results) return [];

  const teams = [];
  for (const row of results) {
    const { payments, ...teamData } = row;
    const paymentObj = Array.isArray(payments) ? payments[0] : payments;

    if (onlyCompleted && (!paymentObj?.utr_number || !paymentObj?.proof_file_path)) continue;

    const { data: members } = await supabase.from('team_members').select('*').eq('team_id', teamData.id).order('is_leader', { ascending: false }).order('created_at', { ascending: true });

    const resMeta = await getTeamResidenceMetadata(teamData.id);
    const mappedMembers = (members || []).map(m => mapMember(m, resMeta));
    const teamReferral = teamData.referral || await getTeamReferral(teamData.id, teamData.team_name);
    teams.push({
      ...mapTeam(teamData),
      referral: teamReferral || teamData.referral || '',
      payment: mapPayment(paymentObj),
      members: mappedMembers,
      leader: mappedMembers.find(m => m.isLeader) || mappedMembers[0] || null
    });
  }

  return teams.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function updatePaymentStatus({ registrationId, status, adminNotes = '', verifiedBy = 'Admin' }) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error('Team not found');

  const { data: payment } = await supabase.from('payments').select('id').eq('team_id', team.id).limit(1).maybeSingle();
  if (!payment) throw new Error('No payment record found for this team.');

  const now = new Date().toISOString();
  let paymentStatus = status.toUpperCase() === 'VERIFIED' ? 'VERIFIED' : status.toUpperCase() === 'REJECTED' ? 'REJECTED' : 'PENDING';
  let teamStatus = status.toUpperCase() === 'VERIFIED' ? 'VERIFIED' : status.toUpperCase() === 'REJECTED' ? 'REJECTED' : 'PENDING_VERIFICATION';

  await supabase.from('payments').update({
    status: paymentStatus,
    admin_notes: adminNotes,
    verified_at: paymentStatus === 'VERIFIED' ? now : null,
    verified_by: paymentStatus === 'VERIFIED' ? verifiedBy : null
  }).eq('id', payment.id);

  await supabase.from('teams').update({ status: teamStatus, updated_at: now }).eq('id', team.id);

  await syncDedicatedTables(team.id);
  return await getTeamByRegistrationId(registrationId);
}

async function deleteTeam(registrationId) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error('Team not found');
  await supabase.from('teams').delete().eq('id', team.id);
  await syncDedicatedTables(team.id);
  return true;
}

async function adminUpdateTeam({ registrationId, teamName, track, projectTitle, status, members, payment, referral, teamType, hasFood, foodCount, foodAmount, totalFee }) {
  let team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error('Team not found');

  if (teamName && teamName.trim().toLowerCase() !== team.teamName.toLowerCase()) {
    const { data: existing } = await supabase.from('teams').select('id').ilike('team_name', teamName.trim()).limit(1).maybeSingle();
    if (existing) throw new Error(`Team name "${teamName}" is already taken.`);
  }

  const cleanReferral = referral !== undefined ? (referral && typeof referral === 'string' && referral.trim() ? referral.trim() : null) : undefined;

  const updateFields = {
    team_name: teamName ? teamName.trim() : team.teamName,
    track: track || team.track,
    project_title: projectTitle || team.projectTitle,
    status: status || team.status,
    updated_at: new Date().toISOString()
  };
  if (teamType !== undefined) updateFields.team_type = teamType;
  if (hasFood !== undefined) updateFields.has_food = Boolean(hasFood);
  if (foodCount !== undefined) updateFields.food_count = Number(foodCount) || 0;
  if (foodAmount !== undefined) updateFields.food_amount = Number(foodAmount) || 0;
  if (totalFee !== undefined) updateFields.total_fee = Number(totalFee) || 250;
  if (cleanReferral !== undefined) {
    updateFields.referral = cleanReferral;
  }

  try {
    await supabase.from('teams').update(updateFields).eq('id', team.id);
  } catch (err) {
    if (updateFields.referral !== undefined) {
      delete updateFields.referral;
      await supabase.from('teams').update(updateFields).eq('id', team.id);
    }
  }

  if (cleanReferral !== undefined) {
    await saveTeamReferralRecord({
      teamId: team.id,
      teamName: teamName ? teamName.trim() : team.teamName,
      registrationId: team.registrationId,
      referral: cleanReferral
    });
  }

  if (members && Array.isArray(members) && members.length > 0) {
    await supabase.from('team_members').delete().eq('team_id', team.id);
    const fullMembersToInsert = members.map(m => ({
      team_id: team.id,
      full_name: m.fullName.trim(),
      reg_number: (m.regNumber || '').trim().toUpperCase(),
      college_email: m.collegeEmail.trim().toLowerCase(),
      phone: m.phone.trim(),
      is_leader: m.isLeader,
      residence_type: m.residenceType || 'HOSTELLER',
      hostel_block: m.hostelBlock || '',
      room_no: m.roomNo || '',
      day_scholar_type: m.dayScholarType || '',
      day_scholar_location: m.dayScholarLocation || '',
      residence_address: m.residenceAddress || '',
      college_name: m.collegeName || '',
      year_of_study: m.yearOfStudy || '',
      degree: m.degree || '',
      wants_food: Boolean(m.wantsFood)
    }));

    const { error: fullInsertError } = await supabase.from('team_members').insert(fullMembersToInsert);
    if (fullInsertError) {
      console.error('[DB] Admin update members insert failed, retrying base fields:', fullInsertError.message);
      const baseMembersToInsert = members.map(m => ({
        team_id: team.id,
        full_name: m.fullName.trim(),
        reg_number: m.regNumber.trim().toUpperCase(),
        college_email: m.collegeEmail.trim().toLowerCase(),
        phone: m.phone.trim(),
        is_leader: m.isLeader
      }));
      await supabase.from('team_members').insert(baseMembersToInsert);
    }
    await saveTeamResidenceMetadata(team.id, members);
    await supabase.from('teams').update({ member_count: members.length }).eq('id', team.id);
  }

  if (payment) {
    const { data: existingPayment } = await supabase.from('payments').select('id').eq('team_id', team.id).limit(1).maybeSingle();
    if (existingPayment) {
      await supabase.from('payments').update({
        payment_method: payment.paymentMethod || null,
        utr_number: payment.utrNumber ? payment.utrNumber.trim() : null,
        amount_paid: payment.amountPaid ? Number(payment.amountPaid) : null,
        transaction_date: payment.transactionDate || null,
        status: payment.status || null,
        admin_notes: payment.adminNotes !== undefined ? payment.adminNotes : null
      }).eq('id', existingPayment.id);
    }
  }

  await syncDedicatedTables(team.id);
  return await getTeamByRegistrationId(registrationId);
}

async function getMetrics() {
  const { data: allTeams } = await supabase.from('teams').select('status, payments(amount_paid)');
  if (!allTeams) return { totalTeams: 0, pendingVerification: 0, verified: 0, rejected: 0, totalRevenue: 0 };

  let totalTeams = 0, pendingVerification = 0, verified = 0, rejected = 0, totalRevenue = 0;

  for (const t of allTeams) {
    if (t.status === 'PENDING_PAYMENT') continue;
    totalTeams++;
    if (t.status === 'PENDING_VERIFICATION') pendingVerification++;
    if (t.status === 'VERIFIED') {
      verified++;
      const paymentObj = Array.isArray(t.payments) ? t.payments[0] : t.payments;
      totalRevenue += (paymentObj && paymentObj.amount_paid) ? paymentObj.amount_paid : 0;
    }
    if (t.status === 'REJECTED') rejected++;
  }

  return { totalTeams, pendingVerification, verifiedTeams: verified, rejected, totalRevenue };
}

async function getSetting(key, defaultValue = null) {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return defaultValue;
  if (data.value === 'null' || data.value === '') return defaultValue;
  return data.value;
}

async function setSetting(key, value) {
  const valToSave = value === null ? '' : String(value);
  const { data: existing, error: selectError } = await supabase.from('app_settings').select('key').eq('key', key).limit(1).maybeSingle();
  if (selectError) throw new Error(selectError.message);

  if (existing) {
    const { error } = await supabase.from('app_settings').update({ value: valToSave, updated_at: new Date().toISOString() }).eq('key', key);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('app_settings').insert([{ key, value: valToSave }]);
    if (error) throw new Error(error.message);
  }
}

async function getEditDeadline() {
  return await getSetting('edit_deadline', null);
}

async function setEditDeadline(isoDateString) {
  const val = isoDateString || '';
  await setSetting('edit_deadline', val);
  return val;
}

async function isEditDeadlinePassed() {
  const deadlineStr = await getEditDeadline();
  if (!deadlineStr || deadlineStr.trim() === '') return false;
  const deadline = new Date(deadlineStr);
  if (isNaN(deadline.getTime())) return false;
  return new Date() > deadline;
}

async function getRegistrationDeadline() {
  return await getSetting('registration_deadline', null);
}

async function setRegistrationDeadline(isoDateString) {
  const val = isoDateString ? new Date(isoDateString).toISOString() : null;
  await setSetting('registration_deadline', val);
  return val;
}

async function isRegistrationDeadlinePassed() {
  const deadlineStr = await getRegistrationDeadline();
  if (!deadlineStr || deadlineStr.trim() === '') return false;
  const deadline = new Date(deadlineStr);
  if (isNaN(deadline.getTime())) return false;
  return new Date() > deadline;
}

module.exports = {
  supabase,
  createTeam,
  getTeamByRegistrationId,
  getTeamByEmail,
  getPendingTeam,
  updateTeamDetails,
  submitPayment,
  getAllTeams,
  updatePaymentStatus,
  deleteTeam,
  adminUpdateTeam,
  getMetrics,
  getSetting,
  setSetting,
  getEditDeadline,
  setEditDeadline,
  isEditDeadlinePassed,
  getRegistrationDeadline,
  setRegistrationDeadline,
  isRegistrationDeadlinePassed,
  saveTeamReferralRecord,
  getTeamReferral,
  getAllTeamReferrals,
  syncDedicatedTables,
  getVitTeams,
  getNonVitTeams,
  getAllParticipants
};
