const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const { filePath, dbPath } = workerData;

function parseCSV(content) {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
    const values = matches.map(v => v.trim().replace(/^"|"$/g, ''));
    
    if (values.length === headers.length) {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = values[index];
      });
      records.push(record);
    }
  }
  return records;
}

async function startImport() {
  const db = new sqlite3.Database(dbPath);
  
  try {
    const csvContent = fs.readFileSync(filePath, 'utf8');
    const records = parseCSV(csvContent);
    const total = records.length;
    
    if (total === 0) {
      parentPort.postMessage({ status: 'error', error: 'File CSV kosong atau format tidak valid.' });
      db.close();
      return;
    }

    parentPort.postMessage({ status: 'processing', progress: 0, processed: 0, total });

    db.serialize(() => {
      db.run('PRAGMA journal_mode = WAL;');
      db.run('PRAGMA foreign_keys = ON;');
    });

    let processedCount = 0;
    let errorCount = 0;
    const errorsList = [];

    const categoryMap = {};
    const supplierMap = {};

    await new Promise((resolve) => {
      db.all('SELECT id, name FROM categories', (err, rows) => {
        if (rows) rows.forEach(row => categoryMap[row.name.toLowerCase()] = row.id);
        resolve();
      });
    });

    let defaultSupplierId = 1;
    await new Promise((resolve) => {
      db.all('SELECT id, name FROM suppliers', (err, rows) => {
        if (rows && rows.length > 0) {
          defaultSupplierId = rows[0].id;
          rows.forEach(row => supplierMap[row.name.toLowerCase()] = row.id);
        }
        resolve();
      });
    });

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      const insertProductStmt = db.prepare(
        'INSERT OR IGNORE INTO products (sku, name, category_id, supplier_id, description, min_stock, price) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );

      const insertBatchStmt = db.prepare(
        'INSERT INTO stock_batches (product_id, warehouse_id, initial_qty, remaining_qty, purchase_price) VALUES (?, ?, ?, ?, ?)'
      );

      records.forEach((record, index) => {
        const sku = record.sku || record['Kode Produk'];
        const name = record.name || record['Nama Barang'];
        const categoryName = record.category || record['Kategori'];
        const supplierName = record.supplier || record['Supplier Utama'];
        const price = parseFloat(record.price || record['Harga Jual Satuan'] || 0);
        const minStock = parseInt(record.min_stock || record['Stok Minimum'] || 10, 10);
        const qtyJakarta = parseInt(record.qty_jakarta || record['Stok Gudang Jakarta'] || 0, 10);
        const qtySurabaya = parseInt(record.qty_surabaya || record['Stok Gudang Surabaya'] || 0, 10);
        const purchasePrice = price * 0.8; // Asumsi harga beli 80% dari harga jual

        if (!sku || !name || isNaN(price)) {
          errorCount++;
          errorsList.push(`Baris ${index + 2}: SKU, Nama Produk, atau Harga tidak valid.`);
          return;
        }

        let categoryId = categoryName ? categoryMap[categoryName.toLowerCase()] : null;
        if (!categoryId && categoryName) {
          db.run(
            'INSERT OR IGNORE INTO categories (code, name) VALUES (?, ?)',
            [categoryName.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 100), categoryName],
            function (err) {
              if (this.lastID) {
                categoryId = this.lastID;
                categoryMap[categoryName.toLowerCase()] = categoryId;
              }
            }
          );
        }
        
        categoryId = categoryId || 1; // Default 

        const supplierId = (supplierName ? supplierMap[supplierName.toLowerCase()] : null) || defaultSupplierId;

        insertProductStmt.run([sku, name, categoryId, supplierId, '', minStock, price], function (err) {
          if (err) {
            errorCount++;
            errorsList.push(`Baris ${index + 2}: Gagal insert produk (${err.message})`);
          } else {
            const productId = this.lastID;
            
            if (productId) {
              if (qtyJakarta > 0) {
                insertBatchStmt.run([productId, 1, qtyJakarta, qtyJakarta, purchasePrice]);
              }
              if (qtySurabaya > 0) {
                insertBatchStmt.run([productId, 2, qtySurabaya, qtySurabaya, purchasePrice]);
              }
            } else {
              db.get('SELECT id FROM products WHERE sku = ?', [sku], (err, row) => {
                if (row) {
                  const existingProdId = row.id;
                  if (qtyJakarta > 0) {
                    db.run('INSERT INTO stock_batches (product_id, warehouse_id, initial_qty, remaining_qty, purchase_price) VALUES (?, ?, ?, ?, ?)', [existingProdId, 1, qtyJakarta, qtyJakarta, purchasePrice]);
                  }
                  if (qtySurabaya > 0) {
                    db.run('INSERT INTO stock_batches (product_id, warehouse_id, initial_qty, remaining_qty, purchase_price) VALUES (?, ?, ?, ?, ?)', [existingProdId, 2, qtySurabaya, qtySurabaya, purchasePrice]);
                  }
                }
              });
            }
          }
        });

        processedCount++;
        
        if (processedCount % 50 === 0 || processedCount === total) {
          const progress = Math.round((processedCount / total) * 100);
          parentPort.postMessage({
            status: 'processing',
            progress,
            processed: processedCount,
            total
          });
        }
      });

      db.run('COMMIT', (err) => {
        insertProductStmt.finalize();
        insertBatchStmt.finalize();
        db.close();

        if (err) {
          parentPort.postMessage({ status: 'error', error: `Gagal commit transaksi: ${err.message}` });
        } else {
          parentPort.postMessage({
            status: 'completed',
            processed: processedCount - errorCount,
            errors: errorCount,
            details: errorsList
          });
        }
      });
    });

  } catch (error) {
    db.close();
    parentPort.postMessage({ status: 'error', error: error.message });
  }
}

startImport();
