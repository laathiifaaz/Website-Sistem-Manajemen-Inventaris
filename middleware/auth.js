function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Autentikasi diperlukan. Silakan login kembali.' });
}

// Pengguna memiliki salah satu peran yang diizinkan
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ success: false, message: 'Sesi kedaluwarsa. Silakan login kembali.' });
    }
    
    const userRole = req.session.user.role;
    if (allowedRoles.includes(userRole)) {
      return next();
    }
    
    return res.status(403).json({ 
      success: false, 
      message: `Akses ditolak. Anda memerlukan peran: ${allowedRoles.join(' atau ')}.` 
    });
  };
}

// Staf/Manajer Gudang hanya bisa mengakses gudang mereka sendiri
function requireWarehouseAccess(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'Sesi kedaluwarsa.' });
  }

  const user = req.session.user;
  const reqWarehouseId = parseInt(req.params.warehouseId || req.query.warehouseId || req.body.warehouseId, 10);

  if (!reqWarehouseId) {
    return next();
  }

  // Admin dan Viewer memiliki akses global 
  if (user.role === 'Admin' || user.role === 'Viewer') {
    return next();
  }

  // Manajer/Staf Gudang hanya boleh mengakses gudang tempat mereka ditugaskan
  if (user.warehouse_id === reqWarehouseId) {
    return next();
  }

  return res.status(403).json({ 
    success: false, 
    message: 'Akses ditolak. Anda tidak memiliki izin untuk mengelola gudang ini.' 
  });
}

module.exports = {
  requireLogin,
  requireRole,
  requireWarehouseAccess
};
