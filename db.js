const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase URL or Key is missing. Check your .env file.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper functions to map Supabase snake_case to app camelCase
function mapTeam(row) {
  if (!row) return null;
  return {
    id: row.id,
    registrationId: row.registration_id,
    teamName: row.team_name,
    track: row.track,
    projectTitle: row.project_title,
    memberCount: row.member_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    fullName: row.full_name,
    regNumber: row.reg_number,
    collegeEmail: row.college_email,
    phone: row.phone,
    isLeader: row.is_leader === true || row.is_leader === 'true' || row.is_leader === 1,
    createdAt: row.created_at
  };
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

async function createTeam({ teamName, track, projectTitle, members }) {
  if (!Array.isArray(members) || members.length !== 4) throw new Error('A team must have exactly 4 members (1 Team Leader + 3 Members).');
  const leaderCount = members.filter(m => m.isLeader).length;
  if (leaderCount !== 1) throw new Error('Exactly one member must be designated as the Team Leader.');
  if (!members[0].isLeader) throw new Error('The Team Leader details must be entered first.');

  const emails = new Set();
  const regNumbers = new Set();
  for (const m of members) {
    if (!m.fullName || !m.regNumber || !m.collegeEmail || !m.phone) throw new Error('All member fields are required.');
    const cleanEmail = m.collegeEmail.trim().toLowerCase();
    const cleanReg = m.regNumber.trim().toUpperCase();
    if (emails.has(cleanEmail)) throw new Error(`Duplicate college email in team: ${m.collegeEmail}`);
    if (regNumbers.has(cleanReg)) throw new Error(`Duplicate registration number in team: ${m.regNumber}`);
    emails.add(cleanEmail);
    regNumbers.add(cleanReg);
  }

  // Cross-team check
  for (const m of members) {
    const cleanEmail = m.collegeEmail.trim().toLowerCase();
    const cleanReg = m.regNumber.trim().toUpperCase();

    const { data: existingEmailData } = await supabase.from('team_members').select('college_email, teams(team_name, registration_id)').ilike('college_email', cleanEmail).limit(1).single();
    if (existingEmailData) throw new Error(`The email "${m.collegeEmail}" is already registered. A student can only be part of one team.`);

    const { data: existingRegData } = await supabase.from('team_members').select('reg_number, teams(team_name, registration_id)').ilike('reg_number', cleanReg).limit(1).single();
    if (existingRegData) throw new Error(`The registration number "${m.regNumber}" is already registered. A student can only be part of one team.`);
  }

  const { data: existingTeam } = await supabase.from('teams').select('id').ilike('team_name', teamName.trim()).limit(1).single();
  if (existingTeam) throw new Error(`Team name "${teamName}" is already taken.`);

  let registrationId;
  while (true) {
    registrationId = generateRegistrationId();
    const { data: collision } = await supabase.from('teams').select('id').eq('registration_id', registrationId).limit(1).maybeSingle();
    if (!collision) break;
  }

  const { data: team, error: teamError } = await supabase.from('teams').insert([{
    registration_id: registrationId,
    team_name: teamName.trim(),
    track: track || 'Open Innovation',
    project_title: projectTitle || '',
    member_count: members.length,
    status: 'PENDING_PAYMENT'
  }]).select().single();

  if (teamError) throw new Error('Failed to create team: ' + teamError.message);

  const membersToInsert = members.map(m => ({
    team_id: team.id,
    full_name: m.fullName.trim(),
    reg_number: m.regNumber.trim().toUpperCase(),
    college_email: m.collegeEmail.trim().toLowerCase(),
    phone: m.phone.trim(),
    is_leader: m.isLeader
  }));

  const { error: membersError } = await supabase.from('team_members').insert(membersToInsert);
  if (membersError) throw new Error('Failed to add members: ' + membersError.message);

  return await getTeamByRegistrationId(registrationId);
}

async function getTeamByRegistrationId(registrationId) {
  const { data: team } = await supabase.from('teams').select('*').eq('registration_id', registrationId).limit(1).maybeSingle();
  if (!team) return null;

  const { data: members } = await supabase.from('team_members').select('*').eq('team_id', team.id).order('is_leader', { ascending: false }).order('created_at', { ascending: true });
  const { data: payment } = await supabase.from('payments').select('*').eq('team_id', team.id).limit(1).maybeSingle();

  const mappedMembers = (members || []).map(mapMember);
  return {
    ...mapTeam(team),
    members: mappedMembers,
    leader: mappedMembers.find(m => m.isLeader) || mappedMembers[0] || null,
    payment: mapPayment(payment)
  };
}

async function updateTeamDetails({ registrationId, teamName, track, projectTitle, members }) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error(`Team ${registrationId} not found.`);

  if (teamName && teamName.trim().toLowerCase() !== team.teamName.toLowerCase()) {
    const { data: existing } = await supabase.from('teams').select('id').ilike('team_name', teamName.trim()).limit(1).maybeSingle();
    if (existing) throw new Error(`Team name "${teamName}" is already taken.`);
  }

  await supabase.from('teams').update({
    team_name: teamName ? teamName.trim() : team.teamName,
    track: track || team.track,
    project_title: projectTitle || team.projectTitle,
    updated_at: new Date().toISOString()
  }).eq('id', team.id);

  if (members && Array.isArray(members) && members.length > 0) {
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

    const membersToInsert = members.map(m => ({
      team_id: team.id,
      full_name: m.fullName.trim(),
      reg_number: m.regNumber.trim().toUpperCase(),
      college_email: m.collegeEmail.trim().toLowerCase(),
      phone: m.phone.trim(),
      is_leader: m.isLeader
    }));

    await supabase.from('team_members').insert(membersToInsert);
    await supabase.from('teams').update({ member_count: members.length }).eq('id', team.id);
  }

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

  if (existingPayment) {
    const updateData = {
      payment_method: paymentMethod,
      utr_number: utrNumber.trim(),
      transaction_date: transactionDate || now.split('T')[0],
      amount_paid: Number(amountPaid) || 400,
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
      amount_paid: Number(amountPaid) || 400,
      proof_file_path: proofFilePath || null,
      status: 'PENDING'
    }]);
    if (insertError) throw new Error('Failed to insert payment: ' + insertError.message);
  }

  const { error: teamUpdateError } = await supabase.from('teams').update({ status: 'PENDING_VERIFICATION', updated_at: now }).eq('id', team.id);
  if (teamUpdateError) throw new Error('Failed to update team status: ' + teamUpdateError.message);

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
    
    const mappedMembers = (members || []).map(mapMember);
    teams.push({
      ...mapTeam(teamData),
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

  return await getTeamByRegistrationId(registrationId);
}

async function deleteTeam(registrationId) {
  const team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error('Team not found');
  await supabase.from('teams').delete().eq('id', team.id);
  return true;
}

async function adminUpdateTeam({ registrationId, teamName, track, projectTitle, status, members, payment }) {
  let team = await getTeamByRegistrationId(registrationId);
  if (!team) throw new Error('Team not found');

  if (teamName && teamName.trim().toLowerCase() !== team.teamName.toLowerCase()) {
    const { data: existing } = await supabase.from('teams').select('id').ilike('team_name', teamName.trim()).limit(1).maybeSingle();
    if (existing) throw new Error(`Team name "${teamName}" is already taken.`);
  }

  await supabase.from('teams').update({
    team_name: teamName ? teamName.trim() : team.teamName,
    track: track || team.track,
    project_title: projectTitle || team.projectTitle,
    status: status || team.status,
    updated_at: new Date().toISOString()
  }).eq('id', team.id);

  if (members && Array.isArray(members) && members.length > 0) {
    await supabase.from('team_members').delete().eq('team_id', team.id);
    const membersToInsert = members.map(m => ({
      team_id: team.id,
      full_name: m.fullName.trim(),
      reg_number: m.regNumber.trim().toUpperCase(),
      college_email: m.collegeEmail.trim().toLowerCase(),
      phone: m.phone.trim(),
      is_leader: m.isLeader
    }));
    await supabase.from('team_members').insert(membersToInsert);
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
  isRegistrationDeadlinePassed
};
