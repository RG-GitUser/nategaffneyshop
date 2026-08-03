const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/**
 * All admin calls go out with `credentials: 'include'` so the httpOnly
 * session cookie is sent. Nothing sensitive is stored in JavaScript —
 * the cookie can't be read by script, so an XSS bug can't steal the
 * session the way a token in localStorage could.
 */
async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {}
  if (body && !isForm) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return null

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // Non-JSON response — fall through to the status-based error below.
  }

  if (!res.ok) {
    const err = new Error(payload?.error || `Request failed (${res.status})`)
    err.status = res.status
    err.details = payload?.details
    throw err
  }
  return payload
}

export const api = {
  // auth
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  // content
  getContent: () => request('/content'),
  saveContent: (data) => request('/content', { method: 'PUT', body: data }),

  // shop
  listShop: () => request('/shop/all'),
  createShopItem: (item) => request('/shop', { method: 'POST', body: item }),
  updateShopItem: (id, item) => request(`/shop/${id}`, { method: 'PUT', body: item }),
  deleteShopItem: (id) => request(`/shop/${id}`, { method: 'DELETE' }),

  // bookings
  listBookings: (status) =>
    request(`/bookings${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  updateBooking: (id, patch) =>
    request(`/bookings/${id}`, { method: 'PATCH', body: patch }),
  deleteBooking: (id) => request(`/bookings/${id}`, { method: 'DELETE' }),

  // payments
  listPayments: (limit = 25) => request(`/payments?limit=${limit}`),
  getPayment: (id) => request(`/payments/${id}`),
  refund: (id, body) => request(`/payments/${id}/refund`, { method: 'POST', body }),
  paymentSummary: () => request('/payments/stats/summary'),

  // media
  uploadImage: (file, slot) => {
    const form = new FormData()
    form.append('file', file)
    form.append('slot', slot)
    return request('/media', { method: 'POST', body: form, isForm: true })
  },
}
