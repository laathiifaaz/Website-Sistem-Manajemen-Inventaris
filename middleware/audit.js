const { query } = require('../database/db');

async function auditLog(req, action, targetTable = null, targetId = null, details = null) {
  try {
    let userId = null;
    let username = 'ANONYMOUS';
    let role = 'Viewer';

    if (req.session && req.session.user) {
      userId = req.session.user.id;
      username = req.session.user.username;
      role = req.session.user.role;
    }

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    
    const detailsStr = typeof details === 'object' && details !== null 
      ? JSON.stringify(details) 
      : details;

    await query.run(
      `INSERT INTO audit_logs (user_id, username, role, action, target_table, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, username, role, action, targetTable, targetId, detailsStr, ipAddress]
    );
  } catch (error) {
    console.error('Audit Log Gagal Ditulis:', error.message);
  }
}

module.exports = { auditLog };
