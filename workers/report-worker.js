const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const { reportType, savePath, dbPath, filters } = workerData;

async function generateReport() {
  const db = new sqlite3.Database(dbPath);
  
  try {
    parentPort.postMessage({ status: 'processing', progress: 10 });

    if (reportType === 'INVENTORY_STATUS') {
      let query = `
        SELECT 
          p.sku, 
          p.name as product_name, 
          c.name as category_name, 
          s.name as supplier_name,
          p.price,
          p.min_stock,
          w.name as warehouse_name,
          SUM(sb.remaining_qty) as total_stock,
          SUM(sb.remaining_qty * sb.purchase_price) as asset_value
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN stock_batches sb ON p.id = sb.product_id
        LEFT JOIN warehouses w ON sb.warehouse_id = w.id
        WHERE sb.remaining_qty > 0
      `;

      const params = [];
      if (filters && filters.warehouseId) {
        query += ` AND sb.warehouse_id = ?`;
        params.push(filters.warehouseId);
      }

      query += ` GROUP BY p.id, sb.warehouse_id ORDER BY w.name, p.sku`;

      parentPort.postMessage({ status: 'processing', progress: 40 });

      db.all(query, params, (err, rows) => {
        if (err) throw err;

        parentPort.postMessage({ status: 'processing', progress: 70 });

        let csvContent = '\uFEFF'; 
        csvContent += 'LAPORAN STATUS INVENTARIS REAL-TIME - SMARTSTOCK PRO\n';
        csvContent += `Tanggal Cetak: ${new Date().toLocaleString('id-ID')}\n\n`;
        csvContent += 'SKU,Nama Produk,Kategori,Supplier,Harga Jual (Rp),Stok Minimum,Gudang,Stok Saat Ini,Nilai Aset HPP (Rp)\n';

        rows.forEach(r => {
          csvContent += `"${r.sku}","${r.product_name}","${r.category_name}","${r.supplier_name}",${r.price},${r.min_stock},"${r.warehouse_name}",${r.total_stock},${r.asset_value}\n`;
        });

        fs.writeFileSync(savePath, csvContent, 'utf8');
        db.close();
        
        parentPort.postMessage({ status: 'completed', savePath });
      });

    } else if (reportType === 'STOCK_MOVEMENT') {
      let query = `
        SELECT 
          st.transaction_code,
          p.sku,
          p.name as product_name,
          w_from.name as from_warehouse,
          w_to.name as to_warehouse,
          st.quantity,
          st.type,
          st.status,
          u.full_name as operator,
          st.created_at
        FROM stock_transactions st
        JOIN products p ON st.product_id = p.id
        LEFT JOIN warehouses w_from ON st.from_warehouse_id = w_from.id
        LEFT JOIN warehouses w_to ON st.to_warehouse_id = w_to.id
        JOIN users u ON st.created_by = u.id
        WHERE 1=1
      `;

      const params = [];
      if (filters) {
        if (filters.warehouseId) {
          query += ` AND (st.from_warehouse_id = ? OR st.to_warehouse_id = ?)`;
          params.push(filters.warehouseId, filters.warehouseId);
        }
        if (filters.startDate) {
          query += ` AND st.created_at >= ?`;
          params.push(filters.startDate + ' 00:00:00');
        }
        if (filters.endDate) {
          query += ` AND st.created_at <= ?`;
          params.push(filters.endDate + ' 23:59:59');
        }
      }

      query += ` ORDER BY st.created_at DESC`;

      parentPort.postMessage({ status: 'processing', progress: 40 });

      db.all(query, params, (err, rows) => {
        if (err) throw err;

        parentPort.postMessage({ status: 'processing', progress: 70 });

        let csvContent = '\uFEFF'; 
        csvContent += 'LAPORAN MUTASI DAN TRANSAKSI STOK - SMARTSTOCK PRO\n';
        csvContent += `Tanggal Cetak: ${new Date().toLocaleString('id-ID')}\n\n`;
        csvContent += 'Kode Transaksi,SKU,Nama Produk,Gudang Asal,Gudang Tujuan,Kuantitas,Tipe,Status,Operator,Waktu\n';

        rows.forEach(r => {
          csvContent += `"${r.transaction_code}","${r.sku}","${r.product_name}","${r.from_warehouse || '-'}","${r.to_warehouse || '-'}",${r.quantity},"${r.type}","${r.status}","${r.operator}","${r.created_at}"\n`;
        });

        fs.writeFileSync(savePath, csvContent, 'utf8');
        db.close();
        
        parentPort.postMessage({ status: 'completed', savePath });
      });

    } else {
      db.close();
      parentPort.postMessage({ status: 'error', error: 'Tipe laporan tidak dikenali.' });
    }

  } catch (error) {
    db.close();
    parentPort.postMessage({ status: 'error', error: error.message });
  }
}

generateReport();
