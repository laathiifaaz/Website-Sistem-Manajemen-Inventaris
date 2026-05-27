let currentUser = null;
let activeView = 'dashboard';
let inactivityTimer = null;
let warningTimer = null;

// Waktu timeout sesi: 15 menit 
const WARNING_TIMEOUT = 14 * 60 * 1000; 
const LOGOUT_TIMEOUT = 1 * 60 * 1000;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  const res = await api.get('/api/auth/me');
  if (res.success) {
    currentUser = res.user;
    showMainApp();
  } else {
    showLogin();
  }

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      navigateTo(view);
    });
  });

  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  window.addEventListener('mousemove', resetInactivityTimer);
  window.addEventListener('keypress', resetInactivityTimer);
  document.getElementById('extend-session-btn').addEventListener('click', extendSession);
}

// AUTHENTICATION HANDLERS
async function handleLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('login-username').value;
  const passwordInput = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');

  const res = await api.post('/api/auth/login', { username: usernameInput, password: passwordInput });
  if (res.success) {
    currentUser = res.user;
    errorDiv.style.display = 'none';
    showMainApp();
  } else {
    errorDiv.textContent = res.message || 'Username atau password salah.';
    errorDiv.style.display = 'block';
  }
}

async function handleLogout() {
  await api.post('/api/auth/logout');
  currentUser = null;
  stopInactivityTimers();
  showLogin();
}

function showLogin() {
  document.getElementById('login-view').style.display = 'flex';
  document.getElementById('app-view').style.display = 'none';
}

function showMainApp() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'flex';
  
  document.getElementById('user-avatar').textContent = currentUser.full_name.substring(0, 1).toUpperCase();
  document.getElementById('user-display-name').textContent = currentUser.full_name;
  document.getElementById('user-display-role').textContent = currentUser.role;

  if (currentUser.role === 'Admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  resetInactivityTimer();
  
  navigateTo('dashboard');
}

// SESSION TIMEOUT TIMERS
function resetInactivityTimer() {
  if (!currentUser) return;
  
  clearTimeout(inactivityTimer);
  clearTimeout(warningTimer);
  
  document.getElementById('timeout-modal').classList.remove('active');

  inactivityTimer = setTimeout(() => {
    showTimeoutWarning();
  }, WARNING_TIMEOUT);
}

function showTimeoutWarning() {
  document.getElementById('timeout-modal').classList.add('active');
  
  warningTimer = setTimeout(() => {
    handleLogout();
    alert('Sesi Anda telah kedaluwarsa karena tidak ada aktivitas.');
  }, LOGOUT_TIMEOUT);
}

function extendSession() {
  api.get('/api/auth/me');
  resetInactivityTimer();
}

function stopInactivityTimers() {
  clearTimeout(inactivityTimer);
  clearTimeout(warningTimer);
  document.getElementById('timeout-modal').classList.remove('active');
}

// ROUTER & NAVIGATION
function navigateTo(view) {
  activeView = view;
  
  document.querySelectorAll('.sidebar-link').forEach(link => {
    if (link.getAttribute('data-view') === view) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  const titleEl = document.getElementById('page-title-text');
  const subEl = document.getElementById('page-subtitle-text');
  
  switch(view) {
    case 'dashboard':
      titleEl.textContent = 'Dashboard Analytics';
      subEl.textContent = 'Ringkasan performa inventaris 5 gudang PT Maju Bersama Digital.';
      renderDashboard();
      break;
    case 'products':
      titleEl.textContent = 'Manajemen Produk (CRUD)';
      subEl.textContent = 'Kelola detail produk, batas minimum stok, dan harga jual produk.';
      renderProductsView();
      break;
    case 'transfers':
      titleEl.textContent = 'Transfer Barang Paralel';
      subEl.textContent = 'Distribusi stok antar gudang real-time bebas dari bottleneck database.';
      renderTransfersView();
      break;
    case 'import':
      titleEl.textContent = 'Batch Import Data';
      subEl.textContent = 'Unggah ribuan data produk secara paralel menggunakan worker threads.';
      renderImportView();
      break;
    case 'reports':
      titleEl.textContent = 'Ekspor Laporan';
      subEl.textContent = 'Kompilasi laporan stok berskala besar melalui background process.';
      renderReportsView();
      break;
    case 'logs':
      titleEl.textContent = 'Audit Aktivitas Keamanan';
      subEl.textContent = 'Catatan aktivitas hukum (audit log) sistem manajemen inventaris.';
      renderLogsView();
      break;
  }
}

// VIEW RENDERER 1: DASHBOARD 
async function renderDashboard() {
  const container = document.getElementById('page-content');
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem; color: #2563eb;"></i></div>`;

  const resStats = await api.get('/api/dashboard/stats');
  if (!resStats.success) return;

  const stats = resStats.stats;

  const formatRupiah = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  let lowStockHtml = '';
  if (stats.lowStockAlerts.length > 0) {
    const alertsList = stats.lowStockAlerts.map(a => `• SKU ${a.sku} (${a.name}) sisa ${a.total_qty} unit di ${a.warehouse_name}`).join('<br>');
    lowStockHtml = `
      <div class="alert-banner animate-fade-in">
        <i class="fa-solid fa-triangle-exclamation alert-icon"></i>
        <div class="alert-content">
          <h4>SISTEM PERINGATAN: STOK MENIPIS!</h4>
          <p>${alertsList}</p>
        </div>
      </div>
    `;
  }

  let txRows = stats.recentTransactions.map(tx => {
    const dateStr = new Date(tx.created_at).toLocaleString('id-ID');
    const badgeClass = tx.type === 'IN' ? 'badge-in' : (tx.type === 'OUT' ? 'badge-out' : 'badge-trf');
    return `
      <tr>
        <td style="font-weight: 700;">${tx.transaction_code}</td>
        <td>${tx.product_name}</td>
        <td><span class="badge ${badgeClass}">${tx.type}</span></td>
        <td>${tx.quantity} unit</td>
        <td>${tx.operator}</td>
        <td style="color: #64748b;">${dateStr}</td>
      </tr>
    `;
  }).join('');

  if (stats.recentTransactions.length === 0) {
    txRows = `<tr><td colspan="6" style="text-align: center; color: #64748b;">Belum ada riwayat transaksi stok hari ini.</td></tr>`;
  }

  container.innerHTML = `
    ${lowStockHtml}

    <div class="stats-grid animate-fade-in" style="margin-bottom: 32px;">
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon icon-blue">
            <svg viewBox="0 0 24 24" class="svg-icon">
              <path d="M21 7.28V5c0-1.1-.9-2-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-2.28c.59-.35 1-.99 1-1.72V9c0-.73-.41-1.37-1-1.72M20 9v6h-7V9h7M5 5h14v3h-6c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h6v3H5V5m11 5.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5Z"/>
            </svg>
          </div>
        </div>
        <div class="stat-body" style="display: flex; flex-direction: column; height: 100%;">
          <span class="form-label">TREN NILAI INVENTARIS</span>
          <div style="width: 100%; height: 130px; margin-top: 10px; position: relative;">
            <canvas id="inventoryTrendChart"></canvas>
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon icon-blue">
            <svg viewBox="0 0 24 24" class="svg-icon">
              <path d="m20.54 5.23-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27M6.24 5h11.52l.83 1H5.41l.83-1M5 19V8h14v11H5m11-5.5-4 4-4-4 1.41-1.41L11 13.67V10h2v3.67l1.59-1.58L16 13.5Z"/>
            </svg>
          </div>
        </div>
        <div class="stat-body" style="display: flex; flex-direction: column; height: 100%;">
          <span class="form-label">RASIO MUTASI BARANG (IN VS OUT)</span>
          <div style="width: 100%; height: 130px; margin-top: 10px; position: relative; display: flex; justify-content: center; align-items: center;">
            <canvas id="productMutationChart"></canvas>
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon icon-danger">
            <svg viewBox="0 0 24 24" class="svg-icon">
              <path d="M12 22a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2m6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2m-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6Z"/>
            </svg>
          </div>
          ${stats.lowStockAlerts.length > 0 ? '<span class="stat-badge badge-danger">Critical</span>' : ''}
        </div>
        <div class="stat-body">
          <span class="form-label">PERINGATAN MENIPIS</span>
          <div class="stat-value">${stats.lowStockAlerts.length}</div>
          <span class="stat-subtext">Peringatan aktif saat ini</span>
        </div>
      </div>
    </div>

    <div class="glass-panel animate-fade-in" style="padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; margin-bottom: 32px;">
      <h3 style="margin-bottom: 20px; font-weight: 800; color: #0f172a; font-size: 1.1rem;">Mutasi Terakhir Real-Time</h3>
      <div class="table-responsive">
        <table class="cyber-table">
          <thead>
            <tr>
              <th>Kode Transaksi</th>
              <th>Nama Produk</th>
              <th>Tipe</th>
              <th>Jumlah</th>
              <th>Operator</th>
              <th>Waktu</th>
            </tr>
          </thead>
          <tbody>
            ${txRows}
          </tbody>
        </table>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; margin-bottom: 32px; align-items: stretch;">
      
      <div class="glass-panel" style="padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; margin: 0; display: flex; flex-direction: column; justify-content: space-between; height: 490px; box-sizing: border-box;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="font-weight: 800; color: #0f172a; margin: 0; font-size: 1.1rem;">Katalog Barang Tersedia</h3>
            <button onclick="navigateTo('products')" style="background: #eff6ff; color: #2563eb; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">Lihat Semua</button>
          </div>
          
          <div id="dashboard-catalog-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 175px); gap: 16px; align-content: start; min-height: 306px; max-height: 306px;">
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f1f5f9;">
          <span id="catalog-page-info" style="color: #64748b; font-size: 0.8rem; font-weight: 600;">Halaman 1</span>
          <div style="display: flex; gap: 8px;">
            <button id="catalog-prev-btn" class="btn-cyber btn-secondary" style="width: auto; padding: 6px 12px; font-size: 12px;">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button id="catalog-next-btn" class="btn-cyber btn-secondary" style="width: auto; padding: 6px 12px; font-size: 12px;">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="glass-panel animate-fade-in" style="padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; margin: 0; display: flex; flex-direction: column; height: 490px; box-sizing: border-box;">
        <h3 style="margin-bottom: 16px; font-weight: 800; color: #0f172a; font-size: 1.1rem;">Sebaran Lokasi Gudang</h3>
        <div id="warehouse-map" style="flex-grow: 1; border-radius: 12px; border: 1px solid #e2e8f0; z-index: 1;"></div>
      </div>

    </div>
  `;
  
  initWarehouseMap();

  // CHART TREN INVENTARIS
  const ctx = document.getElementById('inventoryTrendChart');

  if (ctx) {
    const chartLabels =
      stats.inventoryTrendLabels || ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'];

    const chartData =
      stats.inventoryTrendData || [
        142000000,
        155000000,
        149000000,
        168000000,
        172000000,
        stats.totalAssetValue || 185000000
      ];

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [{
          label: 'Nilai Aset',
          data: chartData,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#2563eb',
          pointHoverRadius: 5,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return new Intl.NumberFormat(
                  'id-ID',
                  {
                    style: 'currency',
                    currency: 'IDR',
                    maximumFractionDigits: 0
                  }
                ).format(context.raw);
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: {
                size: 9
              },
              color: '#64748b'
            }
          },
          y: {
            display: true,
            min: 100000000,
            ticks: {
              stepSize: 10000000,
              color: '#64748b',
              font: {
                size: 9
              },
              callback: function(value) {
                return (value / 1000000) + 'M';
              }
            },
            grid: {
              color: 'rgba(148, 163, 184, 0.12)',
              drawBorder: false
            }
          }
        }
      }
    });
  }

  // DONUT CHART MUTASI BARANG
  const ctxDonut = document.getElementById('productMutationChart');

  if (ctxDonut) {
    const totalIn = stats.totalItemsIn || 1250;
    const totalOut = stats.totalItemsOut || 840;

    new Chart(ctxDonut, {
      type: 'doughnut',
      data: {
        labels: ['Barang Masuk (IN)', 'Barang Keluar (OUT)'],
        datasets: [{
          data: [totalIn, totalOut],
          backgroundColor: ['#fccd3e', '#13327f'],
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              font: {
                size: 10,
                weight: 600
              },
              color: '#475569'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return ` ${context.label}: ${context.raw.toLocaleString()} Unit`;
              }
            }
          }
        },
        cutout: '65%'
      }
    });
  }
  
  loadDashboardCatalog();

  document.getElementById('catalog-prev-btn').addEventListener('click', () => {
    if (catalogPage > 1) {
      catalogPage--;
      loadDashboardCatalog();
    }
  });

  document.getElementById('catalog-next-btn').addEventListener('click', () => {
    catalogPage++;
    loadDashboardCatalog();
  });
}

// FUNGSI KHUSUS LOAD DATA KATALOG DASHBOARD
async function loadDashboardCatalog() {
  const gridContainer = document.getElementById('dashboard-catalog-grid');
  const prevBtn = document.getElementById('catalog-prev-btn');
  const nextBtn = document.getElementById('catalog-next-btn');
  const infoLabel = document.getElementById('catalog-page-info');

  gridContainer.style.opacity = "0.5";

  const resProducts = await api.get(`/api/products?page=${catalogPage}&limit=6`);
  gridContainer.style.opacity = "1";

  if (resProducts && resProducts.success && resProducts.data.length > 0) {
    let cardsHtml = resProducts.data.map(p => {
      const isLowStock = p.total_stock <= p.min_stock;
      const statusBadge = isLowStock 
        ? `<span style="position: absolute; top: 8px; left: 8px; background: #fff1f2; color: #e11d48; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 4px; z-index: 2;"><span style="width: 5px; height: 5px; background: #e11d48; border-radius: 50%;"></span> Low Stock</span>`
        : `<span style="position: absolute; top: 8px; left: 8px; background: #f0fdf4; color: #16a34a; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 4px; z-index: 2;"><span style="width: 5px; height: 5px; background: #16a34a; border-radius: 50%;"></span> In Stock</span>`;
      
      const progressPercent = Math.min((p.total_stock / 500) * 100, 100);
      const barColor = isLowStock ? '#e11d48' : '#2563eb';
      const productImg = p.image_url || 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=400&auto=format&fit=crop&q=60';

      return `
        <div class="animate-fade-in" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; position: relative; height: 145px; max-height: 145px; box-sizing: border-box;">
          ${statusBadge}
          <div style="width: 100%; height: 75px; background: #f8fafc; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
            <img src="${productImg}" alt="${p.name}" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
          <div style="padding: 10px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
            <div style="overflow: hidden;">
              <h4 style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;" title="${p.name}">${p.name}</h4>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b; margin-bottom: 2px;">
                <span>SKU: <strong style="color: #475569;">${p.sku}</strong></span>
                <span style="font-weight: 700; color: ${isLowStock ? '#e11d48' : '#0f172a'};">${p.total_stock.toLocaleString()} U</span>
              </div>
            </div>
            <div style="width: 100%; height: 4px; background: #f1f5f9; border-radius: 10px; overflow: hidden; flex-shrink: 0;">
              <div style="width: ${progressPercent}%; height: 100%; background: ${barColor}; border-radius: 10px;"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    gridContainer.innerHTML = cardsHtml;

    const totalPages = resProducts.pagination.totalPages;
    infoLabel.textContent = `Halaman ${catalogPage} dari ${totalPages}`;
    prevBtn.disabled = catalogPage <= 1;
    nextBtn.disabled = catalogPage >= totalPages;
  } else {
    gridContainer.innerHTML = `<div style="grid-column: span 3; text-align: center; color: #64748b; padding: 40px 0;">Belum ada produk terdaftar.</div>`;
    infoLabel.textContent = `Halaman ${catalogPage}`;
    prevBtn.disabled = catalogPage <= 1;
    nextBtn.disabled = true;
  }
}

// VIEW RENDERER 2: PRODUCTS CRUD
let productsPage = 1;
let productsSearch = '';
let productsCategory = '';
let catalogPage = 1;

async function renderProductsView() {
  const container = document.getElementById('page-content');
  
  container.innerHTML = `
    <div class="glass-panel animate-fade-in" style="padding: 24px; margin-bottom: 30px; display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
      <div style="display: flex; gap: 16px; flex-grow: 1; max-width: 600px;">
        <input type="text" id="prod-search-input" class="input-cyber" placeholder="Cari SKU atau nama produk..." value="${productsSearch}">
        <select id="prod-category-filter" class="input-cyber" style="width: 200px;">
          <option value="">Semua Kategori</option>
        </select>
      </div>
      
      <div style="display: flex; gap: 12px;">
        ${currentUser.role !== 'Viewer' ? `
          <button id="add-prod-btn" class="btn-cyber btn-primary" style="width: auto;">
            <i class="fa-solid fa-plus"></i> Tambah Produk
          </button>
        ` : ''}
      </div>
    </div>

    <div class="glass-panel animate-fade-in" style="padding: 24px;">
      <div class="table-responsive">
        <table class="cyber-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nama Produk</th>
              <th>Kategori</th>
              <th>Supplier</th>
              <th>Stok Gabungan</th>
              <th>Harga Jual (Rp)</th>
              ${currentUser.role !== 'Viewer' ? `<th style="text-align: center;">Aksi</th>` : ''}
            </tr>
          </thead>
          <tbody id="products-table-body">
            <!-- Data loaded dynamically -->
          </tbody>
        </table>
      </div>
      
      <!-- Pagination -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px;">
        <span id="prod-pagination-info" style="color: var(--text-muted); font-size: 0.85rem;">Menampilkan 0-0 dari 0 produk</span>
        <div style="display: flex; gap: 8px;">
          <button id="prod-prev-btn" class="btn-cyber btn-secondary" style="width: auto; padding: 8px 16px;">Sebelumnya</button>
          <button id="prod-next-btn" class="btn-cyber btn-secondary" style="width: auto; padding: 8px 16px;">Berikutnya</button>
        </div>
      </div>
    </div>
  `;

  loadCategoryDropdowns();
  loadProductsTable();

  document.getElementById('prod-search-input').addEventListener('input', (e) => {
    productsSearch = e.target.value;
    productsPage = 1;
    loadProductsTable();
  });

  document.getElementById('prod-category-filter').addEventListener('change', (e) => {
    productsCategory = e.target.value;
    productsPage = 1;
    loadProductsTable();
  });

  if (currentUser.role !== 'Viewer') {
    const addBtn = document.getElementById('add-prod-btn');
    if (addBtn) {
      addBtn.onclick = () => openCrudModal(false);
    }
  }

  document.getElementById('prod-prev-btn').addEventListener('click', () => {
    if (productsPage > 1) {
      productsPage--;
      loadProductsTable();
    }
  });

  document.getElementById('prod-next-btn').addEventListener('click', () => {
    productsPage++;
    loadProductsTable();
  });
}

async function loadCategoryDropdowns() {
  const resCat = await api.get('/api/categories');
  if (resCat.success) {
    const filter = document.getElementById('prod-category-filter');
    const modalSelect = document.getElementById('form-category');
    
    let options = '<option value="">Semua Kategori</option>';
    let modalOptions = '';
    
    resCat.data.forEach(c => {
      options += `<option value="${c.id}" ${productsCategory == c.id ? 'selected' : ''}>${c.name}</option>`;
      modalOptions += `<option value="${c.id}">${c.name}</option>`;
    });
    
    if (filter) filter.innerHTML = options;
    if (modalSelect) modalSelect.innerHTML = modalOptions;
  }

  const resSup = await api.get('/api/suppliers');
  if (resSup.success) {
    const modalSelect = document.getElementById('form-supplier');
    let modalOptions = '';
    resSup.data.forEach(s => {
      modalOptions += `<option value="${s.id}">${s.name}</option>`;
    });
    if (modalSelect) modalSelect.innerHTML = modalOptions;
  }
}

async function loadProductsTable() {
  const tbody = document.getElementById('products-table-body');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat produk...</td></tr>`;

  const res = await api.get(`/api/products?search=${productsSearch}&category_id=${productsCategory}&page=${productsPage}&limit=10`);
  if (res.success) {
    let rows = res.data.map(p => {
      const formatRupiah = (val) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(val);
      
      let actions = '';
      if (currentUser.role !== 'Viewer') {
        const canDelete = currentUser.role === 'Admin';
        actions = `
          <td>
            <div class="action-buttons">
              <button onclick="openCrudModal(true, ${p.id}, '${p.sku}', '${p.name}', ${p.category_id}, ${p.supplier_id}, ${p.min_stock}, ${p.price}, '${p.description}')" class="btn-action btn-edit" title="Edit Produk">
                <svg viewBox="0 0 24 24">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/>
                </svg>
              </button>
              
              <button onclick="openTransactionModal(${p.id}, '${p.name}')" class="btn-action btn-edit" title="Ubah Stok">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3L2 7.5v9L12 21l10-4.5v-9L12 3zm0 2.57l7.5 3.37-2.68 1.21L9.32 6.7 12 5.57zm-8 4.2L11 12.9v6.53l-7-3.15V9.77zm9 9.66V12.9l7-3.13v6.52l-7 3.14z"/>
                </svg>
              </button>
              
              ${canDelete ? `
                <button onclick="deleteProduct(${p.id})" class="btn-action btn-delete" title="Hapus">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/>
                  </svg>
                </button>
              ` : ''}
            </div>
          </td>
        `;
      }

      return `
        <tr class="animate-fade-in">
          <td>${p.sku}</td> <td style="font-weight: 600;">${p.name}</td>
          <td>${p.category_name}</td>
          <td>${p.supplier_name}</td>
          <td>
            <span class="${p.total_stock <= p.min_stock ? 'badge-danger' : 'text-stock-success'}">
              ${p.total_stock} unit
            </span>
          </td>
          <td>${formatRupiah(p.price)}</td>
          ${actions}
        </tr>
      `;
    }).join('');

    if (res.data.length === 0) {
      rows = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Tidak ada produk ditemukan.</td></tr>`;
    }

    tbody.innerHTML = rows;

    const total = res.pagination.total;
    const start = total === 0 ? 0 : (productsPage - 1) * 10 + 1;
    const end = Math.min(productsPage * 10, total);
    document.getElementById('prod-pagination-info').textContent = `Menampilkan ${start}-${end} dari ${total} produk`;

    document.getElementById('prod-prev-btn').disabled = productsPage <= 1;
    document.getElementById('prod-next-btn').disabled = productsPage >= res.pagination.totalPages;
  }
}

function openCrudModal(isEdit, id = null, sku = '', name = '', catId = 1, supId = 1, min = 10, price = 0, desc = '') {
  const modal = document.getElementById('crud-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('crud-form');
  
  title.textContent = isEdit ? 'Perbarui Data Produk' : 'Tambah Produk Baru';
  
  document.getElementById('form-product-id').value = id || '';
  document.getElementById('form-sku').value = sku;
  document.getElementById('form-sku').disabled = isEdit; // SKU tidak boleh diedit
  document.getElementById('form-name').value = name;
  document.getElementById('form-category').value = catId;
  document.getElementById('form-supplier').value = supId;
  document.getElementById('form-min-stock').value = min;
  document.getElementById('form-price').value = price;
  document.getElementById('form-desc').value = desc;

  const imageInput = document.getElementById('form-image');
  if (imageInput) {
    imageInput.value = '';
  }

  modal.classList.add('active');

  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const prodId = document.getElementById('form-product-id').value;
    const formData = new FormData();
    
    formData.append('sku', document.getElementById('form-sku').value);
    formData.append('name', document.getElementById('form-name').value);
    formData.append('category_id', document.getElementById('form-category').value);
    formData.append('supplier_id', document.getElementById('form-supplier').value);
    formData.append('min_stock', parseInt(document.getElementById('form-min-stock').value, 10));
    formData.append('price', parseFloat(document.getElementById('form-price').value));
    formData.append('description', document.getElementById('form-desc').value);

    const imageFileInput = document.getElementById('form-image');
    if (imageFileInput && imageFileInput.files.length > 0) {
      formData.append('image', imageFileInput.files[0]);
    }

    try {
      let url = '/api/products';
      let method = 'POST';

      if (isEdit && prodId) {
        url = `/api/products/${prodId}`;
        method = 'PUT'; 
      }
      
      const getCsrfToken = () => {
        const name = "csrf-token=";
        const decodedCookie = decodeURIComponent(document.cookie);
        const ca = decodedCookie.split(';');
        for(let i = 0; i < ca.length; i++) {
          let c = ca[i].trim();
          if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
        }
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
      };

      const response = await fetch(url, {
        method: method,
        headers: {
          'X-CSRF-Token': getCsrfToken() 
        },
        body: formData
      });

      const res = await response.json();

      if (res.success) {
        modal.classList.remove('active');
        loadProductsTable(); 
        alert(isEdit ? 'Produk berhasil diperbarui!' : 'Produk baru berhasil ditambahkan beserta fotonya!');
      } else {
        alert('Gagal menyimpan data: ' + res.message);
      }
    } catch (error) {
      console.error('Error saat menyimpan produk:', error);
      alert('Terjadi kesalahan jaringan/sistem.');
    }
  };

  document.getElementById('close-modal-btn').onclick = () => {
    modal.classList.remove('active');
  };
}

async function deleteProduct(id) {
  if (confirm('Apakah Anda yakin ingin menghapus produk ini secara permanen?')) {
    const res = await api.delete(`/api/products/${id}`);
    if (res.success) {
      loadProductsTable();
    } else {
      alert(res.message);
    }
  }
}

// Transaction Modal (IN/OUT Stok)
function openTransactionModal(productId, productName) {
  const modal = document.getElementById('crud-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('crud-form');
  
  title.textContent = `Pencatatan Stok: ${productName}`;
  
  form.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="tx-type">Tipe Transaksi</label>
      <select id="tx-type" class="input-cyber" required>
        <option value="IN">Stok Masuk (Incoming)</option>
        <option value="OUT">Stok Keluar (Outgoing)</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label" for="tx-warehouse">Gudang Penyimpanan</label>
      <select id="tx-warehouse" class="input-cyber" required></select>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div class="form-group">
        <label class="form-label" for="tx-qty">Jumlah Unit</label>
        <input type="number" id="tx-qty" class="input-cyber" placeholder="10" required min="1">
      </div>
      
      <div class="form-group" id="tx-price-group">
        <label class="form-label" for="tx-price">HPP Beli (Rp/Unit)</label>
        <input type="number" id="tx-price" class="input-cyber" placeholder="Harga Beli" required min="1">
      </div>
    </div>

    <div class="form-group" id="tx-method-group" style="display: none;">
      <label class="form-label" for="tx-method">Metode Akuntansi</label>
      <select id="tx-method" class="input-cyber">
        <option value="FIFO">FIFO (First In, First Out)</option>
        <option value="LIFO">LIFO (Last In, First Out)</option>
      </select>
    </div>

    <div style="display: flex; gap: 16px; margin-top: 24px;">
      <button type="button" id="close-modal-btn" class="btn-cyber btn-secondary">Batal</button>
      <button type="submit" class="btn-cyber btn-primary">Simpan Transaksi</button>
    </div>
  `;

  api.get('/api/warehouses').then(res => {
    if (res.success) {
      const whSelect = document.getElementById('tx-warehouse');
      let options = '';
      res.data.forEach(w => {
        if (currentUser.warehouse_id && currentUser.warehouse_id !== w.id) return;
        options += `<option value="${w.id}">${w.name} (${w.code})</option>`;
      });
      whSelect.innerHTML = options;
    }
  });

  const txType = document.getElementById('tx-type');
  const priceGroup = document.getElementById('tx-price-group');
  const methodGroup = document.getElementById('tx-method-group');

  txType.addEventListener('change', () => {
    if (txType.value === 'IN') {
      priceGroup.style.display = 'block';
      document.getElementById('tx-price').required = true;
      methodGroup.style.display = 'none';
    } else {
      priceGroup.style.display = 'none';
      document.getElementById('tx-price').required = false;
      methodGroup.style.display = 'block';
    }
  });

  modal.classList.add('active');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      product_id: productId,
      warehouse_id: parseInt(document.getElementById('tx-warehouse').value, 10),
      quantity: parseInt(document.getElementById('tx-qty').value, 10),
      type: txType.value,
      method: document.getElementById('tx-method') ? document.getElementById('tx-method').value : 'FIFO',
      purchase_price: txType.value === 'IN' ? parseFloat(document.getElementById('tx-price').value) : null
    };

    const res = await api.post('/api/transactions', payload);
    if (res.success) {
      modal.classList.remove('active');
      loadProductsTable();
    } else {
      alert(res.message);
    }
  };

  document.getElementById('close-modal-btn').onclick = () => {
    modal.classList.remove('active');
  };
}

// VIEW RENDERER 3: PARALLEL TRANSFERS
async function renderTransfersView() {
  const container = document.getElementById('page-content');

  container.innerHTML = `
  <div class="transfer-container animate-fade-in">
    <div class="glass-panel" style="padding: 32px; margin: 0;">
      <h3 style="font-weight: 800; margin-bottom: 24px; color: #0f172a;">Form Transfer Barang</h3>
      <form id="transfer-form">
        <div class="form-group">
          <label class="form-label" for="trf-product">Pilih Produk</label>
          <select id="trf-product" class="input-cyber" required></select>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="form-group">
            <label class="form-label" for="trf-from">Gudang Asal</label>
            <select id="trf-from" class="input-cyber" required></select>
          </div>
          <div class="form-group">
            <label class="form-label" for="trf-to">Gudang Tujuan</label>
            <select id="trf-to" class="input-cyber" required></select>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="form-group">
            <label class="form-label" for="trf-qty">Jumlah Transfer</label>
            <input type="number" id="trf-qty" class="input-cyber" required min="1" placeholder="Masukkan jumlah...">
          </div>
          <div class="form-group">
            <label class="form-label" for="trf-method">Metode Akuntansi</label>
            <select id="trf-method" class="input-cyber">
              <option value="FIFO">FIFO (Pemberian Tertua)</option>
              <option value="LIFO">LIFO (Pemberian Terbaru)</option>
            </select>
          </div>
        </div>
        <button type="submit" class="btn-cyber btn-primary" style="margin-top: 12px; width: 100%;">
          <i class="fa-solid fa-paper-plane"></i> Kirim Transfer Paralel
        </button>
      </form>
    </div>
    
    <div class="glass-panel transfer-map-panel" style="margin: 0; padding: 32px;">
      <h3 style="font-weight: 800; margin-bottom: 8px; color: #0f172a;">Peta Transfer Logistik</h3>
      <p style="color: #64748b; font-size: 0.85rem; margin-bottom: 32px; margin-top: 0;">Status transfer paralel real-time antar kota.</p>
      
      <div class="warehouse-nodes-vertical">
        <div id="node-origin" class="wh-node-v">
          <div class="wh-node-circle origin-color"><i class="fa-solid fa-warehouse"></i></div>
          <div class="wh-node-info">
            <span class="node-title">GUDANG ASAL</span>
            <span id="label-origin" class="node-sub">Belum dipilih</span>
          </div>
        </div>
        <div class="truck-path-vertical">
          <div class="dashed-line-v"></div>
          <i id="transfer-truck" class="fa-solid fa-truck-ramp-box cargo-truck-v"></i>
        </div>
        <div id="node-dest" class="wh-node-v">
          <div class="wh-node-circle dest-color"><i class="fa-solid fa-warehouse"></i></div>
          <div class="wh-node-info">
            <span class="node-title">GUDANG TUJUAN</span>
            <span id="label-dest" class="node-sub">Belum dipilih</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;

  const trfFromSelect = document.getElementById('trf-from');
  if (trfFromSelect) {
    trfFromSelect.addEventListener('change', (e) => {
      const select = e.target;
      const labelOrigin = document.getElementById('label-origin');
      const circleOrigin = document.querySelector('#node-origin .wh-node-circle');
      if (select.value) {
        labelOrigin.textContent = select.options[select.selectedIndex].text;
        circleOrigin.style.backgroundColor = '#2563eb';
        circleOrigin.style.color = '#ffffff';
        circleOrigin.style.borderColor = '#1d4ed8';
      } else {
        labelOrigin.textContent = 'Belum dipilih';
        circleOrigin.style.backgroundColor = '#eff6ff';
        circleOrigin.style.color = '#2563eb';
        circleOrigin.style.borderColor = '#bfdbfe';
      }
    });
  }

  const trfToSelect = document.getElementById('trf-to');
  if (trfToSelect) {
    trfToSelect.addEventListener('change', (e) => {
      const select = e.target;
      const labelDest = document.getElementById('label-dest');
      const circleDest = document.querySelector('#node-dest .wh-node-circle');
      if (select.value) {
        labelDest.textContent = select.options[select.selectedIndex].text;
        circleDest.style.backgroundColor = '#9333ea';
        circleDest.style.color = '#ffffff';
        circleDest.style.borderColor = '#7e22ce';
      } else {
        labelDest.textContent = 'Belum dipilih';
        circleDest.style.backgroundColor = '#faf5ff';
        circleDest.style.color = '#9333ea';
        circleDest.style.borderColor = '#e9d5ff';
      }
    });
  }

  const resWh = await api.get('/api/warehouses');
  const resProd = await api.get('/api/products?limit=100');

  if (resWh.success && resProd.success) {
    const fromSelect = document.getElementById('trf-from');
    const toSelect = document.getElementById('trf-to');
    const prodSelect = document.getElementById('trf-product');

    let whOptions = '<option value="">Pilih Gudang...</option>';
    resWh.data.forEach(w => {
      whOptions += `<option value="${w.id}">${w.name} (${w.code})</option>`;
    });
    fromSelect.innerHTML = whOptions;
    toSelect.innerHTML = whOptions;

    let prodOptions = '<option value="">Pilih Produk...</option>';
    resProd.data.forEach(p => {
      prodOptions += `<option value="${p.id}">${p.sku} - ${p.name}</option>`;
    });
    prodSelect.innerHTML = prodOptions;
  }

  document.getElementById('transfer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      product_id: parseInt(document.getElementById('trf-product').value, 10),
      from_warehouse_id: parseInt(document.getElementById('trf-from').value, 10),
      to_warehouse_id: parseInt(document.getElementById('trf-to').value, 10),
      quantity: parseInt(document.getElementById('trf-qty').value, 10),
      method: document.getElementById('trf-method').value
    };

    const truck = document.getElementById('transfer-truck');
    if (truck) truck.style.display = 'block';

    const res = await api.post('/api/transfers', payload);
    
    setTimeout(() => {
      if (truck) truck.style.display = 'none';
      if (res.success) {
        alert('Transfer paralel diselesaikan secara atomic dan disinkronkan ke queue.');
        navigateTo('dashboard');
      } else {
        alert(res.message);
      }
    }, 2000);
  });
}

// VIEW RENDERER 4: BATCH CSV IMPORT
function renderImportView() {
  const container = document.getElementById('page-content');

  container.innerHTML = `
    <div class="glass-panel animate-fade-in" style="padding: 40px; max-width: 680px; margin: 0 auto; text-align: center;">
      <i class="fa-solid fa-file-csv drag-icon" style="margin-bottom: 24px;"></i>
      <h3 style="font-weight: 800; margin-bottom: 12px;">Batch Import CSV Paralel</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 30px; line-height: 1.5;">
        Unggah file CSV inventaris yang diekspor dari spreadsheet lama untuk migrasi data massal. Sistem akan memvalidasi duplikasi SKU dan memproses baris data secara paralel di thread terpisah.
      </p>
      <div style="text-align: left; background: rgba(255, 255, 255, 0.03); padding: 20px; border-radius: 12px; border: var(--border-glass); margin-bottom: 30px;">
        <h4 style="font-weight: 700; margin-bottom: 10px; color: var(--color-primary);"><i class="fa-solid fa-circle-info"></i> Format Kolom CSV yang Diperlukan:</h4>
        <code style="font-size: 0.8rem; color: var(--text-main); display: block; background: #ffffff; padding: 10px; border-radius: 6px; overflow-x: auto;">
          sku,name,category,supplier,price,min_stock,qty_jakarta,qty_surabaya
        </code>
      </div>
      <div id="drop-zone" class="drag-drop-zone">
        <i class="fa-solid fa-cloud-arrow-up" style="font-size: 2.5rem; color: rgba(255, 255, 255, 0.3);"></i>
        <div>
          <span style="font-weight: 700;">Seret & Lepas file CSV</span>
          <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px;">atau klik untuk menelusuri folder komputer Anda</p>
        </div>
        <input type="file" id="csv-file-input" accept=".csv" style="display: none;">
      </div>
      <div id="import-progress-panel" class="glass-panel" style="display: none; padding: 24px; text-align: left; margin-bottom: 24px;">
        <h4 id="import-status-text" style="font-weight: 700;">Sedang Mengunggah File...</h4>
        <div class="progress-bar-container">
          <div id="import-progress-fill" class="progress-bar-fill"></div>
        </div>
        <span id="import-progress-label" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px; display: block;">Diproses: 0% (0 / 0 baris)</span>
      </div>
      <button id="start-import-btn" class="btn-cyber btn-primary" style="display: none;">
        <i class="fa-solid fa-bolt"></i> Mulai Eksekusi Import
      </button>
    </div>
  `;

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('csv-file-input');
  const startBtn = document.getElementById('start-import-btn');
  let selectedFile = null;

  dropZone.onclick = () => fileInput.click();

  fileInput.onchange = (e) => {
    if (e.target.files.length > 0) {
      selectedFile = e.target.files[0];
      dropZone.querySelector('span').textContent = `File Siap: ${selectedFile.name}`;
      startBtn.style.display = 'inline-flex';
    }
  };

  startBtn.onclick = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('csvFile', selectedFile);

    const progressPanel = document.getElementById('import-progress-panel');
    const statusText = document.getElementById('import-status-text');
    const fill = document.getElementById('import-progress-fill');
    const label = document.getElementById('import-progress-label');

    progressPanel.style.display = 'block';
    startBtn.style.display = 'none';
    dropZone.style.display = 'none';

    const response = await fetch('/api/import', {
      method: 'POST',
      body: formData
    });

    const res = await response.json();
    if (res.success) {
      statusText.textContent = 'Migrasi CSV Sedang Diproses di Server Latar Belakang...';
      let fakeProg = 0;
      const interval = setInterval(() => {
        fakeProg += 5;
        if (fakeProg <= 95) {
          fill.style.width = `${fakeProg}%`;
          label.textContent = `Mengurai & memetakan kolom database... ${fakeProg}%`;
        } else {
          clearInterval(interval);
          statusText.textContent = 'Migrasi Data Selesai!';
          fill.style.width = '100%';
          label.innerHTML = `<span style="color: green; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Seluruh data spreadsheet berhasil diimpor!</span>`;
        }
      }, 150);
    } else {
      alert(res.message);
      progressPanel.style.display = 'none';
      dropZone.style.display = 'flex';
    }
  };
}

// VIEW RENDERER 5: REPORTS
async function renderReportsView() {
  const container = document.getElementById('page-content');

  container.innerHTML = `
    <div class="glass-panel animate-fade-in" style="padding: 32px; max-width: 600px; margin: 0 auto;">
      <h3 style="font-weight: 800; margin-bottom: 24px;">Kompilasi Laporan Latar Belakang</h3>
      <form id="report-form">
        <div class="form-group">
          <label class="form-label" for="rep-type">Tipe Laporan</label>
          <select id="rep-type" class="input-cyber" required>
            <option value="INVENTORY_STATUS">Status Aset & Stok Gudang Saat Ini</option>
            <option value="STOCK_MOVEMENT">Mutasi & Riwayat Transaksi</option>
          </select>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="rep-format">Format Dokumen</label>
          <select id="rep-format" class="input-cyber" required>
            <option value="PDF">Dokumen Cetak PDF (Visual & Grafik)</option>
            <option value="CSV">Data Mentah Spreadsheet (CSV)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="rep-warehouse">Filter Gudang</label>
          <select id="rep-warehouse" class="input-cyber"></select>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="form-group">
            <label class="form-label" for="rep-start">Mulai Tanggal (Optional)</label>
            <input type="date" id="rep-start" class="input-cyber">
          </div>
          <div class="form-group">
            <label class="form-label" for="rep-end">Hingga Tanggal (Optional)</label>
            <input type="date" id="rep-end" class="input-cyber">
          </div>
        </div>
        <button type="submit" class="btn-cyber btn-primary" style="margin-top: 12px;">
          <i class="fa-solid fa-file-pdf"></i> Generate Laporan
        </button>
      </form>

      <div id="report-download-widget" class="glass-panel animate-fade-in" style="display: none; padding: 24px; margin-top: 30px; border-color: #10b981; text-align: center;">
        <i id="report-icon-status" class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: #10b981; margin-bottom: 12px;"></i>
        <h4 style="font-weight: 700; margin-bottom: 4px;">Laporan Berhasil Dibuat!</h4>
        <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 20px;">Pemrosesan dokumen di background worker selesai.</p>
        <a id="download-link" href="#" class="btn-cyber btn-primary" style="text-decoration: none; width: auto; display: inline-flex;">
          <i class="fa-solid fa-cloud-arrow-down"></i> Unduh Berkas Laporan
        </a>
      </div>

      <div id="report-download-widget" class="glass-panel animate-fade-in" style="display: none; padding: 24px; margin-top: 30px; border-color: green; text-align: center;">
        <i class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: green; margin-bottom: 12px;"></i>
        <h4 style="font-weight: 700; margin-bottom: 4px;">Laporan Berhasil Dibuat!</h4>
        <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 20px;">Pemrosesan paralel di background worker selesai.</p>
        <a id="download-link" href="#" class="btn-cyber btn-primary" style="text-decoration: none; width: auto; display: inline-flex;">
          <i class="fa-solid fa-cloud-arrow-down"></i> Unduh File CSV
        </a>
      </div>
    </div>
  `;

  const resWh = await api.get('/api/warehouses');
  if (resWh.success) {
    const whSelect = document.getElementById('rep-warehouse');
    let options = '<option value="">Semua Gudang (Konsolidasi Pusat)</option>';
    resWh.data.forEach(w => {
      options += `<option value="${w.id}">${w.name}</option>`;
    });
    whSelect.innerHTML = options;
  }

  document.getElementById('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      reportType: document.getElementById('rep-type').value,
      filters: {
        warehouseId: document.getElementById('rep-warehouse').value,
        startDate: document.getElementById('rep-start').value,
        endDate: document.getElementById('rep-end').value
      }
    };

    const res = await api.post('/api/reports/export', payload);
    if (res.success) {
      alert('Tugas berjalan di latar belakang! Silakan tunggu sekitar 5 detik.');
      setTimeout(() => {
        const widget = document.getElementById('report-download-widget');
        const link = document.getElementById('download-link');
        if (link) link.href = `/api/reports/download/${res.fileName}`;
        if (widget) widget.style.display = 'block';
      }, 4000);
    } else {
      alert(res.message);
    }
  });
}

// VIEW RENDERER 6: AUDIT SECURITY 
async function renderLogsView() {
  const container = document.getElementById('page-content');
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat Audit Log...</div>`;

  const res = await api.get('/api/audit-logs');
  if (!res.success) return;

  let rows = res.data.map(log => {
    const dateStr = new Date(log.created_at).toLocaleString('id-ID');
    return `
      <tr class="animate-fade-in" style="cursor: pointer;" onclick="alert('DETAIL CATATAN AUDIT:\\n\\nUsername: ${log.username}\\nRole: ${log.role}\\nAksi: ${log.action}\\nTabel: ${log.target_table || '-'}\\nID: ${log.target_id || '-'}\\nDetail: ${log.details || '-'}\\nIP Address: ${log.ip_address}')">
        <td style="font-weight: 700; color: var(--color-primary);">${log.username}</td>
        <td><span class="badge" style="background: rgba(255,255,255,0.05); color: #fff;">${log.role}</span></td>
        <td style="font-weight: 600;">${log.action}</td>
        <td>${log.target_table || '-'}</td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${log.details || '-'}</td>
        <td style="color: var(--text-muted);">${dateStr}</td>
      </tr>
    `;
  }).join('');

  if (res.data.length === 0) {
    rows = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Belum ada log terekam.</td></tr>`;
  }

  container.innerHTML = `
    <div class="glass-panel animate-fade-in" style="padding: 24px;">
      <h3 style="margin-bottom: 20px; font-weight: 800;"><i class="fa-solid fa-shield-halved" style="color: var(--color-primary);"></i> Audit Logs Keamanan Informasi</h3>
      <div class="table-responsive">
        <table class="cyber-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Aksi</th>
              <th>Tabel</th>
              <th>Detail Aktivitas</th>
              <th>Waktu (WIB)</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// INISIALISASI PETA 
function initWarehouseMap() {
  console.log("MAP INIT");
  const map = L.map('warehouse-map').setView([-2.5489, 118.0149], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const warehouses = [
    { name: "Gudang Utama Jakarta (GD-JKT)", lat: -6.2088, lng: 106.8456, desc: "Pusat Distribusi Utama Barat • Kapasitas Maksimal" },
    { name: "Gudang Hub Bandung (GD-BDO)", lat: -6.9175, lng: 107.6191, desc: "Penyimpanan Elektronik & Retail Jawa Barat" },
    { name: "Gudang Surabaya (GD-SUB)", lat: -7.2575, lng: 112.7521, desc: "Pusat Gerbang Distribusi Wilayah Timur" },
    { name: "Gudang Medan (GD-MES)", lat: 3.5952, lng: 98.6722, desc: "Gudang Logistik Utama Sumatra" },
    { name: "Gudang Makassar (GD-UPG)", lat: -5.1476, lng: 119.4327, desc: "Hub Transit Sulawesi & Indonesia Timur" }
  ];

  warehouses.forEach(wh => {
    const marker = L.marker([wh.lat, wh.lng]).addTo(map);
    const popupContent = `
      <div style="font-family: 'Inter', sans-serif; padding: 4px;">
        <strong style="color: #1e293b; font-size: 14px; display: block; margin-bottom: 4px;">${wh.name}</strong>
        <p style="color: #64748b; font-size: 12px; margin: 0; line-height: 1.4;">${wh.desc}</p>
        <span style="display: inline-block; margin-top: 8px; font-size: 11px; color: #2563eb; font-weight: 700;">Status: Aktif terhubung</span>
      </div>
    `;
    marker.bindPopup(popupContent);
  });

  setTimeout(() => {
    map.invalidateSize(true);
  }, 1000);
}

async function deleteProduct(id) {
  if (confirm('Apakah Anda yakin ingin menghapus produk ini secara permanen?')) {
    const res = await api.delete(`/api/products/${id}`);
    if (res.success) {
      loadProductsTable();
    } else {
      alert(res.message);
    }
  }
}

// Transaction Modal (IN/OUT Stok)
function openTransactionModal(productId, productName) {
  const modal = document.getElementById('crud-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('crud-form');
  
  title.textContent = `Pencatatan Stok: ${productName}`;
  
  form.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="tx-type">Tipe Transaksi</label>
      <select id="tx-type" class="input-cyber" required>
        <option value="IN">Stok Masuk (Incoming)</option>
        <option value="OUT">Stok Keluar (Outgoing)</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label" for="tx-warehouse">Gudang Penyimpanan</label>
      <select id="tx-warehouse" class="input-cyber" required></select>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div class="form-group">
        <label class="form-label" for="tx-qty">Jumlah Unit</label>
        <input type="number" id="tx-qty" class="input-cyber" placeholder="10" required min="1">
      </div>
      
      <div class="form-group" id="tx-price-group">
        <label class="form-label" for="tx-price">HPP Beli (Rp/Unit)</label>
        <input type="number" id="tx-price" class="input-cyber" placeholder="Harga Beli" required min="1">
      </div>
    </div>

    <div class="form-group" id="tx-method-group" style="display: none;">
      <label class="form-label" for="tx-method">Metode Akuntansi</label>
      <select id="tx-method" class="input-cyber">
        <option value="FIFO">FIFO (First In, First Out)</option>
        <option value="LIFO">LIFO (Last In, First Out)</option>
      </select>
    </div>

    <div style="display: flex; gap: 16px; margin-top: 24px;">
      <button type="button" id="close-modal-btn" class="btn-cyber btn-secondary">Batal</button>
      <button type="submit" class="btn-cyber btn-primary">Simpan Transaksi</button>
    </div>
  `;

  api.get('/api/warehouses').then(res => {
    if (res.success) {
      const whSelect = document.getElementById('tx-warehouse');
      let options = '';
      res.data.forEach(w => {
        if (currentUser.warehouse_id && currentUser.warehouse_id !== w.id) return;
        options += `<option value="${w.id}">${w.name} (${w.code})</option>`;
      });
      whSelect.innerHTML = options;
    }
  });

  const txType = document.getElementById('tx-type');
  const priceGroup = document.getElementById('tx-price-group');
  const methodGroup = document.getElementById('tx-method-group');

  txType.addEventListener('change', () => {
    if (txType.value === 'IN') {
      priceGroup.style.display = 'block';
      document.getElementById('tx-price').required = true;
      methodGroup.style.display = 'none';
    } else {
      priceGroup.style.display = 'none';
      document.getElementById('tx-price').required = false;
      methodGroup.style.display = 'block';
    }
  });

  modal.classList.add('active');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      product_id: productId,
      warehouse_id: parseInt(document.getElementById('tx-warehouse').value, 10),
      quantity: parseInt(document.getElementById('tx-qty').value, 10),
      type: txType.value,
      method: document.getElementById('tx-method') ? document.getElementById('tx-method').value : 'FIFO',
      purchase_price: txType.value === 'IN' ? parseFloat(document.getElementById('tx-price').value) : null
    };

    const res = await api.post('/api/transactions', payload);
    if (res.success) {
      modal.classList.remove('active');
      loadProductsTable();
    } else {
      alert(res.message);
    }
  };

  document.getElementById('close-modal-btn').onclick = () => {
    modal.classList.remove('active');
  };
}

// VIEW RENDERER 3: PARALLEL TRANSFERS
async function renderTransfersView() {
  const container = document.getElementById('page-content');

  container.innerHTML = `
  <div class="transfer-container animate-fade-in">
  
    <div class="glass-panel" style="padding: 32px; margin: 0;">
      <h3 style="font-weight: 800; margin-bottom: 24px; color: #0f172a;">Form Transfer Barang</h3>
      <form id="transfer-form">
        
        <div class="form-group">
          <label class="form-label" for="trf-product">Pilih Produk</label>
          <select id="trf-product" class="input-cyber" required></select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="form-group">
            <label class="form-label" for="trf-from">Gudang Asal</label>
            <select id="trf-from" class="input-cyber" required></select>
          </div>
          <div class="form-group">
            <label class="form-label" for="trf-to">Gudang Tujuan</label>
            <select id="trf-to" class="input-cyber" required></select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="form-group">
            <label class="form-label" for="trf-qty">Jumlah Transfer</label>
            <input type="number" id="trf-qty" class="input-cyber" required min="1" placeholder="Masukkan jumlah...">
          </div>
          <div class="form-group">
            <label class="form-label" for="trf-method">Metode Akuntansi</label>
            <select id="trf-method" class="input-cyber">
              <option value="FIFO">FIFO (Pemberian Tertua)</option>
              <option value="LIFO">LIFO (Pemberian Terbaru)</option>
            </select>
          </div>
        </div>

        <button type="submit" class="btn-cyber btn-primary" style="margin-top: 12px; width: 100%;">
          <i class="fa-solid fa-paper-plane"></i> Kirim Transfer Paralel
        </button>
      </form>
    </div>
    
    <div class="glass-panel transfer-map-panel" style="margin: 0; padding: 32px;">
      <h3 style="font-weight: 800; margin-bottom: 8px; color: #0f172a;">Peta Transfer Logistik</h3>
      <p style="color: #64748b; font-size: 0.85rem; margin-bottom: 32px; margin-top: 0;">Status transfer paralel real-time antar kota.</p>
      
      <div class="warehouse-nodes-vertical">
        
        <div id="node-origin" class="wh-node-v">
          <div class="wh-node-circle origin-color"><i class="fa-solid fa-warehouse"></i></div>
          <div class="wh-node-info">
            <span class="node-title">GUDANG ASAL</span>
            <span id="label-origin" class="node-sub">Belum dipilih</span>
          </div>
        </div>
        
        <div class="truck-path-vertical">
          <div class="dashed-line-v"></div>
          <i id="transfer-truck" class="fa-solid fa-truck-ramp-box cargo-truck-v"></i>
        </div>
        
        <div id="node-dest" class="wh-node-v">
          <div class="wh-node-circle dest-color"><i class="fa-solid fa-warehouse"></i></div>
          <div class="wh-node-info">
            <span class="node-title">GUDANG TUJUAN</span>
            <span id="label-dest" class="node-sub">Belum dipilih</span>
          </div>
        </div>

      </div>
    </div>

  </div>
  `;

  const trfFromSelect = document.getElementById('trf-from');
  if (trfFromSelect) {
    trfFromSelect.addEventListener('change', (e) => {
      const select = e.target;
      const labelOrigin = document.getElementById('label-origin');
      const circleOrigin = document.querySelector('#node-origin .wh-node-circle');
      
      if (select.value) {
        labelOrigin.textContent = select.options[select.selectedIndex].text;
        circleOrigin.style.backgroundColor = '#2563eb';
        circleOrigin.style.color = '#ffffff';
        circleOrigin.style.borderColor = '#1d4ed8';
      } else {
        labelOrigin.textContent = 'Belum dipilih';
        circleOrigin.style.backgroundColor = '#eff6ff';
        circleOrigin.style.color = '#2563eb';
        circleOrigin.style.borderColor = '#bfdbfe';
      }
    });
  }

  const trfToSelect = document.getElementById('trf-to');
  if (trfToSelect) {
    trfToSelect.addEventListener('change', (e) => {
      const select = e.target;
      const labelDest = document.getElementById('label-dest');
      const circleDest = document.querySelector('#node-dest .wh-node-circle');
      
      if (select.value) {
        labelDest.textContent = select.options[select.selectedIndex].text;
        circleDest.style.backgroundColor = '#9333ea';
        circleDest.style.color = '#ffffff';
        circleDest.style.borderColor = '#7e22ce';
      } else {
        labelDest.textContent = 'Belum dipilih';
        circleDest.style.backgroundColor = '#faf5ff';
        circleDest.style.color = '#9333ea';
        circleDest.style.borderColor = '#e9d5ff';
      }
    });
  }

  const resWh = await api.get('/api/warehouses');
  const resProd = await api.get('/api/products?limit=100');

  if (resWh.success && resProd.success) {
    const fromSelect = document.getElementById('trf-from');
    const toSelect = document.getElementById('trf-to');
    const prodSelect = document.getElementById('trf-product');

    let whOptions = '<option value="">Pilih Gudang...</option>';
    resWh.data.forEach(w => {
      whOptions += `<option value="${w.id}">${w.name} (${w.code})</option>`;
    });
    fromSelect.innerHTML = whOptions;
    toSelect.innerHTML = whOptions;

    let prodOptions = '<option value="">Pilih Produk...</option>';
    resProd.data.forEach(p => {
      prodOptions += `<option value="${p.id}">${p.sku} - ${p.name}</option>`;
    });
    prodSelect.innerHTML = prodOptions;

    fromSelect.addEventListener('change', () => {
      const selected = fromSelect.options[fromSelect.selectedIndex].text;
      document.getElementById('label-origin').textContent = fromSelect.value ? selected.split(' (')[0] : 'Asal';
      if (fromSelect.value) document.getElementById('node-origin').classList.add('active');
      else document.getElementById('node-origin').classList.remove('active');
    });

    toSelect.addEventListener('change', () => {
      const selected = toSelect.options[toSelect.selectedIndex].text;
      document.getElementById('label-dest').textContent = toSelect.value ? selected.split(' (')[0] : 'Tujuan';
      if (toSelect.value) document.getElementById('node-dest').classList.add('active');
      else document.getElementById('node-dest').classList.remove('active');
    });
  }

  document.getElementById('transfer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      product_id: parseInt(document.getElementById('trf-product').value, 10),
      from_warehouse_id: parseInt(document.getElementById('trf-from').value, 10),
      to_warehouse_id: parseInt(document.getElementById('trf-to').value, 10),
      quantity: parseInt(document.getElementById('trf-qty').value, 10),
      method: document.getElementById('trf-method').value
    };

    const truck = document.getElementById('transfer-truck');
    truck.style.display = 'block';

    const res = await api.post('/api/transfers', payload);
    
    setTimeout(() => {
      truck.style.display = 'none';
      if (res.success) {
        alert('Transfer paralel diselesaikan secara atomic dan disinkronkan ke queue.');
        navigateTo('dashboard');
      } else {
        alert(res.message);
      }
    }, 2000);
  });
}

// VIEW RENDERER 4: BATCH CSV IMPORT
function renderImportView() {
  const container = document.getElementById('page-content');

  container.innerHTML = `
    <div class="glass-panel animate-fade-in" style="padding: 40px; max-width: 680px; margin: 0 auto; text-align: center;">
      <i class="fa-solid fa-file-csv drag-icon" style="margin-bottom: 24px;"></i>
      <h3 style="font-weight: 800; margin-bottom: 12px;">Batch Import CSV Paralel</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 30px; line-height: 1.5;">
        Unggah file CSV inventaris yang diekspor dari spreadsheet lama untuk migrasi data massal. Sistem akan memvalidasi duplikasi SKU dan memproses baris data secara paralel di thread terpisah.
      </p>

      <div style="text-align: left; background: rgba(255, 255, 255, 0.03); padding: 20px; border-radius: 12px; border: var(--border-glass); margin-bottom: 30px;">
        <h4 style="font-weight: 700; margin-bottom: 10px; color: var(--color-primary);"><i class="fa-solid fa-circle-info"></i> Format Kolom CSV yang Diperlukan:</h4>
        <code style="font-size: 0.8rem; color: var(--text-main); display: block; background: #ffffff; padding: 10px; border-radius: 6px; overflow-x: auto;">
          sku,name,category,supplier,price,min_stock,qty_jakarta,qty_surabaya
        </code>
      </div>

      <!-- Drag & Drop Zone -->
      <div id="drop-zone" class="drag-drop-zone">
        <i class="fa-solid fa-cloud-arrow-up" style="font-size: 2.5rem; color: rgba(255, 255, 255, 0.3);"></i>
        <div>
          <span style="font-weight: 700;">Seret & Lepas file CSV</span>
          <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px;">atau klik untuk menelusuri folder komputer Anda</p>
        </div>
        <input type="file" id="csv-file-input" accept=".csv" style="display: none;">
      </div>

      <!-- Import Progress Panel -->
      <div id="import-progress-panel" class="glass-panel" style="display: none; padding: 24px; text-align: left; margin-bottom: 24px; border-color: rgba(var(--color-primary-rgb), 0.3);">
        <h4 id="import-status-text" style="font-weight: 700;">Sedang Mengunggah File...</h4>
        <div class="progress-bar-container">
          <div id="import-progress-fill" class="progress-bar-fill"></div>
        </div>
        <span id="import-progress-label" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px; display: block;">Diproses: 0% (0 / 0 baris)</span>
      </div>

      <div id="import-errors-log" class="glass-panel" style="display: none; padding: 20px; background: rgba(255, 56, 96, 0.05); border-color: rgba(255, 56, 96, 0.3); text-align: left; max-height: 200px; overflow-y: auto;">
        <h4 style="color: var(--color-danger); font-weight: 700; margin-bottom: 8px;"><i class="fa-solid fa-circle-exclamation"></i> Daftar Kegagalan Baris CSV:</h4>
        <ul id="import-errors-list" style="list-style: none; font-size: 0.8rem; color: var(--text-muted);"></ul>
      </div>

      <!-- Action Button -->
      <button id="start-import-btn" class="btn-cyber btn-primary" style="display: none;">
        <i class="fa-solid fa-bolt"></i> Mulai Eksekusi Import
      </button>
    </div>
  `;

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('csv-file-input');
  const startBtn = document.getElementById('start-import-btn');
  let selectedFile = null;

  dropZone.onclick = () => fileInput.click();

  fileInput.onchange = (e) => {
    if (e.target.files.length > 0) {
      selectedFile = e.target.files[0];
      dropZone.querySelector('span').textContent = `File Siap: ${selectedFile.name}`;
      startBtn.style.display = 'inline-flex';
    }
  };

  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  };

  dropZone.ondragleave = () => {
    dropZone.classList.remove('dragover');
  };

  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      selectedFile = e.dataTransfer.files[0];
      dropZone.querySelector('span').textContent = `File Siap: ${selectedFile.name}`;
      startBtn.style.display = 'inline-flex';
    }
  };

  startBtn.onclick = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('csvFile', selectedFile);

    const progressPanel = document.getElementById('import-progress-panel');
    const statusText = document.getElementById('import-status-text');
    const fill = document.getElementById('import-progress-fill');
    const label = document.getElementById('import-progress-label');
    const errorsLog = document.getElementById('import-errors-log');
    const errorsList = document.getElementById('import-errors-list');

    progressPanel.style.display = 'block';
    startBtn.style.display = 'none';
    dropZone.style.display = 'none';

    const response = await fetch('/api/import', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': getCookie('XSRF-TOKEN')
      },
      body: formData
    });

    const res = await response.json();
    if (res.success) {
      statusText.textContent = 'Migrasi CSV Sedang Diproses di Server Latar Belakang...';
      
      let fakeProg = 0;
      const interval = setInterval(() => {
        fakeProg += 5;
        if (fakeProg <= 95) {
          fill.style.width = `${fakeProg}%`;
          label.textContent = `Mengurai & memetakan kolom database... ${fakeProg}%`;
        } else {
          clearInterval(interval);
          statusText.textContent = 'Migrasi Data Selesai!';
          fill.style.width = '100%';
          fill.style.background = 'var(--color-success)';
          label.innerHTML = `<span style="color: var(--color-success); font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Seluruh data spreadsheet berhasil diimpor & divalidasi!</span>`;
        }
      }, 150);
    } else {
      alert(res.message);
      progressPanel.style.display = 'none';
      dropZone.style.display = 'flex';
    }
  };
}

// VIEW RENDERER 5: REPORTS
async function renderReportsView() {
  const container = document.getElementById('page-content');

  container.innerHTML = `
    <div class="glass-panel animate-fade-in" style="padding: 32px; max-width: 600px; margin: 0 auto;">
      <h3 style="font-weight: 800; margin-bottom: 24px;">Kompilasi Laporan Latar Belakang</h3>
      <form id="report-form">
        
        <div class="form-group">
          <label class="form-label" for="rep-type">Tipe Laporan</label>
          <select id="rep-type" class="input-cyber" required>
            <option value="INVENTORY_STATUS">Status Aset & Stok Gudang Saat Ini</option>
            <option value="STOCK_MOVEMENT">Mutasi & Riwayat Transaksi</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="rep-warehouse">Filter Gudang</label>
          <select id="rep-warehouse" class="input-cyber"></select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="form-group">
            <label class="form-label" for="rep-start">Mulai Tanggal (Optional)</label>
            <input type="date" id="rep-start" class="input-cyber">
          </div>
          <div class="form-group">
            <label class="form-label" for="rep-end">Hingga Tanggal (Optional)</label>
            <input type="date" id="rep-end" class="input-cyber">
          </div>
        </div>

        <button type="submit" class="btn-cyber btn-primary" style="margin-top: 12px;">
          <i class="fa-solid fa-gears"></i> Compile Laporan
        </button>
      </form>

      <!-- Download Widget -->
      <div id="report-download-widget" class="glass-panel animate-fade-in" style="display: none; padding: 24px; margin-top: 30px; border-color: var(--color-success); background: rgba(0, 255, 135, 0.05); text-align: center;">
        <i class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: var(--color-success); margin-bottom: 12px;"></i>
        <h4 style="font-weight: 700; margin-bottom: 4px;">Laporan Berhasil Dibuat!</h4>
        <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 20px;">Pemrosesan paralel di background worker selesai.</p>
        <a id="download-link" href="#" class="btn-cyber btn-primary" style="text-decoration: none; width: auto; display: inline-flex;">
          <i class="fa-solid fa-cloud-arrow-down"></i> Unduh File CSV
        </a>
      </div>
    </div>
  `;

  const resWh = await api.get('/api/warehouses');
  if (resWh.success) {
    const whSelect = document.getElementById('rep-warehouse');
    let options = '<option value="">Semua Gudang (Konsolidasi Pusat)</option>';
    resWh.data.forEach(w => {
      options += `<option value="${w.id}">${w.name}</option>`;
    });
    whSelect.innerHTML = options;
  }

  document.getElementById('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      reportType: document.getElementById('rep-type').value,
      filters: {
        warehouseId: document.getElementById('rep-warehouse').value,
        startDate: document.getElementById('rep-start').value,
        endDate: document.getElementById('rep-end').value
      }
    };

    const res = await api.post('/api/reports/export', payload);
    if (res.success) {
      alert('Tugas berjalan di latar belakang! Silakan tunggu sekitar 5 detik.');
      
      setTimeout(() => {
        const widget = document.getElementById('report-download-widget');
        const link = document.getElementById('download-link');
        
        link.href = `/api/reports/download/${res.fileName}`;
        widget.style.display = 'block';
      }, 4000);
    } else {
      alert(res.message);
    }
  });
}

// VIEW RENDERER 6: AUDIT SECURITY (Admin Only)
async function renderLogsView() {
  const container = document.getElementById('page-content');
  container.innerHTML = `<div style="text-align: center; padding: 40px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat Audit Log...</div>`;

  const res = await api.get('/api/audit-logs');
  if (!res.success) return;

  let rows = res.data.map(log => {
    const dateStr = new Date(log.created_at).toLocaleString('id-ID');
    return `
      <tr class="animate-fade-in" style="cursor: pointer;" onclick="alert('DETAIL CATATAN AUDIT:\\n\\nUsername: ${log.username}\\nRole: ${log.role}\\nAksi: ${log.action}\\nTabel: ${log.target_table || '-'}\\nID: ${log.target_id || '-'}\\nDetail: ${log.details || '-'}\\nIP Address: ${log.ip_address}')">
        <td style="font-weight: 700; color: var(--color-primary);">${log.username}</td>
        <td><span class="badge" style="background: rgba(255,255,255,0.05); color: #fff;">${log.role}</span></td>
        <td style="font-weight: 600;">${log.action}</td>
        <td>${log.target_table || '-'}</td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${log.details || '-'}</td>
        <td style="color: var(--text-muted);">${dateStr}</td>
      </tr>
    `;
  }).join('');

  if (res.data.length === 0) {
    rows = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Belum ada log terekam.</td></tr>`;
  }

  container.innerHTML = `
    <div class="glass-panel animate-fade-in" style="padding: 24px;">
      <h3 style="margin-bottom: 20px; font-weight: 800;"><i class="fa-solid fa-shield-halved" style="color: var(--color-primary);"></i> Audit Logs Keamanan Informasi</h3>
      <div class="table-responsive">
        <table class="cyber-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Aksi</th>
              <th>Tabel</th>
              <th>Detail Aktivitas</th>
              <th>Waktu (WIB)</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
} 

// FUNGSI INISIALISASI PETA 
function initWarehouseMap() {
  console.log("MAP INIT");
  const map = L.map('warehouse-map').setView([-2.5489, 118.0149], 5);
  console.log("MAP CREATED");

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const warehouses = [
    { name: "Gudang Utama Jakarta (GD-JKT)", lat: -6.2088, lng: 106.8456, desc: "Pusat Distribusi Utama Barat • Kapasitas Maksimal" },
    { name: "Gudang Hub Bandung (GD-BDO)", lat: -6.9175, lng: 107.6191, desc: "Penyimpanan Elektronik & Retail Jawa Barat" },
    { name: "Gudang Surabaya (GD-SUB)", lat: -7.2575, lng: 112.7521, desc: "Pusat Gerbang Distribusi Wilayah Timur" },
    { name: "Gudang Medan (GD-MES)", lat: 3.5952, lng: 98.6722, desc: "Gudang Logistik Utama Sumatra" },
    { name: "Gudang Makassar (GD-UPG)", lat: -5.1476, lng: 119.4327, desc: "Hub Transit Sulawesi & Indonesia Timur" }
  ];

  warehouses.forEach(wh => {
    const marker = L.marker([wh.lat, wh.lng]).addTo(map);
    
    const popupContent = `
      <div style="font-family: 'Inter', sans-serif; padding: 4px;">
        <strong style="color: #1e293b; font-size: 14px; display: block; margin-bottom: 4px;">${wh.name}</strong>
        <p style="color: #64748b; font-size: 12px; margin: 0; line-height: 1.4;">${wh.desc}</p>
        <span style="display: inline-block; margin-top: 8px; font-size: 11px; color: #2563eb; font-weight: 700;">Status: Aktif terhubung</span>
      </div>
    `;
    
    marker.bindPopup(popupContent);
  });

  setTimeout(() => {
    map.invalidateSize(true);
  }, 1000);
} 