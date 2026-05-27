const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'smartstock.db');

if (!fs.existsSync(__dirname)) {
  fs.mkdirSync(__dirname, { recursive: true });
}

// Inisialisasi Database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Koneksi database gagal:', err.message);
  } else {
    console.log('Koneksi ke database SQLite berhasil.');
    // Aktifkan WAL 
    db.run('PRAGMA journal_mode = WAL;', (err) => {
      if (err) console.error('Gagal mengaktifkan mode WAL:', err);
      else console.log('Mode database WAL diaktifkan.');
    });
    // Aktifkan Foreign Keys
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) console.error('Gagal mengaktifkan foreign keys:', err);
      else {
        console.log('Foreign keys diaktifkan.');
        
        db.run(`ALTER TABLE products ADD COLUMN image TEXT DEFAULT 'default-product.jpg'`, (err) => {
          if (err) {
            console.log('INFO: Kolom image sudah tersedia atau aman.');
          } else {
            console.log('MANTAP: Kolom image berhasil disuntikkan langsung ke smartstock.db!');
          }
        });
      }
    });
  }
});

const query = {
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Perintah INSERT, UPDATE, DELETE
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },

  transaction(callback) {
    return new Promise((resolve, reject) => {
      db.serialize(async () => {
        try {
          db.run('BEGIN EXCLUSIVE TRANSACTION');
          const result = await callback(query);
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve(result);
          });
        } catch (error) {
          db.run('ROLLBACK', () => {
            reject(error);
          });
        }
      });
    });
  }
};

module.exports = { db, query };