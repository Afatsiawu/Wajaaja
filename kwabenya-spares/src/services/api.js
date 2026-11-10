/**
 * API service layer for the Django backend in /backend.
 *
 * The app still ships with mock data so it can render instantly, but every
 * screen that needs persistence (catalogue, orders, reviews, notifications,
 * seller tools, admin stats) now talks to this module when the backend is
 * reachable. If the API is offline the app simply keeps using the local
 * mock data, so the demo never breaks.
 *
 * Local backend: http://127.0.0.1:8001/api
 * Override with VITE_API_URL in a .env file when deploying.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

const TOKEN_KEY = 'kwabenya_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// request: the one low-level function every call below goes through.
// Retries once on network errors or 5xx responses so a sleeping Render
// backend (cold start) doesn't surface as a hard failure on first load.
async function request(path, options = {}) {
  const doFetch = async () => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Token ${token}`;

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 && typeof window !== 'undefined' && typeof window.__logout === 'function') {
        window.__logout();
      }
      throw new Error(`API error ${res.status}: ${body}`);
    }
    return res.status === 204 ? null : res.json();
  };

  try {
    return await doFetch();
  } catch (e) {
    const msg = e?.message || '';
    if (/Failed to fetch|NetworkError|API error 5\d\d/.test(msg)) {
      await new Promise((r) => setTimeout(r, 2000));
      return await doFetch();
    }
    throw e;
  }
}

// unwrap: DRF paginates list endpoints, so most list calls return
// { count, next, previous, results }. This helper accepts either shape.
export function unwrap(data) {
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export const api = {
  // --- catalogue ---------------------------------------------------------
  getShops: (params = {}) => request(`/shops/?${new URLSearchParams(params)}`),
  getShop: (id) => request(`/shops/${id}/`),
  updateShop: (id, patch) => request(`/shops/${id}/`, { method: 'PATCH', body: JSON.stringify(patch) }),
  createShop: (data) => request('/shops/', { method: 'POST', body: JSON.stringify(data) }),

  getCategories: () => request('/categories/'),

  getProducts: (params = {}) => request(`/products/?${new URLSearchParams(params)}`),
  getProduct: (id) => request(`/products/${id}/`),
  createProduct: (data, imageFile) => {
    if (imageFile) {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') fd.append(k, v);
      });
      fd.append('image', imageFile);
      return request('/products/', { method: 'POST', body: fd });
    }
    return request('/products/', { method: 'POST', body: JSON.stringify(data) });
  },
  updateProduct: (id, patch, imageFile) => {
    if (imageFile) {
      const fd = new FormData();
      Object.entries(patch).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') fd.append(k, v);
      });
      fd.append('image', imageFile);
      return request(`/products/${id}/`, { method: 'PATCH', body: fd });
    }
    return request(`/products/${id}/`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteProduct: (id) => request(`/products/${id}/`, { method: 'DELETE' }),

  toggleMechanicDuty: (id) => request(`/mechanics/${id}/toggle_duty/`, { method: 'PATCH' }),

  // --- authentication ----------------------------------------------------
  login: (credentials) => request('/auth/login/', { method: 'POST', body: JSON.stringify(credentials) }),
  register: (data) => request('/auth/register/', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/auth/logout/', { method: 'POST' }),
  me: () => request('/auth/me/'),
  updateMe: (patch) => request('/auth/me/', { method: 'PATCH', body: JSON.stringify(patch) }),

  // --- orders ------------------------------------------------------------
  getOrders: (params = {}) => request(`/orders/?${new URLSearchParams(params)}`),
  getOrder: (id) => request(`/orders/${id}/`),
  createOrder: (data) => request('/orders/', { method: 'POST', body: JSON.stringify(data) }),
  updateOrderStatus: (id, status) => request(`/orders/${id}/update_status/`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // --- reviews -----------------------------------------------------------
  getReviews: (params = {}) => request(`/reviews/?${new URLSearchParams(params)}`),
  createReview: (data) => request('/reviews/', { method: 'POST', body: JSON.stringify(data) }),

  // --- notifications -----------------------------------------------------
  getNotifications: (params = {}) => request(`/notifications/?${new URLSearchParams(params)}`),
  markNotificationRead: (id) => request(`/notifications/${id}/mark_read/`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/notifications/mark_all_read/', { method: 'PATCH' }),

  // --- cart (optional server-side persistence) ---------------------------
  getCart: (params = {}) => request(`/cart/?${new URLSearchParams(params)}`),
  addCartItem: (data) => request('/cart/', { method: 'POST', body: JSON.stringify(data) }),
  updateCartItem: (id, patch) => request(`/cart/${id}/`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCartItem: (id) => request(`/cart/${id}/`, { method: 'DELETE' }),

  // --- admin dashboard ---------------------------------------------------
  getStats: () => request('/stats/'),
  // enquiries
  getEnquiries: () => request('/enquiries/'),
  createEnquiry: (data) => request('/enquiries/', { method: 'POST', body: JSON.stringify(data) }),
  getEnquiry: (id) => request(`/enquiries/${id}/`),
  replyEnquiry: (id, body) => request(`/enquiries/${id}/messages/`, { method: 'POST', body: JSON.stringify({ body }) }),
  markEnquiryRead: (id) => request(`/enquiries/${id}/read/`, { method: 'PATCH' }),
  closeEnquiry: (id) => request(`/enquiries/${id}/close/`, { method: 'PATCH' }),
  // admin users
  getAdminUsers: (params = {}) => request(`/admin/users/?${new URLSearchParams(params)}`),
  suspendUser: (id) => request(`/admin/users/${id}/suspend/`, { method: 'POST' }),
  activateUser: (id) => request(`/admin/users/${id}/activate/`, { method: 'POST' }),
  deleteUser: (id) => request(`/admin/users/${id}/`, { method: 'DELETE' }),
  // admin products
  getAdminProducts: (params = {}) => request(`/admin/products/?${new URLSearchParams(params)}`),
  hideProduct: (id, reason) => request(`/admin/products/${id}/hide/`, { method: 'POST', body: JSON.stringify({ reason }) }),
  unhideProduct: (id) => request(`/admin/products/${id}/unhide/`, { method: 'POST' }),
  removeProductAdmin: (id, reason) => request(`/admin/products/${id}/remove/`, { method: 'POST', body: JSON.stringify({ reason }) }),
  // admin categories
  createCategory: (name) => request('/admin/categories/', { method: 'POST', body: JSON.stringify({ category_name: name }) }),
  updateCategory: (id, name) => request(`/admin/categories/${id}/`, { method: 'PATCH', body: JSON.stringify({ category_name: name }) }),
  deleteCategory: (id) => request(`/admin/categories/${id}/delete/`, { method: 'DELETE' }),
  getAdminSellers: (status) => request(`/admin/sellers/${status ? '?status=' + encodeURIComponent(status) : ''}`),
  approveSeller: (id) => request(`/admin/sellers/${id}/approve/`, { method: 'POST' }),
  rejectSeller: (id, reason) => request(`/admin/sellers/${id}/reject/`, { method: 'POST', body: JSON.stringify({ reason }) }),
};
