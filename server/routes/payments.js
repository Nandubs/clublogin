const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendSms } = require('../services/sms');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAIN_ADMIN = 'brahmastra01';

function getYearlyPayments(year) {
  const rows = db.prepare(`
    SELECT m.member_id, m.name, p.month, p.amount, p.status
    FROM members m
    LEFT JOIN payments p ON p.member_id = m.member_id AND p.year = ?
    WHERE m.member_id != ?
    ORDER BY m.name COLLATE NOCASE ASC, p.month ASC
  `).all(year, MAIN_ADMIN);

  const members = new Map();
  for (const row of rows) {
    if (!members.has(row.member_id)) {
      members.set(row.member_id, {
        memberId: row.member_id,
        memberName: row.name,
        months: Array.from({ length: 12 }, (_, index) => ({
          month: index + 1,
          amount: 100,
          status: 'not_paid'
        }))
      });
    }

    if (row.month) {
      const month = members.get(row.member_id).months[row.month - 1];
      month.amount = row.amount || 100;
      month.status = row.status || 'not_paid';
    }
  }

  return Array.from(members.values());
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function spreadsheetCell(value, styleId = '', type = 'String', mergeAcross = 0) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : '';
  const merge = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : '';
  return `<Cell${style}${merge}><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
}

function yearlyPaymentsSpreadsheet(year, members) {
  const headers = ['Member ID', 'Member Name', ...MONTH_NAMES.slice(1), 'Paid total (INR)', 'Unpaid total (INR)'];
  const titleRow = `<Row ss:Height="28">${spreadsheetCell(`Brahmastra Club - Monthly Payment Details - ${year}`, 'Title', 'String', headers.length - 1)}</Row>`;
  const headerRow = `<Row ss:Height="24">${headers.map(header => spreadsheetCell(header, 'Header')).join('')}</Row>`;
  const memberRows = members.map(member => {
    let paidTotal = 0;
    let unpaidTotal = 0;
    const monthCells = member.months.map(month => {
      const isPaid = month.status === 'paid';
      if (isPaid) paidTotal += month.amount;
      else unpaidTotal += month.amount;
      return spreadsheetCell(`${isPaid ? 'Paid' : 'Unpaid'} - INR ${month.amount}`, isPaid ? 'Paid' : 'Unpaid');
    });

    return `<Row ss:Height="24">${[
      spreadsheetCell(member.memberId, 'Member'),
      spreadsheetCell(member.memberName, 'Member'),
      ...monthCells,
      spreadsheetCell(paidTotal, 'Total', 'Number'),
      spreadsheetCell(unpaidTotal, 'Total', 'Number')
    ].join('')}</Row>`;
  }).join('');

  const columnWidths = [
    '<Column ss:Width="110"/>',
    '<Column ss:Width="180"/>',
    ...Array.from({ length: 12 }, () => '<Column ss:Width="105"/>'),
    '<Column ss:Width="115"/>',
    '<Column ss:Width="125"/>'
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="Title"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="15" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#174B38" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#174B38" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Member"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10"/><Interior ss:Color="#F1F5F2" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Paid"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#14532D"/><Interior ss:Color="#BBF7D0" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Unpaid"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#991B1B"/><Interior ss:Color="#FECACA" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Total"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/><NumberFormat ss:Format="#,##0"/><Interior ss:Color="#E8F1EB" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="Payment Chart">
  <Table ss:ExpandedColumnCount="${headers.length}" ss:ExpandedRowCount="${members.length + 2}" x:FullColumns="1" x:FullRows="1">
   ${columnWidths}
   ${titleRow}
   ${headerRow}
   ${memberRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>2</SplitHorizontal><TopRowBottomPane>2</TopRowBottomPane>
   <SplitVertical>2</SplitVertical><LeftColumnRightPane>2</LeftColumnRightPane><ActivePane>0</ActivePane><Pane><Number>0</Number></Pane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

function parseYear(param) {
  const year = parseInt(param, 10);
  return year >= 2000 && year <= 2100 && String(year) === param ? year : null;
}

router.get('/export/:year', (req, res) => {
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'A valid year is required' });

  const members = getYearlyPayments(year);
  const spreadsheet = yearlyPaymentsSpreadsheet(year, members);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="club-monthly-payments-${year}.xls"`);
  res.send(`\uFEFF${spreadsheet}`);
});

router.get('/year/:year', (req, res) => {
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'A valid year is required' });
  res.json({ year, members: getYearlyPayments(year) });
});

router.get('/', (req, res) => {
  const month = parseInt(req.query.month, 10);
  const year = parseInt(req.query.year, 10);
  if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });

  const rows = db.prepare(`
    SELECT m.member_id, m.name, p.amount, p.status, p.reminded_at
    FROM members m
    LEFT JOIN payments p ON p.member_id = m.member_id AND p.month = ? AND p.year = ?
    WHERE m.member_id != ?
    ORDER BY m.name ASC
  `).all(month, year, MAIN_ADMIN);

  res.json(rows.map(r => ({
    memberId: r.member_id,
    memberName: r.name,
    amount: r.amount || 100,
    status: r.status || 'not_paid',
    reminded: !!r.reminded_at
  })));
});

router.put('/:memberId', (req, res) => {
  const { memberId } = req.params;
  const month = parseInt(req.body.month, 10);
  const year = parseInt(req.body.year, 10);
  const status = req.body.status === 'paid' ? 'paid' : 'not_paid';
  if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });
  if (memberId === MAIN_ADMIN) return res.status(400).json({ error: 'The main admin does not pay membership dues' });

  const member = db.prepare('SELECT member_id FROM members WHERE member_id = ?').get(memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const existing = db.prepare('SELECT amount FROM payments WHERE member_id = ? AND month = ? AND year = ?').get(memberId, month, year);
  const amount = (existing && existing.amount) || 100;

  db.prepare(`
    INSERT INTO payments (member_id, month, year, amount, status, paid_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(member_id, month, year) DO UPDATE SET
      status = excluded.status,
      paid_at = excluded.paid_at
  `).run(memberId, month, year, amount, status, status === 'paid' ? new Date().toISOString() : null);

  res.json({ memberId, month, year, amount, status });
});

router.post('/remind', async (req, res) => {
  const memberId = req.body.memberId;
  const month = parseInt(req.body.month, 10);
  const year = parseInt(req.body.year, 10);
  if (!memberId || !month || !year) {
    return res.status(400).json({ error: 'Member, month and year are required' });
  }
  if (memberId === MAIN_ADMIN) return res.status(400).json({ error: 'The main admin does not pay membership dues' });

  const member = db.prepare('SELECT member_id, name, mobile FROM members WHERE member_id = ?').get(memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const payment = db.prepare('SELECT amount, status, reminded_at FROM payments WHERE member_id = ? AND month = ? AND year = ?').get(memberId, month, year);
  if (payment && payment.status === 'paid') {
    return res.status(400).json({ error: 'This member has already paid for this month' });
  }
  if (payment && payment.reminded_at) {
    return res.status(400).json({ error: 'A reminder was already sent to this member this month' });
  }
  const amount = (payment && payment.amount) || 100;

  const message = `Dear ${member.name}, your monthly bill of Rs.${amount} for ${MONTH_NAMES[month]} ${year} is pending with Brahmastra Arts & Sports Club. Please pay at your earliest convenience.`;

  let smsSent = false;
  let smsError = null;
  try {
    const result = await sendSms(member.mobile || member.member_id, message);
    smsSent = !result.skipped;
  } catch (err) {
    smsError = err.message;
    console.error(`Failed to send payment reminder SMS to ${memberId}:`, err.message);
  }

  let reminded = false;
  if (smsSent) {
    db.prepare(`
      INSERT INTO payments (member_id, month, year, amount, status, reminded_at)
      VALUES (?, ?, ?, ?, 'not_paid', ?)
      ON CONFLICT(member_id, month, year) DO UPDATE SET reminded_at = excluded.reminded_at
    `).run(memberId, month, year, amount, new Date().toISOString());
    reminded = true;
  }

  res.json({ message: 'Reminder processed', smsSent, reminded, ...(smsError && { smsError }) });
});

module.exports = router;
