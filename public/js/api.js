function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

const api = {
  async request(url, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json'
    };

    if (options.method && options.method !== 'GET') {
      const csrfToken = getCookie('XSRF-TOKEN');
      if (csrfToken) {
        defaultHeaders['X-CSRF-Token'] = csrfToken;
      }
    }

    options.headers = {
      ...defaultHeaders,
      ...options.headers
    };

    try {
      const response = await fetch(url, options);
      
      // Deteksi Sesi Kedaluwarsa (401 Unauthorized)
      if (response.status === 401) {
        if (document.getElementById('app-view').style.display !== 'none') {
          alert('Sesi Anda telah kedaluwarsa. Silakan login kembali.');
          window.location.reload();
        }
        return { success: false, status: 401, message: 'Unauthorized' };
      }

      // Deteksi error otorisasi peran (403 Forbidden)
      if (response.status === 403) {
        const data = await response.json();
        alert(data.message || 'Anda tidak memiliki hak akses untuk aksi ini.');
        return { success: false, status: 403, message: 'Forbidden' };
      }

      return await response.json();

    } catch (error) {
      console.error('API Request Error:', error);
      return { success: false, message: 'Gagal terhubung ke server. Silakan periksa jaringan Anda.' };
    }
  },

  get(url) {
    return this.request(url, { method: 'GET' });
  },

  post(url, data) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  put(url, data) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  delete(url) {
    return this.request(url, { method: 'DELETE' });
  }
};
