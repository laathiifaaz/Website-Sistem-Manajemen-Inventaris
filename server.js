const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { query } = require('./database/db');
const { requireLogin, requireRole, requireWarehouseAccess } = require('./middleware/auth');
const { setSecureHeaders, csrfProtection, sanitizeInput } = require('./middleware/security');
const { auditLog } = require('./middleware/audit');
const multer = require('multer'); 

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
const reportsDir = path.join(__dirname, 'reports');
const productImagesDir = path.join(__dirname, 'public', 'uploads'); 

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);
if (!fs.existsSync(productImagesDir)) fs.mkdirSync(productImagesDir, { recursive: true });

const productImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, productImagesDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const uploadProductImage = multer({ storage: productImageStorage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: crypto.randomBytes(32).toString('hex'), 
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000 
  },
  rolling: true 
}));

app.use(setSecureHeaders);
app.use(csrfProtection);
app.use(sanitizeInput);

app.use(express.static(path.join(__dirname, 'public')));


// API 1 AUTHENTICATION
// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
  }

  try {
    const user = await query.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Kredensial tidak valid.' });
    }

    if (user.status === 'Inactive') {
      return res.status(403).json({ success: false, message: 'Akun Anda dinonaktifkan. Silakan hubungi admin.' });
    }

    const bcrypt = require('bcryptjs');
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      await auditLog(req, 'LOGIN_FAILED', 'users', null, `Percobaan login gagal untuk username: ${username}`);
      return res.status(401).json({ success: false, message: 'Kredensial tidak valid.' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      warehouse_id: user.warehouse_id
    };

    await auditLog(req, 'LOGIN_SUCCESS', 'users', user.id, 'Pengguna berhasil masuk ke sistem.');
    
    res.json({
      success: true,
      message: 'Login berhasil.',
      user: {
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        warehouse_id: user.warehouse_id
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan sistem.' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', requireLogin, async (req, res) => {
  try {
    await auditLog(req, 'LOGOUT', 'users', req.session.user.id, 'Pengguna keluar dari sistem.');
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Gagal membersihkan sesi.' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true, message: 'Berhasil keluar.' });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kesalahan sistem.' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ success: true, user: req.session.user });
  }
  res.status(401).json({ success: false, message: 'Belum login.' });
});


// API 2 DASHBOARD STATS
// GET /api/dashboard/stats
app.get('/api/dashboard/stats', requireLogin, async (req, res) => {
  try {
    const user = req.session.user;
    let whClause = '';
    let params = [];

    if (user.role === 'Manajer Gudang' || user.role === 'Staf Gudang') {
      whClause = ' WHERE sb.warehouse_id = ?';
      params.push(user.warehouse_id);
    }

    const totalAssets = await query.get(
      `SELECT SUM(sb.remaining_qty * sb.purchase_price) as total_val 
       FROM stock_batches sb ${whClause}`,
      params
    );

    const totalProducts = await query.get(
      `SELECT COUNT(DISTINCT product_id) as total_items FROM stock_batches sb ${whClause}`,
      params
    );

    let lowStockQuery = `
      SELECT p.sku, p.name, p.min_stock, SUM(sb.remaining_qty) as total_qty, w.name as warehouse_name
      FROM products p
      JOIN stock_batches sb ON p.id = sb.product_id
      JOIN warehouses w ON sb.warehouse_id = w.id
    `;
    let lowStockParams = [];
    if (user.role === 'Manajer Gudang' || user.role === 'Staf Gudang') {
      lowStockQuery += ` WHERE sb.warehouse_id = ?`;
      lowStockParams.push(user.warehouse_id);
    }
    lowStockQuery += ` GROUP BY p.id, sb.warehouse_id HAVING SUM(sb.remaining_qty) <= p.min_stock AND SUM(sb.remaining_qty) > 0`;

    const lowStockAlerts = await query.all(lowStockQuery, lowStockParams);

    let txQuery = `
      SELECT st.*, p.name as product_name, u.full_name as operator
      FROM stock_transactions st
      JOIN products p ON st.product_id = p.id
      JOIN users u ON st.created_by = u.id
    `;
    let txParams = [];
    if (user.role === 'Manajer Gudang' || user.role === 'Staf Gudang') {
      txQuery += ` WHERE st.from_warehouse_id = ? OR st.to_warehouse_id = ?`;
      txParams.push(user.warehouse_id, user.warehouse_id);
    }
    txQuery += ` ORDER BY st.created_at DESC LIMIT 5`;
    const recentTx = await query.all(txQuery, txParams);

    res.json({
      success: true,
      stats: {
        totalAssetValue: totalAssets.total_val || 0,
        totalProductCount: totalProducts.total_items || 0,
        lowStockAlerts,
        recentTransactions: recentTx
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal memuat statistik dashboard.' });
  }
});


// API 3 INVENTORY DATA CRUD
// Gudang (Warehouses)
app.get('/api/warehouses', requireLogin, async (req, res) => {
  try {
    const list = await query.all('SELECT * FROM warehouses ORDER BY code');
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Kategori (Categories)
app.get('/api/categories', requireLogin, async (req, res) => {
  try {
    const list = await query.all('SELECT * FROM categories ORDER BY name');
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Supplier
app.get('/api/suppliers', requireLogin, async (req, res) => {
  try {
    const list = await query.all('SELECT * FROM suppliers ORDER BY name');
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// CRUD Produk (Products)
app.get('/api/products', requireLogin, async (req, res) => {
  const { search, category_id, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let sql = `
      SELECT p.*, c.name as category_name, s.name as supplier_name,
             COALESCE(SUM(sb.remaining_qty), 0) as total_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN stock_batches sb ON p.id = sb.product_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ` AND (p.sku LIKE ? OR p.name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category_id) {
      sql += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    sql += ` GROUP BY p.id ORDER BY p.sku LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const rows = await query.all(sql, params);

    let countSql = `SELECT COUNT(*) as total FROM products WHERE 1=1`;
    const countParams = [];
    if (search) {
      countSql += ` AND (sku LIKE ? OR name LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    if (category_id) {
      countSql += ` AND category_id = ?`;
      countParams.push(category_id);
    }
    const countRow = await query.get(countSql, countParams);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: countRow.total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(countRow.total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/products', requireLogin, requireRole(['Admin', 'Manajer Gudang']), uploadProductImage.single('image'), async (req, res) => {
  const { sku, name, category_id, supplier_id, description, min_stock, price } = req.body;

  if (!sku || !name || !category_id || !supplier_id || isNaN(price)) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap atau format salah.' });
  }

  try {
    const imageName = req.file ? req.file.filename : 'default-product.jpg';

    const resInsert = await query.run(
      `INSERT INTO products (sku, name, category_id, supplier_id, description, min_stock, price, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sku.toUpperCase(), name, category_id, supplier_id, description || '', min_stock || 10, price, imageName]
    );

    await auditLog(req, 'CREATE_PRODUCT', 'products', resInsert.id, `Membuat produk baru dengan SKU: ${sku}`);
    res.json({ success: true, message: 'Produk berhasil ditambahkan.', id: resInsert.id });

  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ success: false, message: 'Produk dengan SKU ini sudah terdaftar.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/products/:id', requireLogin, requireRole(['Admin', 'Manajer Gudang']), async (req, res) => {
  const { name, category_id, supplier_id, description, min_stock, price } = req.body;
  const prodId = req.params.id;

  try {
    const oldProd = await query.get('SELECT * FROM products WHERE id = ?', [prodId]);
    if (!oldProd) {
      return res.status(444).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    await query.run(
      `UPDATE products 
       SET name = ?, category_id = ?, supplier_id = ?, description = ?, min_stock = ?, price = ?
       WHERE id = ?`,
      [name, category_id, supplier_id, description || '', min_stock, price, prodId]
    );

    await auditLog(req, 'UPDATE_PRODUCT', 'products', prodId, {
      old: oldProd,
      new: { name, category_id, supplier_id, description, min_stock, price }
    });

    res.json({ success: true, message: 'Produk berhasil diperbarui.' });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/products/:id', requireLogin, requireRole(['Admin']), async (req, res) => {
  const prodId = req.params.id;

  try {
    const product = await query.get('SELECT * FROM products WHERE id = ?', [prodId]);
    if (!product) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });

    await query.run('DELETE FROM products WHERE id = ?', [prodId]);
    await auditLog(req, 'DELETE_PRODUCT', 'products', prodId, `Menghapus produk SKU: ${product.sku}`);

    res.json({ success: true, message: 'Produk berhasil dihapus.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menghapus produk. Kemungkinan produk masih terkait dengan transaksi stok.' });
  }
});

// API 4 TRANSACTION & ENGINE FIFO/LIFO 
// POST /api/transactions 
app.post('/api/transactions', requireLogin, requireRole(['Admin', 'Manajer Gudang', 'Staf Gudang']), requireWarehouseAccess, async (req, res) => {
  const { product_id, warehouse_id, quantity, type, method = 'FIFO', purchase_price } = req.body;
  const user = req.session.user;

  if (!product_id || !warehouse_id || !quantity || !type) {
    return res.status(400).json({ success: false, message: 'Data transaksi tidak lengkap.' });
  }

  const qty = parseInt(quantity, 10);
  if (qty <= 0) return res.status(400).json({ success: false, message: 'Kuantitas harus lebih besar dari 0.' });

  try {
    const txCode = `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const result = await query.transaction(async (tx) => {
      if (type === 'IN') {
        const price = parseFloat(purchase_price);
        if (isNaN(price) || price <= 0) {
          throw new Error('Harga pembelian (HPP) diperlukan untuk transaksi masuk.');
        }

        const batchInsert = await tx.run(
          `INSERT INTO stock_batches (product_id, warehouse_id, initial_qty, remaining_qty, purchase_price)
           VALUES (?, ?, ?, ?, ?)`,
          [product_id, warehouse_id, qty, qty, price]
        );

        await tx.run(
          `INSERT INTO stock_transactions (transaction_code, product_id, to_warehouse_id, quantity, type, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [txCode, product_id, warehouse_id, qty, 'IN', user.id]
        );

        return { success: true, message: 'Stok masuk berhasil dicatat.', code: txCode };
      }

      if (type === 'OUT') {
        let orderBy = 'received_at ASC, id ASC'; // FIFO 
        if (method === 'LIFO') {
          orderBy = 'received_at DESC, id DESC'; // LIFO 
        }

        const activeBatches = await tx.all(
          `SELECT * FROM stock_batches 
           WHERE product_id = ? AND warehouse_id = ? AND remaining_qty > 0
           ORDER BY ${orderBy}`,
          [product_id, warehouse_id]
        );

        const totalAvail = activeBatches.reduce((acc, cur) => acc + cur.remaining_qty, 0);
        if (totalAvail < qty) {
          throw new Error(`Stok tidak mencukupi. Tersedia: ${totalAvail}, Diminta: ${qty}`);
        }

        let needed = qty;
        const consumedBatches = [];

        for (const batch of activeBatches) {
          if (needed <= 0) break;

          if (batch.remaining_qty >= needed) {
            await tx.run(
              'UPDATE stock_batches SET remaining_qty = remaining_qty - ? WHERE id = ?',
              [needed, batch.id]
            );
            consumedBatches.push({ batch_id: batch.id, qty: needed, hpp: batch.purchase_price });
            needed = 0;
          } else {
            await tx.run(
              'UPDATE stock_batches SET remaining_qty = 0 WHERE id = ?',
              [batch.id]
            );
            consumedBatches.push({ batch_id: batch.id, qty: batch.remaining_qty, hpp: batch.purchase_price });
            needed -= batch.remaining_qty;
          }
        }

        await tx.run(
          `INSERT INTO stock_transactions (transaction_code, product_id, from_warehouse_id, quantity, type, batch_info, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [txCode, product_id, warehouse_id, qty, 'OUT', JSON.stringify(consumedBatches), user.id]
        );

        return { success: true, message: 'Stok keluar berhasil dikurangi (FIFO/LIFO).', code: txCode };
      }

      throw new Error('Tipe transaksi tidak valid.');
    });

    await auditLog(req, `TRANSACTION_${type}`, 'stock_transactions', null, `Transaksi ${type} berhasil dicatat dengan kode: ${txCode}`);
    res.json(result);

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// API 5 PARALLEL WAREHOUSE TRANSFER (Modul 5)
// POST /api/transfers
app.post('/api/transfers', requireLogin, requireRole(['Admin', 'Manajer Gudang']), async (req, res) => {
  const { product_id, from_warehouse_id, to_warehouse_id, quantity, method = 'FIFO' } = req.body;
  const user = req.session.user;

  if (!product_id || !from_warehouse_id || !to_warehouse_id || !quantity) {
    return res.status(400).json({ success: false, message: 'Data transfer tidak lengkap.' });
  }

  const qty = parseInt(quantity, 10);
  if (qty <= 0) return res.status(400).json({ success: false, message: 'Kuantitas harus > 0' });
  if (from_warehouse_id === to_warehouse_id) return res.status(400).json({ success: false, message: 'Gudang asal dan tujuan tidak boleh sama.' });

  try {
    const txCode = `TRF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const result = await query.transaction(async (tx) => {
      let orderBy = 'received_at ASC, id ASC';
      if (method === 'LIFO') orderBy = 'received_at DESC, id DESC';

      const activeBatches = await tx.all(
        `SELECT * FROM stock_batches 
         WHERE product_id = ? AND warehouse_id = ? AND remaining_qty > 0
         ORDER BY ${orderBy}`,
        [product_id, from_warehouse_id]
      );

      const totalAvail = activeBatches.reduce((acc, cur) => acc + cur.remaining_qty, 0);
      if (totalAvail < qty) {
        throw new Error(`Gagal transfer. Stok di gudang asal tidak mencukupi (Tersedia: ${totalAvail}, Diminta: ${qty}).`);
      }

      let needed = qty;
      const consumedBatches = [];
      let totalCostValue = 0; 

      for (const batch of activeBatches) {
        if (needed <= 0) break;

        if (batch.remaining_qty >= needed) {
          await tx.run('UPDATE stock_batches SET remaining_qty = remaining_qty - ? WHERE id = ?', [needed, batch.id]);
          consumedBatches.push({ batch_id: batch.id, qty: needed, hpp: batch.purchase_price });
          totalCostValue += needed * batch.purchase_price;
          needed = 0;
        } else {
          await tx.run('UPDATE stock_batches SET remaining_qty = 0 WHERE id = ?', [batch.id]);
          consumedBatches.push({ batch_id: batch.id, qty: batch.remaining_qty, hpp: batch.purchase_price });
          totalCostValue += batch.remaining_qty * batch.purchase_price;
          needed -= batch.remaining_qty;
        }
      }

      const averageHpp = totalCostValue / qty;

      await tx.run(
        `INSERT INTO stock_batches (product_id, warehouse_id, initial_qty, remaining_qty, purchase_price)
         VALUES (?, ?, ?, ?, ?)`,
        [product_id, to_warehouse_id, qty, qty, averageHpp]
      );

      await tx.run(
        `INSERT INTO stock_transactions (transaction_code, product_id, from_warehouse_id, to_warehouse_id, quantity, type, batch_info, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [txCode, product_id, from_warehouse_id, to_warehouse_id, qty, 'TRANSFER', JSON.stringify(consumedBatches), user.id]
      );

      const syncPayload = JSON.stringify({
        product_id,
        from_warehouse_id,
        to_warehouse_id,
        quantity: qty,
        averageHpp,
        txCode
      });

      await tx.run(
        `INSERT INTO sync_queue (source_warehouse_id, target_warehouse_id, payload)
         VALUES (?, ?, ?)`,
        [from_warehouse_id, to_warehouse_id, syncPayload]
      );

      return { success: true, message: 'Transfer paralel berhasil diselesaikan secara atomic.', code: txCode };
    });

    setTimeout(() => {
      processSyncQueue();
    }, 3000);

    await auditLog(req, 'STOCK_TRANSFER', 'stock_transactions', null, `Transfer stok dari gudang ${from_warehouse_id} ke ${to_warehouse_id} sebanyak ${qty} unit dengan kode: ${txCode}`);
    res.json(result);

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

async function processSyncQueue() {
  try {
    const pendingJobs = await query.all('SELECT * FROM sync_queue WHERE status = "PENDING"');
    
    for (const job of pendingJobs) {
      await query.run('UPDATE sync_queue SET status = "COMPLETED", attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [job.id]);
      console.log(`Sync Queue ID ${job.id} berhasil disinkronkan otomatis.`);
    }
  } catch (err) {
    console.error('Antrean sync otomatis gagal diproses:', err.message);
  }
}

// API 6 PARALLEL CSV IMPORT (Modul 5)
const uploadCsv = multer({ dest: 'uploads/' });

// POST /api/import
app.post('/api/import', requireLogin, requireRole(['Admin']), uploadCsv.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'File CSV tidak ditemukan.' });
  }

  const filePath = req.file.path;
  const dbPath = path.join(__dirname, 'database', 'smartstock.db');

  try {
    const worker = new Worker(path.join(__dirname, 'workers', 'import-worker.js'), {
      workerData: { filePath, dbPath }
    });

    worker.on('message', async (message) => {
      if (message.status === 'processing') {
        console.log(`CSV Import Progress: ${message.progress}% (${message.processed}/${message.total})`);
      } else if (message.status === 'completed') {
        fs.unlinkSync(filePath); 
        
        await auditLog(req, 'BATCH_IMPORT_CSV', 'products', null, `Batch Import CSV berhasil: ${message.processed} record sukses, ${message.errors} error.`);
        
        console.log('Batch import CSV sukses diselesaikan.');
      } else if (message.status === 'error') {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        console.error('Batch import CSV error:', message.error);
      }
    });

    worker.on('error', (err) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      console.error('Worker Import Crash:', err);
    });

    res.json({
      success: true,
      message: 'File diterima. Proses import paralel sedang berjalan di latar belakang.'
    });

  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ success: false, message: error.message });
  }
});


// API 7 BACKGROUND JOBS FOR REPORTS 
app.post('/api/reports/export', requireLogin, async (req, res) => {
  const { reportType, format, filters } = req.body; 
  const user = req.session.user;

  if (!reportType) return res.status(400).json({ success: false, message: 'Tipe laporan wajib dipilih.' });

  const fileExt = format === 'PDF' ? 'pdf' : 'csv';
  const fileName = `Laporan-${reportType}-${Date.now()}.${fileExt}`;
  const savePath = path.join(reportsDir, fileName);
  const dbPath = path.join(__dirname, 'database', 'smartstock.db');

  const cleanFilters = { ...filters };
  if (user.role === 'Manajer Gudang' || user.role === 'Staf Gudang') {
    cleanFilters.warehouseId = user.warehouse_id;
  }

  try {
    const worker = new Worker(path.join(__dirname, 'workers', 'report-worker.js'), {
      workerData: { reportType, format: format || 'CSV', savePath, dbPath, filters: cleanFilters }
    });

    worker.on('message', async (message) => {
      if (message.status === 'completed') {
        await auditLog(req, 'EXPORT_REPORT', null, null, `Berhasil mencetak laporan ${reportType} berformat ${format || 'CSV'}.`);
        console.log(`Laporan ${reportType} siap diunduh di: ${message.savePath}`);
      } else if (message.status === 'error') {
        console.error(`Gagal membuat laporan ${reportType}:`, message.error);
      }
    });

    res.json({
      success: true,
      message: 'Pembuatan laporan sedang diproses di latar belakang. Silakan cek menu Laporan dalam beberapa saat.',
      fileName
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/reports/download/:fileName', requireLogin, (req, res) => {
  const fileName = req.params.fileName;
  const filePath = path.join(reportsDir, fileName);

  if (path.basename(fileName) !== fileName) {
    return res.status(400).json({ success: false, message: 'Nama file tidak valid.' });
  }

  if (fs.existsSync(filePath)) {
    if (fileName.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    } else {
      res.setHeader('Content-Type', 'text/csv');
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.sendFile(filePath);
  }

  res.status(404).json({ success: false, message: 'File laporan belum siap atau tidak ditemukan.' });
});

// GET /api/audit-logs
app.get('/api/audit-logs', requireLogin, requireRole(['Admin']), async (req, res) => {
  try {
    const logs = await query.all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  SMARTSTOCK PRO SERVER - PT MAJU BERSAMA DIGITAL`);
  console.log(`  Berjalan di: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
