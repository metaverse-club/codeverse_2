const ExcelJS = require('exceljs');

/**
 * Generates a professionally styled, comprehensive multi-sheet Excel workbook for CodeVerse 2.0.
 *
 * Dedicated Sheets:
 *  1. 'VIT Registrations'      -> All VIT teams with their proper VIT hostel & registration details.
 *  2. 'Non-VIT Registrations'  -> All Non-VIT / External teams with their proper college & degree details.
 *  3. 'VIT Participants'       -> Individual directory of all VIT students with hostel & room info.
 *  4. 'Non-VIT Participants'   -> Individual directory of all External students with college & degree info.
 *  5. 'Summary & Statistics'   -> High-level metrics, revenue audit, and category breakdown.
 *
 * @param {Array} teams List of teams with members and payment information
 * @param {Object} metrics Overall hackathon stats
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function generateRegistrationExcel(teams = [], metrics = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CodeVerse Hackathon Committee';
  workbook.lastModifiedBy = 'CodeVerse Admin';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Color Definitions (Hex ARGB format)
  const COLORS = {
    TITLE_BG: 'FF0F172A',       // Deep Dark Slate
    TEAM_BG: 'FF1E1B4B',        // Indigo / Midnight Navy
    LEADER_BG: 'FF92400E',      // Rich Amber / Gold
    MEMBER_BG: 'FF1E293B',      // Dark Slate Blue
    PAYMENT_BG: 'FF064E3B',     // Emerald Pine Green
    WHITE: 'FFFFFFFF',
    BORDER_GRAY: 'FFE2E8F0',
    ROW_ALT_BG: 'FFF8FAFC',
    STATUS_VERIFIED_BG: 'FFDCFCE7',
    STATUS_VERIFIED_FG: 'FF166534',
    STATUS_PENDING_BG: 'FFFEF3C7',
    STATUS_PENDING_FG: 'FF92400E',
    STATUS_REJECTED_BG: 'FFFEE2E2',
    STATUS_REJECTED_FG: 'FF991B1B'
  };

  const vitTeams = teams.filter(t => (t.teamType || t.team_type || 'VIT').toUpperCase() !== 'NON_VIT');
  const nonVitTeams = teams.filter(t => (t.teamType || t.team_type || '').toUpperCase() === 'NON_VIT');

  // =========================================================================
  // HELPER FUNCTIONS FOR RESIDENCE & STATUS
  // =========================================================================
  function getVitResidence(m) {
    if (!m || !(m.fullName || m.full_name)) return { type: '—', block: '—', room: '—' };
    const resType = (m.residenceType || m.residence_type || 'HOSTELLER').toUpperCase();
    if (resType === 'DAY_SCHOLAR') {
      const subType = (m.dayScholarType || m.day_scholar_type) === 'NON_LOCAL' ? 'Non-Local (PG)' : 'Local Resident';
      const loc = m.dayScholarLocation || m.day_scholar_location || 'Local';
      const addr = m.residenceAddress || m.residence_address || '';
      return {
        type: `Day Scholar (${subType})`,
        block: loc || 'Local Area',
        room: addr || '—'
      };
    }
    const block = m.hostelBlock || m.hostel_block || 'Hostel';
    const room = m.roomNo || m.room_no || '—';
    return {
      type: 'Hosteller',
      block: block,
      room: room ? `Rm ${room}` : '—'
    };
  }

  function formatStatus(status) {
    if (!status) return '—';
    if (status === 'VERIFIED') return 'VERIFIED';
    if (status === 'PENDING_VERIFICATION') return 'PENDING VERIFICATION';
    if (status === 'PENDING_PAYMENT') return 'PAYMENT NOT SUBMITTED';
    if (status === 'REJECTED') return 'REJECTED';
    return status;
  }

  // =========================================================================
  // SHEET 1: VIT TEAMS REGISTRATION (PROPER VIT DETAILS ONLY)
  // =========================================================================
  const vitSheet = workbook.addWorksheet('VIT Registrations', {
    views: [{ state: 'frozen', ySplit: 3, xSplit: 3, activeCell: 'D4' }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
  });

  const vitColsDef = [
    // Team General Info
    { key: 'sno', header: 'S.No', width: 8, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'registrationId', header: 'Registration ID', width: 18, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'teamName', header: 'Team Name', width: 26, align: 'left', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'track', header: 'Innovation Track', width: 28, align: 'left', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'projectTitle', header: 'Proposed Project / Problem Statement', width: 34, align: 'left', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'referral', header: 'Referral Code', width: 18, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'memberCount', header: 'Squad Size', width: 14, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'totalFee', header: 'Fee (₹)', width: 14, align: 'right', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'overallStatus', header: 'Registration Status', width: 22, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },

    // Team Leader (Member 1)
    { key: 'leaderName', header: 'Leader Full Name', width: 24, align: 'left', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderRegNo', header: 'Leader Reg. No.', width: 18, align: 'center', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderEmail', header: 'Leader College Email', width: 30, align: 'left', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderPhone', header: 'Leader Phone', width: 18, align: 'center', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderResType', header: 'Leader Residence', width: 18, align: 'center', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderHostelBlock', header: 'Leader Hostel Block', width: 22, align: 'left', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderRoomNo', header: 'Leader Room / Location', width: 22, align: 'left', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },

    // Member 2
    { key: 'm2Name', header: 'Member 2 Name', width: 24, align: 'left', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2RegNo', header: 'Member 2 Reg. No.', width: 18, align: 'center', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2Email', header: 'Member 2 Email', width: 30, align: 'left', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2Phone', header: 'Member 2 Phone', width: 18, align: 'center', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2ResType', header: 'Member 2 Residence', width: 18, align: 'center', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2HostelBlock', header: 'Member 2 Hostel Block', width: 22, align: 'left', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2RoomNo', header: 'Member 2 Room / Location', width: 22, align: 'left', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },

    // Member 3
    { key: 'm3Name', header: 'Member 3 Name', width: 24, align: 'left', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3RegNo', header: 'Member 3 Reg. No.', width: 18, align: 'center', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3Email', header: 'Member 3 Email', width: 30, align: 'left', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3Phone', header: 'Member 3 Phone', width: 18, align: 'center', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3ResType', header: 'Member 3 Residence', width: 18, align: 'center', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3HostelBlock', header: 'Member 3 Hostel Block', width: 22, align: 'left', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3RoomNo', header: 'Member 3 Room / Location', width: 22, align: 'left', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },

    // Member 4
    { key: 'm4Name', header: 'Member 4 Name', width: 24, align: 'left', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4RegNo', header: 'Member 4 Reg. No.', width: 18, align: 'center', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4Email', header: 'Member 4 Email', width: 30, align: 'left', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4Phone', header: 'Member 4 Phone', width: 18, align: 'center', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4ResType', header: 'Member 4 Residence', width: 18, align: 'center', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4HostelBlock', header: 'Member 4 Hostel Block', width: 22, align: 'left', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4RoomNo', header: 'Member 4 Room / Location', width: 22, align: 'left', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },

    // Member 5
    { key: 'm5Name', header: 'Member 5 Name', width: 24, align: 'left', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5RegNo', header: 'Member 5 Reg. No.', width: 18, align: 'center', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5Email', header: 'Member 5 Email', width: 30, align: 'left', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5Phone', header: 'Member 5 Phone', width: 18, align: 'center', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5ResType', header: 'Member 5 Residence', width: 18, align: 'center', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5HostelBlock', header: 'Member 5 Hostel Block', width: 22, align: 'left', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5RoomNo', header: 'Member 5 Room / Location', width: 22, align: 'left', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },

    // Payment & Audit Section
    { key: 'paymentMethod', header: 'Payment Method', width: 16, align: 'center', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'utrNumber', header: 'Transaction ID / UTR', width: 22, align: 'center', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'amountPaid', header: 'Amount Paid (₹)', width: 16, align: 'right', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'transactionDate', header: 'Payment Date', width: 16, align: 'center', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'paymentStatus', header: 'Payment Status', width: 20, align: 'center', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'proofLink', header: 'Screenshot Proof', width: 30, align: 'left', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'adminNotes', header: 'Admin Remarks', width: 26, align: 'left', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'createdAt', header: 'Registered Timestamp', width: 22, align: 'center', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG }
  ];

  vitSheet.columns = vitColsDef.map(col => ({ key: col.key, width: col.width }));

  // Row 1: Title Banner
  vitSheet.mergeCells(1, 1, 1, vitColsDef.length);
  const vitBanner = vitSheet.getCell(1, 1);
  vitBanner.value = 'CODEVERSE 2.0 HACKATHON — VIT BHOPAL STUDENT TEAMS MASTER REGISTER';
  vitBanner.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.WHITE } };
  vitBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };
  vitBanner.alignment = { vertical: 'middle', horizontal: 'center' };
  vitSheet.getRow(1).height = 36;

  // Build Categories (Row 2 & Row 3)
  setupCategorizedHeaders(vitSheet, vitColsDef, COLORS);

  // Populate VIT Team Rows
  vitTeams.forEach((team, teamIdx) => {
    const members = team.members || [];
    const leader = members.find(m => m.isLeader || m.is_leader) || members[0] || {};
    const nonLeaderMembers = members.filter(m => !(m.isLeader || m.is_leader));

    const m2 = nonLeaderMembers[0] || {};
    const m3 = nonLeaderMembers[1] || {};
    const m4 = nonLeaderMembers[2] || {};
    const m5 = nonLeaderMembers[3] || {};

    const leaderRes = getVitResidence(leader);
    const m2Res = getVitResidence(m2);
    const m3Res = getVitResidence(m3);
    const m4Res = getVitResidence(m4);
    const m5Res = getVitResidence(m5);
    const payment = team.payment || {};

    const rowData = {
      sno: teamIdx + 1,
      registrationId: team.registrationId || team.registration_id || '—',
      teamName: team.teamName || team.team_name || '—',
      track: team.track || '—',
      projectTitle: team.projectTitle || team.project_title || '—',
      referral: team.referral || '—',
      memberCount: team.memberCount || team.member_count || members.length,
      totalFee: team.totalFee || team.total_fee || (payment.amountPaid || 250),
      overallStatus: formatStatus(team.status),

      // Leader
      leaderName: leader.fullName || leader.full_name || '—',
      leaderRegNo: leader.regNumber || leader.reg_number || '—',
      leaderEmail: leader.collegeEmail || leader.college_email || '—',
      leaderPhone: leader.phone || '—',
      leaderResType: leaderRes.type,
      leaderHostelBlock: leaderRes.block,
      leaderRoomNo: leaderRes.room,

      // Member 2
      m2Name: m2.fullName || m2.full_name || '—',
      m2RegNo: m2.regNumber || m2.reg_number || '—',
      m2Email: m2.collegeEmail || m2.college_email || '—',
      m2Phone: m2.phone || '—',
      m2ResType: m2Res.type,
      m2HostelBlock: m2Res.block,
      m2RoomNo: m2Res.room,

      // Member 3
      m3Name: m3.fullName || m3.full_name || '—',
      m3RegNo: m3.regNumber || m3.reg_number || '—',
      m3Email: m3.collegeEmail || m3.college_email || '—',
      m3Phone: m3.phone || '—',
      m3ResType: m3Res.type,
      m3HostelBlock: m3Res.block,
      m3RoomNo: m3Res.room,

      // Member 4
      m4Name: m4.fullName || m4.full_name || '—',
      m4RegNo: m4.regNumber || m4.reg_number || '—',
      m4Email: m4.collegeEmail || m4.college_email || '—',
      m4Phone: m4.phone || '—',
      m4ResType: m4Res.type,
      m4HostelBlock: m4Res.block,
      m4RoomNo: m4Res.room,

      // Member 5
      m5Name: m5.fullName || m5.full_name || '—',
      m5RegNo: m5.regNumber || m5.reg_number || '—',
      m5Email: m5.collegeEmail || m5.college_email || '—',
      m5Phone: m5.phone || '—',
      m5ResType: m5Res.type,
      m5HostelBlock: m5Res.block,
      m5RoomNo: m5Res.room,

      // Payment
      paymentMethod: payment.paymentMethod || payment.payment_method || 'UPI',
      utrNumber: payment.utrNumber || payment.utr_number || '—',
      amountPaid: payment.amountPaid || payment.amount_paid || 0,
      transactionDate: payment.transactionDate || payment.transaction_date || '—',
      paymentStatus: formatStatus(payment.status || team.status),
      proofLink: payment.proofFilePath || payment.proof_file_path || '—',
      adminNotes: payment.adminNotes || payment.admin_notes || '—',
      createdAt: team.createdAt ? new Date(team.createdAt).toLocaleString('en-IN') : '—'
    };

    const row = vitSheet.addRow(rowData);
    row.height = 24;
    styleDataRow(row, vitColsDef, teamIdx % 2 === 1, team.status, COLORS);
  });

  // =========================================================================
  // SHEET 2: NON-VIT REGISTRATIONS (COLLEGE, YEAR, DEGREE & FOOD PASSES)
  // =========================================================================
  const nonVitSheet = workbook.addWorksheet('Non-VIT Registrations', {
    views: [{ state: 'frozen', ySplit: 3, xSplit: 3, activeCell: 'D4' }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
  });

  const nonVitColsDef = [
    // Team General Info
    { key: 'sno', header: 'S.No', width: 8, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'registrationId', header: 'Registration ID', width: 18, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'teamName', header: 'Team Name', width: 26, align: 'left', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'track', header: 'Innovation Track', width: 28, align: 'left', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'projectTitle', header: 'Proposed Project / Problem Statement', width: 34, align: 'left', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'referral', header: 'Referral Code', width: 18, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'foodPass', header: 'Dinner Pass Option', width: 24, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'memberCount', header: 'Squad Size', width: 14, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'totalFee', header: 'Fee (₹)', width: 14, align: 'right', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'overallStatus', header: 'Registration Status', width: 22, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },

    // Team Leader (Member 1)
    { key: 'leaderName', header: 'Leader Full Name', width: 24, align: 'left', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderCollege', header: 'Leader College / University', width: 28, align: 'left', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderYear', header: 'Leader Year', width: 14, align: 'center', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderDegree', header: 'Leader Degree & Branch', width: 24, align: 'left', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderEmail', header: 'Leader College Email', width: 30, align: 'left', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderPhone', header: 'Leader Phone', width: 18, align: 'center', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderFood', header: 'Leader Dinner Pass', width: 18, align: 'center', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },

    // Member 2
    { key: 'm2Name', header: 'Member 2 Name', width: 24, align: 'left', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2College', header: 'Member 2 College', width: 28, align: 'left', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2Year', header: 'Member 2 Year', width: 14, align: 'center', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2Degree', header: 'Member 2 Degree & Branch', width: 24, align: 'left', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2Email', header: 'Member 2 Email', width: 30, align: 'left', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2Phone', header: 'Member 2 Phone', width: 18, align: 'center', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2Food', header: 'Member 2 Dinner Pass', width: 18, align: 'center', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },

    // Member 3
    { key: 'm3Name', header: 'Member 3 Name', width: 24, align: 'left', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3College', header: 'Member 3 College', width: 28, align: 'left', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3Year', header: 'Member 3 Year', width: 14, align: 'center', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3Degree', header: 'Member 3 Degree & Branch', width: 24, align: 'left', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3Email', header: 'Member 3 Email', width: 30, align: 'left', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3Phone', header: 'Member 3 Phone', width: 18, align: 'center', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3Food', header: 'Member 3 Dinner Pass', width: 18, align: 'center', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },

    // Member 4
    { key: 'm4Name', header: 'Member 4 Name', width: 24, align: 'left', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4College', header: 'Member 4 College', width: 28, align: 'left', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4Year', header: 'Member 4 Year', width: 14, align: 'center', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4Degree', header: 'Member 4 Degree & Branch', width: 24, align: 'left', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4Email', header: 'Member 4 Email', width: 30, align: 'left', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4Phone', header: 'Member 4 Phone', width: 18, align: 'center', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4Food', header: 'Member 4 Dinner Pass', width: 18, align: 'center', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },

    // Member 5
    { key: 'm5Name', header: 'Member 5 Name', width: 24, align: 'left', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5College', header: 'Member 5 College', width: 28, align: 'left', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5Year', header: 'Member 5 Year', width: 14, align: 'center', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5Degree', header: 'Member 5 Degree & Branch', width: 24, align: 'left', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5Email', header: 'Member 5 Email', width: 30, align: 'left', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5Phone', header: 'Member 5 Phone', width: 18, align: 'center', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },
    { key: 'm5Food', header: 'Member 5 Dinner Pass', width: 18, align: 'center', category: 'MEMBER 5', catBg: COLORS.MEMBER_BG },

    // Payment & Audit Section
    { key: 'paymentMethod', header: 'Payment Method', width: 16, align: 'center', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'utrNumber', header: 'Transaction ID / UTR', width: 22, align: 'center', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'amountPaid', header: 'Amount Paid (₹)', width: 16, align: 'right', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'transactionDate', header: 'Payment Date', width: 16, align: 'center', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'paymentStatus', header: 'Payment Status', width: 20, align: 'center', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'proofLink', header: 'Screenshot Proof', width: 30, align: 'left', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'adminNotes', header: 'Admin Remarks', width: 26, align: 'left', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG },
    { key: 'createdAt', header: 'Registered Timestamp', width: 22, align: 'center', category: 'PAYMENT AUDIT', catBg: COLORS.PAYMENT_BG }
  ];

  nonVitSheet.columns = nonVitColsDef.map(col => ({ key: col.key, width: col.width }));

  // Row 1: Title Banner
  nonVitSheet.mergeCells(1, 1, 1, nonVitColsDef.length);
  const nonVitBanner = nonVitSheet.getCell(1, 1);
  nonVitBanner.value = 'CODEVERSE 2.0 HACKATHON — NON-VIT / EXTERNAL COLLEGE SQUADS REGISTER';
  nonVitBanner.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.WHITE } };
  nonVitBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };
  nonVitBanner.alignment = { vertical: 'middle', horizontal: 'center' };
  nonVitSheet.getRow(1).height = 36;

  // Build Categories (Row 2 & Row 3)
  setupCategorizedHeaders(nonVitSheet, nonVitColsDef, COLORS);

  // Populate Non-VIT Team Rows
  nonVitTeams.forEach((team, teamIdx) => {
    const members = team.members || [];
    const leader = members.find(m => m.isLeader || m.is_leader) || members[0] || {};
    const nonLeaderMembers = members.filter(m => !(m.isLeader || m.is_leader));

    const m2 = nonLeaderMembers[0] || {};
    const m3 = nonLeaderMembers[1] || {};
    const m4 = nonLeaderMembers[2] || {};
    const m5 = nonLeaderMembers[3] || {};

    const hasFoodPass = team.hasFood || team.has_food;
    const foodCount = team.foodCount || team.food_count || 0;
    const foodAmt = team.foodAmount || team.food_amount || 0;
    const payment = team.payment || {};

    const formatFood = (m) => (m.wantsFood || m.wants_food) ? 'Included (+₹200)' : 'No Food';

    const rowData = {
      sno: teamIdx + 1,
      registrationId: team.registrationId || team.registration_id || '—',
      teamName: team.teamName || team.team_name || '—',
      track: team.track || '—',
      projectTitle: team.projectTitle || team.project_title || '—',
      referral: team.referral || '—',
      foodPass: hasFoodPass ? `Yes (${foodCount} pass${foodCount > 1 ? 'es' : ''} - ₹${foodAmt})` : 'No Food',
      memberCount: team.memberCount || team.member_count || members.length,
      totalFee: team.totalFee || team.total_fee || (payment.amountPaid || 250),
      overallStatus: formatStatus(team.status),

      // Leader
      leaderName: leader.fullName || leader.full_name || '—',
      leaderCollege: leader.collegeName || leader.college_name || 'External College',
      leaderYear: leader.yearOfStudy || leader.year_of_study || '—',
      leaderDegree: leader.degree || '—',
      leaderEmail: leader.collegeEmail || leader.college_email || '—',
      leaderPhone: leader.phone || '—',
      leaderFood: formatFood(leader),

      // Member 2
      m2Name: m2.fullName || m2.full_name || '—',
      m2College: m2.collegeName || m2.college_name || '—',
      m2Year: m2.yearOfStudy || m2.year_of_study || '—',
      m2Degree: m2.degree || '—',
      m2Email: m2.collegeEmail || m2.college_email || '—',
      m2Phone: m2.phone || '—',
      m2Food: m2.fullName ? formatFood(m2) : '—',

      // Member 3
      m3Name: m3.fullName || m3.full_name || '—',
      m3College: m3.collegeName || m3.college_name || '—',
      m3Year: m3.yearOfStudy || m3.year_of_study || '—',
      m3Degree: m3.degree || '—',
      m3Email: m3.collegeEmail || m3.college_email || '—',
      m3Phone: m3.phone || '—',
      m3Food: m3.fullName ? formatFood(m3) : '—',

      // Member 4
      m4Name: m4.fullName || m4.full_name || '—',
      m4College: m4.collegeName || m4.college_name || '—',
      m4Year: m4.yearOfStudy || m4.year_of_study || '—',
      m4Degree: m4.degree || '—',
      m4Email: m4.collegeEmail || m4.college_email || '—',
      m4Phone: m4.phone || '—',
      m4Food: m4.fullName ? formatFood(m4) : '—',

      // Member 5
      m5Name: m5.fullName || m5.full_name || '—',
      m5College: m5.collegeName || m5.college_name || '—',
      m5Year: m5.yearOfStudy || m5.year_of_study || '—',
      m5Degree: m5.degree || '—',
      m5Email: m5.collegeEmail || m5.college_email || '—',
      m5Phone: m5.phone || '—',
      m5Food: m5.fullName ? formatFood(m5) : '—',

      // Payment
      paymentMethod: payment.paymentMethod || payment.payment_method || 'UPI',
      utrNumber: payment.utrNumber || payment.utr_number || '—',
      amountPaid: payment.amountPaid || payment.amount_paid || 0,
      transactionDate: payment.transactionDate || payment.transaction_date || '—',
      paymentStatus: formatStatus(payment.status || team.status),
      proofLink: payment.proofFilePath || payment.proof_file_path || '—',
      adminNotes: payment.adminNotes || payment.admin_notes || '—',
      createdAt: team.createdAt ? new Date(team.createdAt).toLocaleString('en-IN') : '—'
    };

    const row = nonVitSheet.addRow(rowData);
    row.height = 24;
    styleDataRow(row, nonVitColsDef, teamIdx % 2 === 1, team.status, COLORS);
  });

  // =========================================================================
  // SHEET 3: VIT INDIVIDUAL PARTICIPANTS (WITH PROPER HOSTEL & REG DETAILS)
  // =========================================================================
  const vitPartSheet = workbook.addWorksheet('VIT Participants', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 2, activeCell: 'C3' }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
  });

  const vitPartCols = [
    { key: 'sno', header: 'S.No', width: 8, align: 'center' },
    { key: 'role', header: 'Role', width: 16, align: 'center' },
    { key: 'fullName', header: 'Full Name', width: 28, align: 'left' },
    { key: 'regNumber', header: 'VIT Reg. / Roll No.', width: 22, align: 'center' },
    { key: 'collegeEmail', header: 'College Email', width: 32, align: 'left' },
    { key: 'phone', header: 'Phone / WhatsApp', width: 20, align: 'center' },
    { key: 'residenceType', header: 'Residence Status', width: 20, align: 'center' },
    { key: 'hostelBlock', header: 'Hostel Block / Area', width: 26, align: 'left' },
    { key: 'roomNo', header: 'Room No / Address', width: 24, align: 'left' },
    { key: 'teamName', header: 'Team Name', width: 28, align: 'left' },
    { key: 'registrationId', header: 'Registration ID', width: 20, align: 'center' },
    { key: 'track', header: 'Innovation Track', width: 28, align: 'left' },
    { key: 'paymentStatus', header: 'Verification Status', width: 22, align: 'center' }
  ];

  vitPartSheet.columns = vitPartCols.map(c => ({ key: c.key, width: c.width }));

  // Title Banner
  vitPartSheet.mergeCells(1, 1, 1, vitPartCols.length);
  const vitPartBanner = vitPartSheet.getCell(1, 1);
  vitPartBanner.value = 'CODEVERSE 2.0 HACKATHON — VIT BHOPAL PARTICIPANTS DIRECTORY (HOSTEL & ACCOMMODATION)';
  vitPartBanner.font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLORS.WHITE } };
  vitPartBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };
  vitPartBanner.alignment = { vertical: 'middle', horizontal: 'center' };
  vitPartSheet.getRow(1).height = 32;

  // Header Row
  const vitPartHeaderRow = vitPartSheet.getRow(2);
  vitPartHeaderRow.height = 26;
  vitPartCols.forEach((col, idx) => {
    const cell = vitPartHeaderRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.LEADER_BG } };
    cell.alignment = { vertical: 'middle', horizontal: col.align || 'left' };
    cell.border = {
      top: { style: 'medium', color: { argb: COLORS.TITLE_BG } },
      bottom: { style: 'medium', color: { argb: COLORS.TITLE_BG } },
      left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };
  });

  let vitPartIdx = 1;
  for (const team of vitTeams) {
    const members = team.members || [];
    for (const m of members) {
      const res = getVitResidence(m);
      const row = vitPartSheet.addRow({
        sno: vitPartIdx++,
        role: m.isLeader ? '👑 Team Leader' : 'Member',
        fullName: m.fullName || m.full_name || '—',
        regNumber: m.regNumber || m.reg_number || '—',
        collegeEmail: m.collegeEmail || m.college_email || '—',
        phone: m.phone || '—',
        residenceType: res.type,
        hostelBlock: res.block,
        roomNo: res.room,
        teamName: team.teamName || team.team_name || '—',
        registrationId: team.registrationId || team.registration_id || '—',
        track: team.track || '—',
        paymentStatus: formatStatus(team.status)
      });
      row.height = 22;
      styleSimpleRow(row, vitPartCols, vitPartIdx % 2 === 1, team.status, COLORS);
    }
  }

  // =========================================================================
  // SHEET 4: NON-VIT INDIVIDUAL PARTICIPANTS (WITH COLLEGE & DEGREE DETAILS)
  // =========================================================================
  const nonVitPartSheet = workbook.addWorksheet('Non-VIT Participants', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 2, activeCell: 'C3' }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
  });

  const nonVitPartCols = [
    { key: 'sno', header: 'S.No', width: 8, align: 'center' },
    { key: 'role', header: 'Role', width: 16, align: 'center' },
    { key: 'fullName', header: 'Full Name', width: 28, align: 'left' },
    { key: 'collegeName', header: 'College / University', width: 32, align: 'left' },
    { key: 'yearOfStudy', header: 'Year of Study', width: 16, align: 'center' },
    { key: 'degree', header: 'Degree & Branch', width: 26, align: 'left' },
    { key: 'collegeEmail', header: 'Email Address', width: 32, align: 'left' },
    { key: 'phone', header: 'Phone / WhatsApp', width: 20, align: 'center' },
    { key: 'foodPass', header: 'Dinner Pass', width: 18, align: 'center' },
    { key: 'teamName', header: 'Team Name', width: 28, align: 'left' },
    { key: 'registrationId', header: 'Registration ID', width: 20, align: 'center' },
    { key: 'track', header: 'Innovation Track', width: 28, align: 'left' },
    { key: 'paymentStatus', header: 'Verification Status', width: 22, align: 'center' }
  ];

  nonVitPartSheet.columns = nonVitPartCols.map(c => ({ key: c.key, width: c.width }));

  // Title Banner
  nonVitPartSheet.mergeCells(1, 1, 1, nonVitPartCols.length);
  const nonVitPartBanner = nonVitPartSheet.getCell(1, 1);
  nonVitPartBanner.value = 'CODEVERSE 2.0 HACKATHON — NON-VIT / EXTERNAL PARTICIPANTS DIRECTORY';
  nonVitPartBanner.font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLORS.WHITE } };
  nonVitPartBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };
  nonVitPartBanner.alignment = { vertical: 'middle', horizontal: 'center' };
  nonVitPartSheet.getRow(1).height = 32;

  // Header Row
  const nonVitPartHeaderRow = nonVitPartSheet.getRow(2);
  nonVitPartHeaderRow.height = 26;
  nonVitPartCols.forEach((col, idx) => {
    const cell = nonVitPartHeaderRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MEMBER_BG } };
    cell.alignment = { vertical: 'middle', horizontal: col.align || 'left' };
    cell.border = {
      top: { style: 'medium', color: { argb: COLORS.TITLE_BG } },
      bottom: { style: 'medium', color: { argb: COLORS.TITLE_BG } },
      left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };
  });

  let nonVitPartIdx = 1;
  for (const team of nonVitTeams) {
    const members = team.members || [];
    for (const m of members) {
      const row = nonVitPartSheet.addRow({
        sno: nonVitPartIdx++,
        role: m.isLeader ? '👑 Team Leader' : 'Member',
        fullName: m.fullName || m.full_name || '—',
        collegeName: m.collegeName || m.college_name || 'External College',
        yearOfStudy: m.yearOfStudy || m.year_of_study || '—',
        degree: m.degree || '—',
        collegeEmail: m.collegeEmail || m.college_email || '—',
        phone: m.phone || '—',
        foodPass: (m.wantsFood || m.wants_food) ? '🍽️ Included (+₹200)' : 'No Food',
        teamName: team.teamName || team.team_name || '—',
        registrationId: team.registrationId || team.registration_id || '—',
        track: team.track || '—',
        paymentStatus: formatStatus(team.status)
      });
      row.height = 22;
      styleSimpleRow(row, nonVitPartCols, nonVitPartIdx % 2 === 1, team.status, COLORS);
    }
  }

  // =========================================================================
  // SHEET 5: SUMMARY & STATISTICS
  // =========================================================================
  const statsSheet = workbook.addWorksheet('Summary & Statistics');
  statsSheet.columns = [
    { key: 'metric', width: 36 },
    { key: 'value', width: 24 }
  ];

  statsSheet.mergeCells('A1:B1');
  const statsTitle = statsSheet.getCell('A1');
  statsTitle.value = 'CODEVERSE HACKATHON 2026 — REGISTRATION METRICS & AUDIT';
  statsTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLORS.WHITE } };
  statsTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };
  statsTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  statsSheet.getRow(1).height = 34;

  const totalVitParticipants = vitTeams.reduce((acc, t) => acc + (t.members ? t.members.length : t.memberCount || 0), 0);
  const totalNonVitParticipants = nonVitTeams.reduce((acc, t) => acc + (t.members ? t.members.length : t.memberCount || 0), 0);
  const totalNonVitFoodPasses = nonVitTeams.reduce((acc, t) => acc + (t.foodCount || 0), 0);

  const statsData = [
    ['Total Registered Teams', teams.length],
    ['🎓 VIT Bhopal Student Teams', vitTeams.length],
    ['🌐 Non-VIT / External College Squads', nonVitTeams.length],
    ['👥 Total VIT Participants (Hostellers & Day Scholars)', totalVitParticipants],
    ['🏛️ Total Non-VIT External Participants', totalNonVitParticipants],
    ['🍱 Non-VIT Dinner Passes Booked', `${totalNonVitFoodPasses} Passes`],
    ['✅ Verified Teams (Accepted by Admin)', metrics.verifiedTeams || teams.filter(t => t.status === 'VERIFIED').length],
    ['⏳ Pending Verification (UTR Submitted)', metrics.pendingVerification || teams.filter(t => t.status === 'PENDING_VERIFICATION').length],
    ['❌ Rejected Registrations', metrics.rejected || teams.filter(t => t.status === 'REJECTED').length],
    ['💰 Total Verified Revenue Collected', `₹${(metrics.totalRevenue || 0).toLocaleString('en-IN')}`],
    ['📅 Export Generated At', new Date().toLocaleString('en-IN')]
  ];

  statsData.forEach((item, idx) => {
    const rowIdx = idx + 3;
    const row = statsSheet.getRow(rowIdx);
    row.height = 24;

    const cellA = statsSheet.getCell(`A${rowIdx}`);
    const cellB = statsSheet.getCell(`B${rowIdx}`);

    cellA.value = item[0];
    cellA.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };
    cellA.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };

    cellB.value = item[1];
    cellB.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    cellB.alignment = { horizontal: 'center' };
    cellB.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };
  });

  return workbook;
}

// =========================================================================
// HELPER: BUILD TWO-TIER CATEGORY HEADERS (ROWS 2 & 3)
// =========================================================================
function setupCategorizedHeaders(sheet, colsDef, COLORS) {
  const row2 = sheet.getRow(2);
  const row3 = sheet.getRow(3);
  row2.height = 28;
  row3.height = 24;

  const categories = [];
  let currentCat = null;

  colsDef.forEach((col, idx) => {
    const colNum = idx + 1;
    if (!currentCat || currentCat.name !== col.category) {
      if (currentCat) categories.push(currentCat);
      currentCat = {
        name: col.category,
        startCol: colNum,
        endCol: colNum,
        bg: col.catBg || COLORS.TEAM_BG
      };
    } else {
      currentCat.endCol = colNum;
    }
  });
  if (currentCat) categories.push(currentCat);

  categories.forEach(cat => {
    if (cat.startCol === cat.endCol) {
      const cell = row2.getCell(cat.startCol);
      cell.value = cat.name;
    } else {
      sheet.mergeCells(2, cat.startCol, 2, cat.endCol);
      const cell = sheet.getCell(2, cat.startCol);
      cell.value = cat.name;
    }

    const mergedCell = sheet.getCell(2, cat.startCol);
    mergedCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.WHITE } };
    mergedCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cat.bg } };
    mergedCell.alignment = { vertical: 'middle', horizontal: 'center' };

    for (let c = cat.startCol; c <= cat.endCol; c++) {
      const cell = row2.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cat.bg } };
      cell.border = {
        top: { style: 'medium', color: { argb: COLORS.TITLE_BG } },
        bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
        left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
        right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
      };
    }
  });

  colsDef.forEach((col, idx) => {
    const cell = row3.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MEMBER_BG } };
    cell.alignment = { vertical: 'middle', horizontal: col.align || 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      bottom: { style: 'medium', color: { argb: COLORS.TITLE_BG } },
      left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };
  });

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: colsDef.length }
  };
}

// =========================================================================
// HELPER: STYLE DATA ROW
// =========================================================================
function styleDataRow(row, colsDef, isAltRow, status, COLORS) {
  const rowBg = isAltRow ? COLORS.ROW_ALT_BG : COLORS.WHITE;

  row.eachCell({ includeEmpty: true }, (cell, colNum) => {
    const colDef = colsDef[colNum - 1];
    if (!colDef) return;

    cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle', horizontal: colDef.align || 'left' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };

    if (colDef.key === 'overallStatus' || colDef.key === 'paymentStatus') {
      cell.font = { name: 'Calibri', size: 10, bold: true };
      if (status === 'VERIFIED') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.STATUS_VERIFIED_BG } };
        cell.font.color = { argb: COLORS.STATUS_VERIFIED_FG };
      } else if (status === 'PENDING_VERIFICATION') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.STATUS_PENDING_BG } };
        cell.font.color = { argb: COLORS.STATUS_PENDING_FG };
      } else if (status === 'REJECTED') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.STATUS_REJECTED_BG } };
        cell.font.color = { argb: COLORS.STATUS_REJECTED_FG };
      }
    }
  });
}

function styleSimpleRow(row, colsDef, isAltRow, status, COLORS) {
  const rowBg = isAltRow ? COLORS.ROW_ALT_BG : COLORS.WHITE;

  row.eachCell({ includeEmpty: true }, (cell, colNum) => {
    const colDef = colsDef[colNum - 1];
    if (!colDef) return;

    cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle', horizontal: colDef.align || 'left' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };

    if (colDef.key === 'paymentStatus') {
      cell.font = { name: 'Calibri', size: 10, bold: true };
      if (status === 'VERIFIED') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.STATUS_VERIFIED_BG } };
        cell.font.color = { argb: COLORS.STATUS_VERIFIED_FG };
      } else if (status === 'PENDING_VERIFICATION') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.STATUS_PENDING_BG } };
        cell.font.color = { argb: COLORS.STATUS_PENDING_FG };
      } else if (status === 'REJECTED') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.STATUS_REJECTED_BG } };
        cell.font.color = { argb: COLORS.STATUS_REJECTED_FG };
      }
    }
  });
}

module.exports = {
  generateRegistrationExcel
};
