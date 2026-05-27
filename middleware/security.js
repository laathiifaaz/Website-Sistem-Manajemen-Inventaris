const crypto = require('crypto');

// Security HTTP Headers
function setSecureHeaders(req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader(
  'Content-Security-Policy',
  "default-src 'self'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://unpkg.com; " +
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
  "img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com; " +
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com;"
);
  next();
}

// Proteksi CSRF 
function csrfProtection(req, res, next) {
  if (!req.session) return next();

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  res.cookie('XSRF-TOKEN', req.session.csrfToken, {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false 
  });

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Validasi Token CSRF untuk POST, PUT, DELETE
  const clientToken = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
  
  if (!clientToken || clientToken !== req.session.csrfToken) {
    return res.status(403).json({
      success: false,
      message: 'Kesalahan CSRF: Permintaan ditolak karena token keamanan tidak valid. Silakan muat ulang halaman.'
    });
  }

  next();
}

// Proteksi XSS 
function sanitizeInput(req, res, next) {
  const sanitize = (text) => {
    if (typeof text !== 'string') return text;
    return text.replace(/<[^>]*>/g, '').trim();
  };

  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'object' && req.body[key] !== null) {
        req.body[key] = JSON.parse(JSON.stringify(req.body[key]), (k, v) => 
          typeof v === 'string' ? sanitize(v) : v
        );
      } else {
        req.body[key] = sanitize(req.body[key]);
      }
    }
  }

  // Sanitasi query parameter
  if (req.query) {
    for (const key in req.query) {
      req.query[key] = sanitize(req.query[key]);
    }
  }

  next();
}

module.exports = {
  setSecureHeaders,
  csrfProtection,
  sanitizeInput
};
