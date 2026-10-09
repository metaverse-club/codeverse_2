const ExcelJS = require('exceljs');

/**
 * Generates a professionally styled, comprehensive Excel workbook for CodeVerse Hackathon 2026.
 * Features dedicated columns with generous widths for every member (Leader + Members 2 to 4),
 * categorized color-coded headers, frozen panes, filters, and a Summary & Statistics sheet.
 * Team size: exactly 4 members (1 Leader + 3 Members).
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

  // =========================================================================
  // SHEET 1: Master Team Registrations
  // =========================================================================
  const sheet = workbook.addWorksheet('Team Registrations', {
    views: [{ state: 'frozen', ySplit: 3, xSplit: 3, activeCell: 'D4' }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
  });

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

  // Define All Columns — 4 Members Only (Leader + 3 Members)
  const columnsDefinition = [
    // Team General Info
    { key: 'sno', header: 'S.No', width: 8, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'registrationId', header: 'Registration ID', width: 20, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'teamName', header: 'Team Name', width: 28, align: 'left', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'track', header: 'Innovation Track', width: 30, align: 'left', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'projectTitle', header: 'Proposed Project / Problem Statement', width: 36, align: 'left', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'memberCount', header: 'Total Members', width: 15, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },
    { key: 'overallStatus', header: 'Registration Status', width: 24, align: 'center', category: 'TEAM INFO', catBg: COLORS.TEAM_BG },

    // Team Leader (Member 1)
    { key: 'leaderName', header: 'Leader Full Name', width: 26, align: 'left', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderRegNo', header: 'Leader Reg. / Roll No.', width: 22, align: 'center', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderEmail', header: 'Leader College Email', width: 32, align: 'left', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },
    { key: 'leaderPhone', header: 'Leader Phone / WhatsApp', width: 22, align: 'center', category: 'TEAM LEADER (MEMBER 1)', catBg: COLORS.LEADER_BG },

    // Member 2
    { key: 'm2Name', header: 'Member 2 Full Name', width: 26, align: 'left', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2RegNo', header: 'Member 2 Reg. No.', width: 22, align: 'center', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2Email', header: 'Member 2 College Email', width: 32, align: 'left', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },
    { key: 'm2Phone', header: 'Member 2 Phone Number', width: 22, align: 'center', category: 'MEMBER 2', catBg: COLORS.MEMBER_BG },

    // Member 3
    { key: 'm3Name', header: 'Member 3 Full Name', width: 26, align: 'left', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3RegNo', header: 'Member 3 Reg. No.', width: 22, align: 'center', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3Email', header: 'Member 3 College Email', width: 32, align: 'left', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },
    { key: 'm3Phone', header: 'Member 3 Phone Number', width: 22, align: 'center', category: 'MEMBER 3', catBg: COLORS.MEMBER_BG },

    // Member 4
    { key: 'm4Name', header: 'Member 4 Full Name', width: 26, align: 'left', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4RegNo', header: 'Member 4 Reg. No.', width: 22, align: 'center', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4Email', header: 'Member 4 College Email', width: 32, align: 'left', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },
    { key: 'm4Phone', header: 'Member 4 Phone Number', width: 22, align: 'center', category: 'MEMBER 4', catBg: COLORS.MEMBER_BG },

    // Payment & Audit Section
    { key: 'paymentMethod', header: 'Payment Method', width: 18, align: 'center', category: 'PAYMENT AUDIT & VERIFICATION', catBg: COLORS.PAYMENT_BG },
    { key: 'utrNumber', header: 'Transaction / UTR Number', width: 24, align: 'center', category: 'PAYMENT AUDIT & VERIFICATION', catBg: COLORS.PAYMENT_BG },
    { key: 'amountPaid', header: 'Amount Paid (₹)', width: 18, align: 'right', category: 'PAYMENT AUDIT & VERIFICATION', catBg: COLORS.PAYMENT_BG },
    { key: 'transactionDate', header: 'Transaction Date', width: 18, align: 'center', category: 'PAYMENT AUDIT & VERIFICATION', catBg: COLORS.PAYMENT_BG },
    { key: 'paymentStatus', header: 'Payment Status', width: 20, align: 'center', category: 'PAYMENT AUDIT & VERIFICATION', catBg: COLORS.PAYMENT_BG },
    { key: 'proofLink', header: 'Uploaded Proof File', width: 34, align: 'left', category: 'PAYMENT AUDIT & VERIFICATION', catBg: COLORS.PAYMENT_BG },
    { key: 'adminNotes', header: 'Organizer Remarks', width: 30, align: 'left', category: 'PAYMENT AUDIT & VERIFICATION', catBg: COLORS.PAYMENT_BG },
    { key: 'createdAt', header: 'Registration Timestamp', width: 24, align: 'center', category: 'PAYMENT AUDIT & VERIFICATION', catBg: COLORS.PAYMENT_BG }
  ];

  // Set Sheet Columns & Widths
  sheet.columns = columnsDefinition.map(col => ({
    key: col.key,
    width: col.width
  }));

  // =========================================================================
  // ROW 1: Super Banner Title
  // =========================================================================
  const totalCols = columnsDefinition.length;
  sheet.mergeCells(1, 1, 1, totalCols);
  const titleRow = sheet.getRow(1);
  titleRow.height = 42;
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = '⚡ CODEVERSE HACKATHON 2026 — MASTER TEAM REGISTRATION & PAYMENT VERIFICATION LEDGER';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.WHITE } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };

  // =========================================================================
  // ROW 2: Category Super-Headers (Grouped Sections)
  // =========================================================================
  const catRow = sheet.getRow(2);
  catRow.height = 28;

  let currentCat = null;
  let catStartCol = 1;

  for (let i = 0; i < columnsDefinition.length; i++) {
    const colIdx = i + 1;
    const cat = columnsDefinition[i].category;
    const catBg = columnsDefinition[i].catBg;

    if (currentCat !== cat) {
      if (currentCat !== null) {
        // Merge previous category
        if (catStartCol < colIdx - 1) {
          sheet.mergeCells(2, catStartCol, 2, colIdx - 1);
        }
      }
      currentCat = cat;
      catStartCol = colIdx;
    }

    const cell = sheet.getCell(2, colIdx);
    cell.value = cat;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: catBg } };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
      right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };
  }
  // Merge last category group
  if (catStartCol < totalCols) {
    sheet.mergeCells(2, catStartCol, 2, totalCols);
  }

  // =========================================================================
  // ROW 3: Column Field Names
  // =========================================================================
  const headerRow = sheet.getRow(3);
  headerRow.height = 32;

  columnsDefinition.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: col.align, wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.catBg } };
    cell.border = {
      top: { style: 'medium', color: { argb: COLORS.WHITE } },
      bottom: { style: 'medium', color: { argb: 'FF475569' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
  });

  // Enable AutoFilter on Field Headers
  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: totalCols }
  };

  // =========================================================================
  // ROWS 4+: Populate Data Rows
  // =========================================================================
  if (teams && teams.length > 0) {
    teams.forEach((team, teamIdx) => {
      const rowIndex = 4 + teamIdx;
      const row = sheet.getRow(rowIndex);
      row.height = 26;

      const members = team.members || [];
      const leader = members.find(m => m.isLeader || m.is_leader) || members[0] || {};
      const nonLeaderMembers = members.filter(m => !(m.isLeader || m.is_leader));

      const m2 = nonLeaderMembers[0] || {};
      const m3 = nonLeaderMembers[1] || {};
      const m4 = nonLeaderMembers[2] || {};

      const payment = team.payment || {};
      const isEven = teamIdx % 2 === 1;
      const rowBg = isEven ? COLORS.ROW_ALT_BG : COLORS.WHITE;

      const rowData = {
        sno: teamIdx + 1,
        registrationId: team.registrationId || team.registration_id || '—',
        teamName: team.teamName || team.team_name || '—',
        track: team.track || '—',
        projectTitle: team.projectTitle || team.project_title || '—',
        memberCount: team.memberCount || team.member_count || members.length,
        overallStatus: formatStatus(team.status),

        // Leader
        leaderName: leader.fullName || leader.full_name || '—',
        leaderRegNo: leader.regNumber || leader.reg_number || '—',
        leaderEmail: leader.collegeEmail || leader.college_email || '—',
        leaderPhone: leader.phone || '—',

        // Member 2
        m2Name: m2.fullName || m2.full_name || '—',
        m2RegNo: m2.regNumber || m2.reg_number || '—',
        m2Email: m2.collegeEmail || m2.college_email || '—',
        m2Phone: m2.phone || '—',

        // Member 3
        m3Name: m3.fullName || m3.full_name || '—',
        m3RegNo: m3.regNumber || m3.reg_number || '—',
        m3Email: m3.collegeEmail || m3.college_email || '—',
        m3Phone: m3.phone || '—',

        // Member 4
        m4Name: m4.fullName || m4.full_name || '—',
        m4RegNo: m4.regNumber || m4.reg_number || '—',
        m4Email: m4.collegeEmail || m4.college_email || '—',
        m4Phone: m4.phone || '—',

        // Payment
        paymentMethod: payment.paymentMethod || payment.payment_method || '—',
        utrNumber: payment.utrNumber || payment.utr_number || '—',
        amountPaid: payment.amountPaid || payment.amount_paid || 0,
        transactionDate: payment.transactionDate || payment.transaction_date || '—',
        paymentStatus: formatStatus(payment.status || team.status),
        proofLink: payment.proofFilePath || payment.proof_file_path || '—',
        adminNotes: payment.adminNotes || payment.admin_notes || '—',
        createdAt: team.createdAt ? new Date(team.createdAt).toLocaleString('en-IN') : '—'
      };

      // Set Cell Values & Individual Styles
      columnsDefinition.forEach((col, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        cell.value = rowData[col.key];
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: col.align };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = {
          top: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
          bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
          left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
          right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
        };

        // Specific cell styling enhancements
        if (col.key === 'registrationId' || col.key === 'utrNumber' || col.key.includes('RegNo')) {
          cell.font = { name: 'Consolas', size: 10, bold: col.key === 'registrationId' };
        }
        if (col.key === 'teamName' || col.key === 'leaderName') {
          cell.font = { name: 'Calibri', size: 10, bold: true };
        }
        if (col.key === 'amountPaid') {
          cell.numFmt = '₹#,##0.00';
          cell.font = { name: 'Calibri', size: 10, bold: true };
        }

        // Color badge highlight for status
        if (col.key === 'overallStatus' || col.key === 'paymentStatus') {
          const val = String(cell.value || '').toUpperCase();
          if (val.includes('VERIFIED')) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.STATUS_VERIFIED_BG } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.STATUS_VERIFIED_FG } };
          } else if (val.includes('PENDING')) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.STATUS_PENDING_BG } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.STATUS_PENDING_FG } };
          } else if (val.includes('REJECTED')) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.STATUS_REJECTED_BG } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.STATUS_REJECTED_FG } };
          }
        }
      });
    });
  } else {
    // If no teams registered yet, place clean placeholder template row
    const placeholderRow = sheet.getRow(4);
    placeholderRow.height = 36;
    sheet.mergeCells(4, 1, 4, totalCols);
    const pCell = sheet.getCell(4, 1);
    pCell.value = '— No teams registered yet. Ready to record incoming registrations. —';
    pCell.alignment = { vertical: 'middle', horizontal: 'center' };
    pCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF64748B' } };
    pCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ROW_ALT_BG } };
    pCell.border = {
      bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };
  }

  // =========================================================================
  // SHEET 2: Hackathon Overview & Statistics
  // =========================================================================
  const statsSheet = workbook.addWorksheet('Summary & Statistics');
  statsSheet.columns = [
    { key: 'metric', width: 34 },
    { key: 'value', width: 24 }
  ];

  statsSheet.mergeCells('A1:B1');
  const statsTitle = statsSheet.getCell('A1');
  statsTitle.value = 'CODEVERSE HACKATHON 2026 — REGISTRATION METRICS';
  statsTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLORS.WHITE } };
  statsTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };
  statsTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  statsSheet.getRow(1).height = 34;

  const statsData = [
    ['Total Registered Teams', metrics.totalTeams || teams.length || 0],
    ['Verified Registrations', metrics.verifiedTeams || 0],
    ['Pending Verification (UTR Submitted)', metrics.pendingVerification || 0],
    ['Pending Payment (Drafts)', metrics.pendingPayment || 0],
    ['Rejected Registrations', metrics.rejected || 0],
    ['Total Verified Revenue', `₹${(metrics.totalRevenue || 0).toLocaleString('en-IN')}`],
    ['Report Exported At', new Date().toLocaleString('en-IN')]
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

function formatStatus(status) {
  if (!status) return '—';
  if (status === 'VERIFIED') return 'VERIFIED';
  if (status === 'PENDING_VERIFICATION') return 'PENDING VERIFICATION';
  if (status === 'PENDING_PAYMENT') return 'PAYMENT NOT SUBMITTED';
  if (status === 'REJECTED') return 'REJECTED';
  return status;
}

module.exports = {
  generateRegistrationExcel
};
