const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase URL or Key is missing. Check your .env file.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

/**
 * Universal team builder combining team row (from vit_teams or non_vit_teams),
 * participants (from all_participants), and payment record (from payments).
 */
function buildFullTeamObject(teamRow, members = [], payment = null, isNonVit = false) {
  if (!teamRow) return null;

  const resolvedIsNonVit = isNonVit || (teamRow.team_type || '').toUpperCase() === 'NON_VIT' || Boolean(teamRow.leader_college_name);

  // Normalize member objects for consumers (admin.js, server exports, track page, etc.)
  const formattedMembers = (members || []).map(m => ({
    id: m.id,
    teamId: m.team_id || teamRow.id,
    fullName: m.full_name || m.fullName || '',
    regNumber: m.reg_number || m.regNumber || '',
    collegeEmail: m.college_email || m.collegeEmail || '',
    phone: m.phone || '',
    isLeader: Boolean(m.is_leader === true || m.is_leader === 1 || m.is_leader === 'true' || m.isLeader),
    collegeName: m.college_name || m.collegeName || (resolvedIsNonVit ? (teamRow.leader_college_name || 'External College') : 'VIT Bhopal University'),
    yearOfStudy: m.year_of_study || m.yearOfStudy || teamRow.leader_year_of_study || '',
    degree: m.degree || teamRow.leader_degree || '',
    residenceType: m.residence_type || m.residenceType || teamRow.leader_residence_type || 'HOSTELLER',
    hostelBlock: m.hostel_block || m.hostelBlock || teamRow.leader_hostel_block || '',
    roomNo: m.room_no || m.roomNo || teamRow.leader_room_no || '',
    dayScholarType: m.day_scholar_type || m.dayScholarType || '',
    dayScholarLocation: m.day_scholar_location || m.dayScholarLocation || teamRow.leader_day_scholar_location || '',
    residenceAddress: m.residence_address || m.residenceAddress || '',
    wantsFood: Boolean(m.wants_food || m.wantsFood),
    paymentStatus: m.payment_status || m.paymentStatus || teamRow.payment_status || teamRow.status || 'PENDING_PAYMENT',
    createdAt: m.created_at || m.createdAt || teamRow.created_at
  }));

  const leaderMember = formattedMembers.find(m => m.isLeader) || formattedMembers[0] || {};

  const formattedPayment = payment ? {
    id: payment.id,
    teamId: payment.team_id || teamRow.id,
    registrationId: payment.registration_id || teamRow.registration_id,
    paymentMethod: payment.payment_method || 'UPI',
    utrNumber: payment.utr_number || teamRow.utr_number || '',
    transactionDate: payment.transaction_date || '',
    amountPaid: Number(payment.amount_paid) || Number(teamRow.total_fee) || 250,
    currency: payment.currency || 'INR',
    proofFilePath: payment.proof_file_path || '',
    status: payment.status || teamRow.payment_status || 'PENDING',
    adminNotes: payment.admin_notes || '',
    submittedAt: payment.submitted_at || '',
    verifiedAt: payment.verified_at || null,
    verifiedBy: payment.verified_by || null
  } : (teamRow.utr_number ? {
    paymentMethod: 'UPI',
    utrNumber: teamRow.utr_number,
    amountPaid: Number(teamRow.total_fee) || 250,
    status: teamRow.payment_status || 'PENDING'
  } : null);

  return {
    id: teamRow.id,
    registrationId: teamRow.registration_id,
    registration_id: teamRow.registration_id,
    teamName: teamRow.team_name,
    team_name: teamRow.team_name,
    teamType: resolvedIsNonVit ? 'NON_VIT' : 'VIT',
    team_type: resolvedIsNonVit ? 'NON_VIT' : 'VIT',
    track: teamRow.track || 'Open Innovation',
    projectTitle: teamRow.project_title || '',
    project_title: teamRow.project_title || '',
    referral: teamRow.referral || '',
    hasFood: Boolean(teamRow.has_food),
    has_food: Boolean(teamRow.has_food),
    foodCount: Number(teamRow.food_count) || 0,
    food_count: Number(teamRow.food_count) || 0,
    foodAmount: Number(teamRow.food_amount) || 0,
    food_amount: Number(teamRow.food_amount) || 0,
    totalFee: Number(teamRow.total_fee) || 250,
    total_fee: Number(teamRow.total_fee) || 250,
    memberCount: teamRow.member_count || formattedMembers.length,
    member_count: teamRow.member_count || formattedMembers.length,
    status: teamRow.status || 'PENDING_PAYMENT',
    createdAt: teamRow.created_at,
    created_at: teamRow.created_at,
    updatedAt: teamRow.updated_at,
    updated_at: teamRow.updated_at,
    leader: {
      fullName: leaderMember.fullName || teamRow.leader_name || '',
      regNumber: leaderMember.regNumber || teamRow.leader_reg_number || '',
      collegeEmail: leaderMember.collegeEmail || teamRow.leader_email || '',
      phone: leaderMember.phone || teamRow.leader_phone || '',
      residenceType: leaderMember.residenceType || teamRow.leader_residence_type || 'HOSTELLER',
      hostelBlock: leaderMember.hostelBlock || teamRow.leader_hostel_block || '',
      roomNo: leaderMember.roomNo || teamRow.leader_room_no || '',
      dayScholarLocation: leaderMember.dayScholarLocation || teamRow.leader_day_scholar_location || '',
      residenceAddress: leaderMember.residenceAddress || '',
      collegeName: leaderMember.collegeName || teamRow.leader_college_name || (resolvedIsNonVit ? 'External College' : 'VIT Bhopal University'),
      yearOfStudy: leaderMember.yearOfStudy || teamRow.leader_year_of_study || '',
      degree: leaderMember.degree || teamRow.leader_degree || ''
    },
    members: formattedMembers,
    payment: formattedPayment,
    payments: formattedPayment ? [formattedPayment] : []
  };
}

/**
 * Find a raw team row from vit_teams or non_vit_teams
 */
async function getRawTeam(filter = {}) {
  // 1. Check vit_teams
  let qVit = supabase.from('vit_teams').select('*');
  let qNonVit = supabase.from('non_vit_teams').select('*');

  if (filter.id) {
    qVit = qVit.eq('id', filter.id);
    qNonVit = qNonVit.eq('id', filter.id);
  } else if (filter.registrationId) {
    qVit = qVit.eq('registration_id', filter.registrationId);
    qNonVit = qNonVit.eq('registration_id', filter.registrationId);
  } else if (filter.teamName) {
    qVit = qVit.ilike('team_name', filter.teamName.trim());
    qNonVit = qNonVit.ilike('team_name', filter.teamName.trim());
  }

  const { data: vTeam } = await qVit.limit(1).maybeSingle();
  if (vTeam) return { teamRow: vTeam, table: 'vit_teams', isNonVit: false };

  const { data: nvTeam } = await qNonVit.limit(1).maybeSingle();
  if (nvTeam) return { teamRow: nvTeam, table: 'non_vit_teams', isNonVit: true };

  // Fallback to SQLite
  if (sqliteDb) {
    try {
      if (filter.registrationId) {
        const vRow = sqliteDb.prepare('SELECT * FROM vit_teams WHERE registration_id = ?').get(filter.registrationId);
        if (vRow) return { teamRow: vRow, table: 'vit_teams', isNonVit: false };
        const nvRow = sqliteDb.prepare('SELECT * FROM non_vit_teams WHERE registration_id = ?').get(filter.registrationId);
        if (nvRow) return { teamRow: nvRow, table: 'non_vit_teams', isNonVit: true };
      }
      if (filter.id) {
        const vRow = sqliteDb.prepare('SELECT * FROM vit_teams WHERE id = ?').get(filter.id);
        if (vRow) return { teamRow: vRow, table: 'vit_teams', isNonVit: false };
        const nvRow = sqliteDb.prepare('SELECT * FROM non_vit_teams WHERE id = ?').get(filter.id);
        if (nvRow) return { teamRow: nvRow, table: 'non_vit_teams', isNonVit: true };
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Fetch all members for a team from all_participants
 */
async function getMembersForTeam(teamId, registrationId) {
  let query = supabase.from('all_participants').select('*');
  if (teamId) {
    query = query.eq('team_id', teamId);
  } else if (registrationId) {
    query = query.eq('registration_id', registrationId);
  }

  const { data: members } = await query
    .order('is_leader', { ascending: false })
    .order('created_at', { ascending: true });

  if (members && members.length > 0) return members;

  // Fallback to SQLite
  if (sqliteDb && (teamId || registrationId)) {
    try {
      const rows = sqliteDb.prepare(`
        SELECT * FROM all_participants 
        WHERE (team_id IS NOT NULL AND team_id = ?) OR (registration_id IS NOT NULL AND registration_id = ?)
        ORDER BY is_leader DESC, created_at ASC
      `).all(teamId || '', registrationId || '');
      if (rows && rows.length > 0) return rows;
    } catch (e) {}
  }

  return [];
}

/**
 * Fetch payment record for a team from payments table
 */
async function getPaymentForTeam(teamId, registrationId) {
  let query = supabase.from('payments').select('*');
  if (teamId) {
    query = query.eq('team_id', teamId);
  } else if (registrationId) {
    query = query.eq('registration_id', registrationId);
  }

  const { data: pay } = await query.order('submitted_at', { ascending: false }).limit(1).maybeSingle();
  if (pay) return pay;

  if (sqliteDb && (teamId || registrationId)) {
    try {
      const row = sqliteDb.prepare(`
        SELECT * FROM payments 
        WHERE (team_id IS NOT NULL AND team_id = ?) OR (registration_id IS NOT NULL AND registration_id = ?)
        ORDER BY submitted_at DESC LIMIT 1
      `).get(teamId || '', registrationId || '');
      if (row) return row;
    } catch (e) {}
  }

  return null;
}

/**
 * Record referral into team_referrals table
 */
async function saveTeamReferralRecord({ teamId, teamName, registrationId, referral }) {
  if (!teamName) return;
  const cleanReferral = referral && typeof referral === 'string' && referral.trim() ? referral.trim() : null;
  if (!cleanReferral) return;

  // 1. Supabase team_referrals table
  try {
    await supabase.from('team_referrals').insert([{
      team_id: teamId || null,
      team_name: teamName.trim(),
      registration_id: registrationId || null,
      referral: cleanReferral
    }]);
  } catch (err) {}

  // 2. Set referral in vit_teams and non_vit_teams
  if (teamId) {
    try {
      await supabase.from('vit_teams').update({ referral: cleanReferral }).eq('id', teamId);
      await supabase.from('non_vit_teams').update({ referral: cleanReferral }).eq('id', teamId);
    } catch (e) {}
  }

  // 3. SQLite
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
    } catch (sqlErr) {}
  }
}

async function getTeamReferral(teamId, teamName) {
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

  return '';
}

async function getAllTeamReferrals() {
  try {
    const { data, error } = await supabase.from('team_referrals').select('*').order('created_at', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) return data;
  } catch (e) {}

  if (sqliteDb) {
    try {
      return sqliteDb.prepare('SELECT * FROM team_referrals ORDER BY created_at DESC').all();
    } catch (e) {}
  }
  return [];
}

async function syncDedicatedTables(teamId) {
  // Synchronizer hook
  return true;
}

async function getVitTeams() {
  try {
    const { data, error } = await supabase.from('vit_teams').select('*').order('created_at', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) return data;
  } catch (e) {}
  if (sqliteDb) {
    try {
      return sqliteDb.prepare('SELECT * FROM vit_teams ORDER BY created_at DESC').all();
    } catch (e) {}
  }
  const all = await getAllTeams({ onlyCompleted: false });
  return all.filter(t => (t.teamType || 'VIT').toUpperCase() !== 'NON_VIT');
}

async function getNonVitTeams() {
  try {
    const { data, error } = await supabase.from('non_vit_teams').select('*').order('created_at', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) return data;
  } catch (e) {}
  if (sqliteDb) {
    try {
      return sqliteDb.prepare('SELECT * FROM non_vit_teams ORDER BY created_at DESC').all();
    } catch (e) {}
  }
  const all = await getAllTeams({ onlyCompleted: false });
  return all.filter(t => (t.teamType || '').toUpperCase() === 'NON_VIT');
}

async function getAllParticipants() {
  try {
    const { data, error } = await supabase.from('all_participants').select('*').order('created_at', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) return data;
  } catch (e) {}
  if (sqliteDb) {
    try {
      return sqliteDb.prepare('SELECT * FROM all_participants ORDER BY created_at DESC').all();
    } catch (e) {}
  }
  return [];
}

function generateRegistrationId() {
  const randomDigits = Math.floor(10000 + Math.random() * 90000);
  return `CV26-TM-${randomDigits}`;
}

/**
 * Get single team by Registration ID (for Track, Resumed session, Admin inspect, etc.)
 */
async function getTeamByRegistrationId(registrationId) {
  if (!registrationId) return null;
  const raw = await getRawTeam({ registrationId: registrationId.trim() });
  if (!raw) return null;

  const [members, payment] = await Promise.all([
    getMembersForTeam(raw.teamRow.id, raw.teamRow.registration_id),
    getPaymentForTeam(raw.teamRow.id, raw.teamRow.registration_id)
  ]);

  return buildFullTeamObject(raw.teamRow, members, payment, raw.isNonVit);
}

/**
 * Get team by email address of any participant
 */
async function getTeamByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check all_participants
  const { data: part } = await supabase.from('all_participants')
    .select('registration_id')
    .ilike('college_email', cleanEmail)
    .limit(1)
    .maybeSingle();

  if (part && part.registration_id) {
    return await getTeamByRegistrationId(part.registration_id);
  }

  // 2. Check vit_teams leader_email
  const { data: vTeam } = await supabase.from('vit_teams')
    .select('registration_id')
    .ilike('leader_email', cleanEmail)
    .limit(1)
    .maybeSingle();
  if (vTeam && vTeam.registration_id) {
    return await getTeamByRegistrationId(vTeam.registration_id);
  }

  // 3. Check non_vit_teams leader_email
  const { data: nvTeam } = await supabase.from('non_vit_teams')
    .select('registration_id')
    .ilike('leader_email', cleanEmail)
    .limit(1)
    .maybeSingle();
  if (nvTeam && nvTeam.registration_id) {
    return await getTeamByRegistrationId(nvTeam.registration_id);
  }

  // 4. Fallback to SQLite
  if (sqliteDb) {
    try {
      const row = sqliteDb.prepare('SELECT registration_id FROM all_participants WHERE LOWER(college_email) = ? LIMIT 1').get(cleanEmail);
      if (row && row.registration_id) return await getTeamByRegistrationId(row.registration_id);
    } catch (e) {}
  }

  return null;
}

/**
 * Lookup pending team by identifier (email or registration ID)
 */
async function getPendingTeam(identifier) {
  if (!identifier) return null;
  const clean = identifier.trim();
  if (clean.includes('@')) {
    return await getTeamByEmail(clean);
  }
  let team = await getTeamByRegistrationId(clean.toUpperCase());
  if (!team) {
    team = await getTeamByRegistrationId(clean);
  }
  return team;
}

/**
 * Create a new team in dedicated tables (vit_teams or non_vit_teams, and all_participants)
 */
async function createTeam({ teamName, track, projectTitle, members, referral, teamType = 'VIT', hasFood = false, foodCount = 0, foodAmount = 0, totalFee = 250 }) {
  if (!Array.isArray(members) || members.length < 2 || members.length > 5) {
    throw new Error('A team must have between 2 and 5 members (1 Team Leader + 1 to 4 Members).');
  }
  const leaderCount = members.filter(m => m.isLeader).length;
  if (leaderCount !== 1) throw new Error('Exactly one member must be designated as the Team Leader.');
  if (!members[0].isLeader) throw new Error('The Team Leader details must be entered first.');

  const isNonVit = teamType === 'NON_VIT';

  // Ensure regNumber exists for every member (generate unique ID for externals if not provided)
  members.forEach((m) => {
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

  // Cross-team check in all_participants
  for (const m of members) {
    const cleanEmail = m.collegeEmail.trim().toLowerCase();
    const cleanReg = (m.regNumber || '').trim().toUpperCase();

    const { data: existingEmailData } = await supabase.from('all_participants')
      .select('college_email, team_name, registration_id, payment_status')
      .ilike('college_email', cleanEmail)
      .limit(1)
      .maybeSingle();

    if (existingEmailData) {
      if (existingEmailData.payment_status === 'PENDING_PAYMENT') {
        console.log(`[DB] Clearing unpaid incomplete draft ${existingEmailData.registration_id} for email ${cleanEmail}`);
        await deleteTeam(existingEmailData.registration_id);
      } else {
        throw new Error(`The email "${m.collegeEmail}" is already registered in team "${existingEmailData.team_name}". A student can only be part of one team.`);
      }
    }

    if (cleanReg && !cleanReg.startsWith('EXT-')) {
      const { data: existingRegData } = await supabase.from('all_participants')
        .select('reg_number, team_name, registration_id, payment_status')
        .ilike('reg_number', cleanReg)
        .limit(1)
        .maybeSingle();

      if (existingRegData) {
        if (existingRegData.payment_status === 'PENDING_PAYMENT') {
          console.log(`[DB] Clearing unpaid incomplete draft ${existingRegData.registration_id} for reg ${cleanReg}`);
          await deleteTeam(existingRegData.registration_id);
        } else {
          throw new Error(`The registration number "${m.regNumber}" is already registered in team "${existingRegData.team_name}". A student can only be part of one team.`);
        }
      }
    }
  }

  // Check team name uniqueness in vit_teams and non_vit_teams
  const [{ data: vCollision }, { data: nvCollision }] = await Promise.all([
    supabase.from('vit_teams').select('id, status, registration_id').ilike('team_name', teamName.trim()).limit(1).maybeSingle(),
    supabase.from('non_vit_teams').select('id, status, registration_id').ilike('team_name', teamName.trim()).limit(1).maybeSingle()
  ]);
  const collision = vCollision || nvCollision;
  if (collision) {
    if (collision.status === 'PENDING_PAYMENT') {
      console.log(`[DB] Clearing unpaid incomplete draft ${collision.registration_id} with same team name`);
      await deleteTeam(collision.registration_id);
    } else {
      throw new Error(`Team name "${teamName}" is already taken.`);
    }
  }

  // Generate unique Registration ID
  let registrationId;
  while (true) {
    registrationId = generateRegistrationId();
    const [c1, c2] = await Promise.all([
      supabase.from('vit_teams').select('id').eq('registration_id', registrationId).limit(1).maybeSingle(),
      supabase.from('non_vit_teams').select('id').eq('registration_id', registrationId).limit(1).maybeSingle()
    ]);
    if (!c1.data && !c2.data) break;
  }

  const cleanReferral = referral && typeof referral === 'string' && referral.trim() ? referral.trim() : null;
  const leader = members.find(m => m.isLeader) || members[0];
  const newTeamId = crypto.randomUUID ? crypto.randomUUID() : `tm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  let teamRow = null;

  if (isNonVit) {
    const payload = {
      id: newTeamId,
      registration_id: registrationId,
      team_name: teamName.trim(),
      track: track || 'Open Innovation',
      project_title: projectTitle || '',
      member_count: members.length,
      status: 'PENDING_PAYMENT',
      leader_name: leader.fullName.trim(),
      leader_college_name: leader.collegeName || 'External College',
      leader_email: leader.collegeEmail.trim().toLowerCase(),
      leader_phone: leader.phone.trim(),
      leader_year_of_study: leader.yearOfStudy || '',
      leader_degree: leader.degree || '',
      has_food: Boolean(hasFood),
      food_count: Number(foodCount) || 0,
      food_amount: Number(foodAmount) || 0,
      total_fee: Number(totalFee) || 250,
      referral: cleanReferral,
      payment_status: 'PENDING_PAYMENT',
      created_at: now,
      updated_at: now
    };
    const { data, error } = await supabase.from('non_vit_teams').insert([payload]).select().single();
    if (error) throw new Error('Failed to create non-VIT team: ' + error.message);
    teamRow = data;
  } else {
    const payload = {
      id: newTeamId,
      registration_id: registrationId,
      team_name: teamName.trim(),
      track: track || 'Open Innovation',
      project_title: projectTitle || '',
      member_count: members.length,
      status: 'PENDING_PAYMENT',
      leader_name: leader.fullName.trim(),
      leader_reg_number: (leader.regNumber || '').trim().toUpperCase(),
      leader_email: leader.collegeEmail.trim().toLowerCase(),
      leader_phone: leader.phone.trim(),
      leader_residence_type: leader.residenceType || 'HOSTELLER',
      leader_hostel_block: leader.hostelBlock || '',
      leader_room_no: leader.roomNo || '',
      leader_day_scholar_location: leader.dayScholarLocation || '',
      referral: cleanReferral,
      total_fee: Number(totalFee) || 250,
      payment_status: 'PENDING_PAYMENT',
      created_at: now,
      updated_at: now
    };
    const { data, error } = await supabase.from('vit_teams').insert([payload]).select().single();
    if (error) throw new Error('Failed to create VIT team: ' + error.message);
    teamRow = data;
  }

  // Insert all members into all_participants
  const participantsToInsert = members.map(m => ({
    id: crypto.randomUUID ? crypto.randomUUID() : `part_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    team_id: newTeamId,
    registration_id: registrationId,
    team_name: teamName.trim(),
    category: isNonVit ? 'NON_VIT' : 'VIT',
    is_leader: Boolean(m.isLeader),
    role: m.isLeader ? 'Leader' : 'Member',
    full_name: m.fullName.trim(),
    college_name: isNonVit ? (m.collegeName || 'External College') : 'VIT Bhopal University',
    reg_number: (m.regNumber || '').trim().toUpperCase(),
    college_email: m.collegeEmail.trim().toLowerCase(),
    phone: m.phone.trim(),
    year_of_study: m.yearOfStudy || '',
    degree: m.degree || '',
    residence_type: m.residenceType || 'HOSTELLER',
    hostel_block: m.hostelBlock || '',
    room_no: m.roomNo || '',
    day_scholar_location: m.dayScholarLocation || '',
    residence_address: m.residenceAddress || '',
    wants_food: Boolean(m.wantsFood),
    payment_status: 'PENDING_PAYMENT',
    created_at: now
  }));

  const { error: partErr } = await supabase.from('all_participants').insert(participantsToInsert);
  if (partErr) {
    console.error('[DB] Insert all_participants notice:', partErr.message);
  }

  // Record referral in team_referrals
  if (cleanReferral) {
    await saveTeamReferralRecord({
      teamId: newTeamId,
      teamName: teamName.trim(),
      registrationId,
      referral: cleanReferral
    });
  }

  // Sync to local SQLite
  if (sqliteDb) {
    try {
      const targetTable = isNonVit ? 'non_vit_teams' : 'vit_teams';
      if (isNonVit) {
        sqliteDb.prepare(`
          INSERT INTO non_vit_teams (id, registration_id, team_name, track, project_title, member_count, status, leader_name, leader_college_name, leader_email, leader_phone, leader_year_of_study, leader_degree, has_food, food_count, food_amount, total_fee, referral, payment_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newTeamId, registrationId, teamName.trim(), track || 'Open Innovation', projectTitle || '', members.length, 'PENDING_PAYMENT', leader.fullName.trim(), leader.collegeName || 'External College', leader.collegeEmail.trim().toLowerCase(), leader.phone.trim(), leader.yearOfStudy || '', leader.degree || '', hasFood ? 1 : 0, foodCount || 0, foodAmount || 0, totalFee || 250, cleanReferral || '', 'PENDING_PAYMENT', now, now);
      } else {
        sqliteDb.prepare(`
          INSERT INTO vit_teams (id, registration_id, team_name, track, project_title, member_count, status, leader_name, leader_reg_number, leader_email, leader_phone, leader_residence_type, leader_hostel_block, leader_room_no, leader_day_scholar_location, referral, total_fee, payment_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newTeamId, registrationId, teamName.trim(), track || 'Open Innovation', projectTitle || '', members.length, 'PENDING_PAYMENT', leader.fullName.trim(), (leader.regNumber || '').trim().toUpperCase(), leader.collegeEmail.trim().toLowerCase(), leader.phone.trim(), leader.residenceType || 'HOSTELLER', leader.hostelBlock || '', leader.roomNo || '', leader.dayScholarLocation || '', cleanReferral || '', totalFee || 250, 'PENDING_PAYMENT', now, now);
      }

      for (const p of participantsToInsert) {
        sqliteDb.prepare(`
          INSERT INTO all_participants (id, team_id, registration_id, team_name, category, is_leader, role, full_name, college_name, reg_number, college_email, phone, year_of_study, degree, residence_type, hostel_block, room_no, day_scholar_location, residence_address, wants_food, payment_status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(p.id, p.team_id, p.registration_id, p.team_name, p.category, p.is_leader ? 1 : 0, p.role, p.full_name, p.college_name, p.reg_number, p.college_email, p.phone, p.year_of_study, p.degree, p.residence_type, p.hostel_block, p.room_no, p.day_scholar_location, p.residence_address, p.wants_food ? 1 : 0, p.payment_status, p.created_at);
      }
    } catch (sqlErr) {
      console.warn('[DB] SQLite createTeam sync notice:', sqlErr.message);
    }
  }

  return await getTeamByRegistrationId(registrationId);
}

/**
 * Update squad details and roster (used by Edit Details modal and student updates)
 */
async function updateTeamDetails({ registrationId, teamName, track, projectTitle, members, referral }) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error(`Team ${registrationId} not found.`);

  if (teamName && teamName.trim().toLowerCase() !== team.teamName.toLowerCase()) {
    const [{ data: vCollision }, { data: nvCollision }] = await Promise.all([
      supabase.from('vit_teams').select('id').ilike('team_name', teamName.trim()).neq('id', team.id).limit(1).maybeSingle(),
      supabase.from('non_vit_teams').select('id').ilike('team_name', teamName.trim()).neq('id', team.id).limit(1).maybeSingle()
    ]);
    if (vCollision || nvCollision) throw new Error(`Team name "${teamName}" is already taken.`);
  }

  const cleanReferral = referral !== undefined ? (referral && typeof referral === 'string' && referral.trim() ? referral.trim() : null) : undefined;
  const targetTable = team.teamType === 'NON_VIT' ? 'non_vit_teams' : 'vit_teams';
  const now = new Date().toISOString();

  const updateFields = {
    team_name: teamName ? teamName.trim() : team.teamName,
    track: track || team.track,
    project_title: projectTitle || team.projectTitle,
    updated_at: now
  };
  if (cleanReferral !== undefined) {
    updateFields.referral = cleanReferral;
  }

  await supabase.from(targetTable).update(updateFields).eq('id', team.id);

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

    // Check duplicate cross-team
    for (const m of members) {
      const cleanEmail = m.collegeEmail.trim().toLowerCase();
      const cleanReg = (m.regNumber || '').trim().toUpperCase();

      const { data: existingByEmail } = await supabase.from('all_participants')
        .select('team_id')
        .ilike('college_email', cleanEmail)
        .neq('team_id', team.id)
        .limit(1)
        .maybeSingle();
      if (existingByEmail) throw new Error(`The email "${m.collegeEmail}" is already registered in another team.`);

      if (cleanReg && !cleanReg.startsWith('EXT-')) {
        const { data: existingByReg } = await supabase.from('all_participants')
          .select('team_id')
          .ilike('reg_number', cleanReg)
          .neq('team_id', team.id)
          .limit(1)
          .maybeSingle();
        if (existingByReg) throw new Error(`The registration number "${m.regNumber}" is already registered in another team.`);
      }
    }

    // Delete existing members from all_participants
    await supabase.from('all_participants').delete().eq('team_id', team.id);

    const isNonVit = team.teamType === 'NON_VIT';
    const participantsToInsert = members.map(m => ({
      id: crypto.randomUUID ? crypto.randomUUID() : `part_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      team_id: team.id,
      registration_id: team.registrationId,
      team_name: updateFields.team_name,
      category: isNonVit ? 'NON_VIT' : 'VIT',
      is_leader: Boolean(m.isLeader),
      role: m.isLeader ? 'Leader' : 'Member',
      full_name: m.fullName.trim(),
      college_name: isNonVit ? (m.collegeName || 'External College') : 'VIT Bhopal University',
      reg_number: (m.regNumber || '').trim().toUpperCase(),
      college_email: m.collegeEmail.trim().toLowerCase(),
      phone: m.phone.trim(),
      year_of_study: m.yearOfStudy || '',
      degree: m.degree || '',
      residence_type: m.residenceType || 'HOSTELLER',
      hostel_block: m.hostelBlock || '',
      room_no: m.roomNo || '',
      day_scholar_location: m.dayScholarLocation || '',
      residence_address: m.residenceAddress || '',
      wants_food: Boolean(m.wantsFood),
      payment_status: team.status,
      created_at: now
    }));

    await supabase.from('all_participants').insert(participantsToInsert);

    // Update leader details and member count in team table
    const leader = members.find(m => m.isLeader) || members[0];
    const leaderUpdate = {
      member_count: members.length,
      leader_name: leader.fullName.trim(),
      leader_email: leader.collegeEmail.trim().toLowerCase(),
      leader_phone: leader.phone.trim(),
      updated_at: now
    };
    if (isNonVit) {
      leaderUpdate.leader_college_name = leader.collegeName || 'External College';
      leaderUpdate.leader_year_of_study = leader.yearOfStudy || '';
      leaderUpdate.leader_degree = leader.degree || '';
    } else {
      leaderUpdate.leader_reg_number = (leader.regNumber || '').trim().toUpperCase();
      leaderUpdate.leader_residence_type = leader.residenceType || 'HOSTELLER';
      leaderUpdate.leader_hostel_block = leader.hostelBlock || '';
      leaderUpdate.leader_room_no = leader.roomNo || '';
      leaderUpdate.leader_day_scholar_location = leader.dayScholarLocation || '';
    }
    await supabase.from(targetTable).update(leaderUpdate).eq('id', team.id);
  }

  return await getTeamByRegistrationId(registrationId);
}

/**
 * Submit payment (UTR, receipt image, amount)
 */
async function submitPayment({ registrationId, paymentMethod, utrNumber, transactionDate, amountPaid, proofFilePath }) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error(`Team with Registration ID "${registrationId}" not found.`);

  if (!utrNumber || utrNumber.trim().length < 4) throw new Error('Valid Transaction ID / UTR Number is required.');

  const { data: existingUtr } = await supabase.from('payments')
    .select('registration_id')
    .eq('utr_number', utrNumber.trim())
    .neq('team_id', team.id)
    .limit(1)
    .maybeSingle();

  if (existingUtr) {
    throw new Error(`Transaction ID/UTR "${utrNumber}" has already been submitted for another team.`);
  }

  const { data: existingPayment } = await supabase.from('payments')
    .select('id')
    .eq('team_id', team.id)
    .limit(1)
    .maybeSingle();

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
      id: crypto.randomUUID ? crypto.randomUUID() : `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      team_id: team.id,
      registration_id: team.registrationId,
      payment_method: paymentMethod,
      utr_number: utrNumber.trim(),
      transaction_date: transactionDate || now.split('T')[0],
      amount_paid: resolvedAmount,
      proof_file_path: proofFilePath || null,
      status: 'PENDING',
      submitted_at: now
    }]);
    if (insertError) throw new Error('Failed to insert payment: ' + insertError.message);
  }

  const targetTable = team.teamType === 'NON_VIT' ? 'non_vit_teams' : 'vit_teams';
  await supabase.from(targetTable).update({
    status: 'PENDING_VERIFICATION',
    payment_status: 'PENDING_VERIFICATION',
    utr_number: utrNumber.trim(),
    updated_at: now
  }).eq('id', team.id);

  await supabase.from('all_participants').update({
    payment_status: 'PENDING_VERIFICATION'
  }).eq('team_id', team.id);

  return await getTeamByRegistrationId(registrationId);
}

/**
 * Get all teams for Admin Dashboard & Exports
 */
async function getAllTeams({ status = 'ALL', search = '', onlyCompleted = true } = {}) {
  // Fetch all data in parallel
  const [vRes, nvRes, partsRes, paysRes] = await Promise.all([
    supabase.from('vit_teams').select('*').order('created_at', { ascending: false }),
    supabase.from('non_vit_teams').select('*').order('created_at', { ascending: false }),
    supabase.from('all_participants').select('*'),
    supabase.from('payments').select('*')
  ]);

  const vitRows = vRes.data || [];
  const nonVitRows = nvRes.data || [];
  const allParts = partsRes.data || [];
  const allPays = paysRes.data || [];

  // Index participants and payments by team_id
  const partsByTeamId = {};
  for (const p of allParts) {
    if (!partsByTeamId[p.team_id]) partsByTeamId[p.team_id] = [];
    partsByTeamId[p.team_id].push(p);
  }

  const paysByTeamId = {};
  for (const pay of allPays) {
    paysByTeamId[pay.team_id] = pay;
  }

  const allCombined = [];

  for (const r of vitRows) {
    const mems = partsByTeamId[r.id] || [];
    const pay = paysByTeamId[r.id] || null;
    allCombined.push(buildFullTeamObject(r, mems, pay, false));
  }

  for (const r of nonVitRows) {
    const mems = partsByTeamId[r.id] || [];
    const pay = paysByTeamId[r.id] || null;
    allCombined.push(buildFullTeamObject(r, mems, pay, true));
  }

  // Filter according to arguments
  let filtered = allCombined;

  if (onlyCompleted) {
    filtered = filtered.filter(t => t.status !== 'PENDING_PAYMENT');
  }

  if (status && status !== 'ALL') {
    filtered = filtered.filter(t => t.status === status);
  }

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    filtered = filtered.filter(t => {
      const regMatch = (t.registrationId || '').toLowerCase().includes(s);
      const nameMatch = (t.teamName || '').toLowerCase().includes(s);
      const trackMatch = (t.track || '').toLowerCase().includes(s);
      const leaderMatch = (t.leader?.fullName || '').toLowerCase().includes(s) || (t.leader?.collegeEmail || '').toLowerCase().includes(s);
      return regMatch || nameMatch || trackMatch || leaderMatch;
    });
  }

  return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Update verification / rejection status (Admin action)
 */
async function updatePaymentStatus({ registrationId, status, adminNotes = '', verifiedBy = 'Admin' }) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error('Team not found');

  const now = new Date().toISOString();
  const paymentStatus = status.toUpperCase() === 'VERIFIED' ? 'VERIFIED' : status.toUpperCase() === 'REJECTED' ? 'REJECTED' : 'PENDING';
  const teamStatus = status.toUpperCase() === 'VERIFIED' ? 'VERIFIED' : status.toUpperCase() === 'REJECTED' ? 'REJECTED' : 'PENDING_VERIFICATION';

  const { data: existingPayment } = await supabase.from('payments').select('id').eq('team_id', team.id).limit(1).maybeSingle();
  if (existingPayment) {
    await supabase.from('payments').update({
      status: paymentStatus,
      admin_notes: adminNotes,
      verified_at: paymentStatus === 'VERIFIED' ? now : null,
      verified_by: paymentStatus === 'VERIFIED' ? verifiedBy : null
    }).eq('id', existingPayment.id);
  }

  const targetTable = team.teamType === 'NON_VIT' ? 'non_vit_teams' : 'vit_teams';
  await supabase.from(targetTable).update({
    status: teamStatus,
    payment_status: paymentStatus,
    updated_at: now
  }).eq('id', team.id);

  await supabase.from('all_participants').update({
    payment_status: teamStatus
  }).eq('team_id', team.id);

  return await getTeamByRegistrationId(registrationId);
}

/**
 * Permanently delete a team registration (Admin action)
 */
async function deleteTeam(registrationId) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error('Team not found');

  await Promise.all([
    supabase.from('payments').delete().eq('team_id', team.id),
    supabase.from('all_participants').delete().eq('team_id', team.id),
    supabase.from('team_referrals').delete().eq('team_id', team.id),
    supabase.from('vit_teams').delete().eq('id', team.id),
    supabase.from('non_vit_teams').delete().eq('id', team.id)
  ]);

  if (sqliteDb) {
    try {
      sqliteDb.prepare('DELETE FROM payments WHERE team_id = ?').run(team.id);
      sqliteDb.prepare('DELETE FROM all_participants WHERE team_id = ?').run(team.id);
      sqliteDb.prepare('DELETE FROM team_referrals WHERE team_id = ?').run(team.id);
      sqliteDb.prepare('DELETE FROM vit_teams WHERE id = ?').run(team.id);
      sqliteDb.prepare('DELETE FROM non_vit_teams WHERE id = ?').run(team.id);
    } catch (e) {}
  }

  return true;
}

/**
 * Admin override: update team, roster, or payment details
 */
async function adminUpdateTeam({ registrationId, teamName, track, projectTitle, status, members, payment, referral, teamType, hasFood, foodCount, foodAmount, totalFee }) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error('Team not found');

  const now = new Date().toISOString();
  const targetTable = (teamType || team.teamType) === 'NON_VIT' ? 'non_vit_teams' : 'vit_teams';

  const updateFields = {
    team_name: teamName ? teamName.trim() : team.teamName,
    track: track || team.track,
    project_title: projectTitle || team.projectTitle,
    status: status || team.status,
    updated_at: now
  };
  if (hasFood !== undefined) updateFields.has_food = Boolean(hasFood);
  if (foodCount !== undefined) updateFields.food_count = Number(foodCount) || 0;
  if (foodAmount !== undefined) updateFields.food_amount = Number(foodAmount) || 0;
  if (totalFee !== undefined) updateFields.total_fee = Number(totalFee) || 250;
  if (referral !== undefined) updateFields.referral = referral ? referral.trim() : null;

  await supabase.from(targetTable).update(updateFields).eq('id', team.id);

  if (referral !== undefined) {
    await saveTeamReferralRecord({
      teamId: team.id,
      teamName: updateFields.team_name,
      registrationId: team.registrationId,
      referral: referral ? referral.trim() : null
    });
  }

  if (members && Array.isArray(members) && members.length > 0) {
    await supabase.from('all_participants').delete().eq('team_id', team.id);

    const isNonVit = (teamType || team.teamType) === 'NON_VIT';
    const participantsToInsert = members.map(m => ({
      id: crypto.randomUUID ? crypto.randomUUID() : `part_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      team_id: team.id,
      registration_id: team.registrationId,
      team_name: updateFields.team_name,
      category: isNonVit ? 'NON_VIT' : 'VIT',
      is_leader: Boolean(m.isLeader),
      role: m.isLeader ? 'Leader' : 'Member',
      full_name: m.fullName.trim(),
      college_name: isNonVit ? (m.collegeName || 'External College') : 'VIT Bhopal University',
      reg_number: (m.regNumber || '').trim().toUpperCase(),
      college_email: m.collegeEmail.trim().toLowerCase(),
      phone: m.phone.trim(),
      year_of_study: m.yearOfStudy || '',
      degree: m.degree || '',
      residence_type: m.residenceType || 'HOSTELLER',
      hostel_block: m.hostelBlock || '',
      room_no: m.roomNo || '',
      day_scholar_location: m.dayScholarLocation || '',
      residence_address: m.residenceAddress || '',
      wants_food: Boolean(m.wantsFood),
      payment_status: status || team.status,
      created_at: now
    }));

    await supabase.from('all_participants').insert(participantsToInsert);
    await supabase.from(targetTable).update({ member_count: members.length }).eq('id', team.id);
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

  return await getTeamByRegistrationId(registrationId);
}

/**
 * Aggregate metrics for Admin Dashboard
 */
async function getMetrics() {
  const [vRes, nvRes, paysRes] = await Promise.all([
    supabase.from('vit_teams').select('status, total_fee'),
    supabase.from('non_vit_teams').select('status, total_fee'),
    supabase.from('payments').select('amount_paid, status')
  ]);

  const vitTeams = vRes.data || [];
  const nonVitTeams = nvRes.data || [];
  const payments = paysRes.data || [];

  const allTeams = [...vitTeams, ...nonVitTeams];

  let totalTeams = 0;
  let pendingVerification = 0;
  let verified = 0;
  let rejected = 0;
  let totalRevenue = 0;

  for (const t of allTeams) {
    if (t.status === 'PENDING_PAYMENT') continue;
    totalTeams++;
    if (t.status === 'PENDING_VERIFICATION') pendingVerification++;
    if (t.status === 'VERIFIED') verified++;
    if (t.status === 'REJECTED') rejected++;
  }

  for (const p of payments) {
    if (p.status === 'VERIFIED') {
      totalRevenue += Number(p.amount_paid) || 0;
    }
  }

  return {
    totalTeams,
    pendingVerification,
    verified,
    verifiedTeams: verified,
    rejected,
    totalRevenue
  };
}

/**
 * App Settings & Deadlines (app_settings table)
 */
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
  const val = isoDateString ? new Date(isoDateString).toISOString() : null;
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
