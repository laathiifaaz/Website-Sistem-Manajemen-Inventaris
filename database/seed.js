const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const schemaPath = path.join(__dirname, 'schema.sql');

db.serialize(async () => {
  console.log('Memulai inisialisasi skema database...');
  
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const queries = schema.split(';').map(q => q.trim()).filter(q => q.length > 0);
  
  for (const q of queries) {
    await new Promise((resolve, reject) => {
      db.run(q, (err) => {
        if (err) {
          console.error(`Gagal mengeksekusi query: ${q.substring(0, 50)}...`, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  console.log('Skema database berhasil dibuat.');

  console.log('Memulai seeding data awal...');

  // Gudang (5 Gudang)
  const warehouses = [
    { code: 'GD-JKT', name: 'Gudang Jakarta', location: 'Jakarta Barat' },
    { code: 'GD-SUB', name: 'Gudang Surabaya', location: 'Surabaya Rungkut' },
    { code: 'GD-BDO', name: 'Gudang Bandung', location: 'Bandung Soekarno-Hatta' },
    { code: 'GD-KNO', name: 'Gudang Medan', location: 'Medan Deli Serdang' },
    { code: 'GD-UPG', name: 'Gudang Makassar', location: 'Makassar Panakkukang' }
  ];

  for (const wh of warehouses) {
    await new Promise((resolve) => {
      db.run(
        'INSERT OR IGNORE INTO warehouses (code, name, location) VALUES (?, ?, ?)',
        [wh.code, wh.name, wh.location],
        resolve
      );
    });
  }
  console.log('Data 5 Gudang awal berhasil dibuat.');

  const jktWh = await new Promise((resolve) => {
    db.get("SELECT id FROM warehouses WHERE code = 'GD-JKT'", (err, row) => resolve(row));
  });

  // Users (Hashed Passwords)
  const salt = bcrypt.genSaltSync(10);
  const users = [
    {
      username: 'admin',
      password: 'Admin123!',
      role: 'Admin',
      full_name: 'Super Administrator',
      whId: null
    },
    {
      username: 'manajer_jkt',
      password: 'Manager123!',
      role: 'Manajer Gudang',
      full_name: 'Budi Santoso (Manajer JKT)',
      whId: jktWh.id
    },
    {
      username: 'staf_jkt',
      password: 'Staff123!',
      role: 'Staf Gudang',
      full_name: 'Agus Setiawan (Staf JKT)',
      whId: jktWh.id
    },
    {
      username: 'viewer',
      password: 'Viewer123!',
      role: 'Viewer',
      full_name: 'Direksi / Auditor',
      whId: null
    }
  ];

  for (const u of users) {
    const hash = bcrypt.hashSync(u.password, salt);
    await new Promise((resolve) => {
      db.run(
        'INSERT OR IGNORE INTO users (username, password_hash, role, full_name, warehouse_id) VALUES (?, ?, ?, ?, ?)',
        [u.username, hash, u.role, u.full_name, u.whId],
        resolve
      );
    });
  }
  console.log('Data akun multi-level berhasil dibuat.');

  // Kategori
  const categories = [
    { code: 'EL', name: 'Elektronik Rumah Tangga' },
    { code: 'CO', name: 'Komputer & Laptop' },
    { code: 'PH', name: 'Smartphone & Aksesoris' }
  ];

  for (const cat of categories) {
    await new Promise((resolve) => {
      db.run(
        'INSERT OR IGNORE INTO categories (code, name) VALUES (?, ?)',
        [cat.code, cat.name],
        resolve
      );
    });
  }
  console.log('Data Kategori berhasil dibuat.');

  // Supplier
  const suppliers = [
    { name: 'PT Indo Elektronik', contact: 'Indra Wijaya', phone: '08123456789', email: 'sales@indoelektrik.com', address: 'Glodok Plaza, Jakarta' },
    { name: 'PT Global Tech Indonesia', contact: 'Rina Kartika', phone: '08198765432', email: 'info@globaltech.co.id', address: 'Sudirman, Jakarta' }
  ];

  for (const sup of suppliers) {
    await new Promise((resolve) => {
      db.run(
        'INSERT OR IGNORE INTO suppliers (name, contact_name, phone, email, address) VALUES (?, ?, ?, ?, ?)',
        [sup.name, sup.contact, sup.phone, sup.email, sup.address],
        resolve
      );
    });
  }
  console.log('Data Supplier berhasil dibuat.');

  const catRows = await new Promise((resolve) => db.all("SELECT id, code FROM categories", (err, rows) => resolve(rows)));
  const supRows = await new Promise((resolve) => db.all("SELECT id FROM suppliers", (err, rows) => resolve(rows)));

  const catMap = {};
  catRows.forEach(c => catMap[c.code] = c.id);
  const supId = supRows[0].id;

  // Produk
  const products = [
    { sku: 'CO-LAP-001', name: 'ASUS ROG Zephyrus G14', catId: catMap['CO'], price: 25000000, min: 5, desc: 'Laptop gaming premium AMD Ryzen 9, RTX 4060' },
    { sku: 'PH-PHN-001', name: 'iPhone 15 Pro Max 256GB', catId: catMap['PH'], price: 18500000, min: 8, desc: 'Smartphone Titanium Case, Chip A17 Pro' },
    { sku: 'EL-TV-001', name: 'Samsung Smart TV 55 QLED', catId: catMap['EL'], price: 7500000, min: 10, desc: 'TV Pintar resolusi 4K dengan dukungan HDR10+' }
  ];

  for (const p of products) {
    await new Promise((resolve) => {
      db.run(
        'INSERT OR IGNORE INTO products (sku, name, category_id, supplier_id, description, min_stock, price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.sku, p.name, p.catId, supId, p.desc, p.min, p.price],
        resolve
      );
    });
  }
  console.log('Data Produk berhasil dibuat.');

  const prodRows = await new Promise((resolve) => db.all("SELECT id, sku, price FROM products", (err, rows) => resolve(rows)));
  const whRows = await new Promise((resolve) => db.all("SELECT id, code FROM warehouses", (err, rows) => resolve(rows)));

  const prodMap = {};
  prodRows.forEach(p => prodMap[p.sku] = p);
  const whMap = {};
  whRows.forEach(w => whMap[w.code] = w.id);

  // Stock Batches 
  // stok awal di Gudang Jakarta
  const stockSeed = [
    { sku: 'CO-LAP-001', whCode: 'GD-JKT', qty: 15, price: 22000000, date: '2026-05-10 10:00:00' },
    { sku: 'CO-LAP-001', whCode: 'GD-JKT', qty: 10, price: 23000000, date: '2026-05-20 14:00:00' }, 
    { sku: 'PH-PHN-001', whCode: 'GD-JKT', qty: 25, price: 16000000, date: '2026-05-15 09:00:00' },
    { sku: 'EL-TV-001', whCode: 'GD-JKT', qty: 8, price: 6500000, date: '2026-05-18 11:30:00' }, // Stok TV menipis (8 < 10)
    { sku: 'EL-TV-001', whCode: 'GD-SUB', qty: 20, price: 6400000, date: '2026-05-12 08:00:00' }
  ];

  for (const s of stockSeed) {
    const prod = prodMap[s.sku];
    const whId = whMap[s.whCode];
    if (prod && whId) {
      await new Promise((resolve) => {
        db.run(
          'INSERT INTO stock_batches (product_id, warehouse_id, initial_qty, remaining_qty, purchase_price, received_at) VALUES (?, ?, ?, ?, ?, ?)',
          [prod.id, whId, s.qty, s.qty, s.price, s.date],
          resolve
        );
      });
    }
  }
  console.log('Seeding data awal Stock Batches berhasil diselesaikan.');
  console.log('DATABASE SIAP DIGUNAKAN!');
  
  db.close();
});
