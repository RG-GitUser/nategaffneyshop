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

  // orders
  /** Re-send a paid PDF's download email, optionally to a corrected address. */
  resendDownload: (sessionId, email) =>
    request(`/checkout/orders/${encodeURIComponent(sessionId)}/resend`, {
      method: 'POST',
      body: email ? { email } : {},
    }),

  // shop
  listShop: () => request('/shop/all'),
  createShopItem: (item) => request('/shop', { method: 'POST', body: item }),
  updateShopItem: (id, item) => request(`/shop/${id}`, { method: 'PUT', body: item }),
  deleteShopItem: (id) => request(`/shop/${id}`, { method: 'DELETE' }),

  // services
  listServices: () => request('/services/all'),
  createService: (item) => request('/services', { method: 'POST', body: item }),
  updateService: (id, item) => request(`/services/${id}`, { method: 'PUT', body: item }),
  deleteService: (id) => request(`/services/${id}`, { method: 'DELETE' }),

  // bookings
  listBookings: (status) =>
    request(`/bookings${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  updateBooking: (id, patch) =>
    request(`/bookings/${id}`, { method: 'PATCH', body: patch }),
  deleteBooking: (id) => request(`/bookings/${id}`, { method: 'DELETE' }),

  // payments
  listPayments: ({ limit = 25, page = 1, q = '', kind = '', item = '' } = {}) => {
    const params = new URLSearchParams({ limit, page })
    if (q) params.set('q', q)
    if (kind) params.set('kind', kind)
    if (item) params.set('item', item)
    return request(`/payments?${params}`)
  },
  paymentFilters: () => request('/payments/filters'),
  invoiceLink: (paymentIntents) =>
    request('/payments/invoice-link', { method: 'POST', body: { paymentIntents } }),
  getPayment: (id) => request(`/payments/${id}`),
  refund: (id, body) => request(`/payments/${id}/refund`, { method: 'POST', body }),
  paymentSummary: () => request('/payments/stats/summary'),

  // google calendar
  googleStatus: () => request('/google/status'),
  googleConnect: () => request('/google/connect'),
  googleDisconnect: () => request('/google/disconnect', { method: 'POST' }),
  googleSaveSettings: (settings) =>
    request('/google/settings', { method: 'PUT', body: settings }),
  createBooking: (booking) => request('/bookings/admin', { method: 'POST', body: booking }),
  // type: 'session' (default) or 'followup' — the short paid check-in.
  bookingPrice: (type) => request(`/bookings/price${type ? `?type=${type}` : ''}`),
  saveBookingPrice: (body) => request('/bookings/price', { method: 'PUT', body }),
  // a direct Stripe Payment Link for one product, safe to DM
  shopPayLink: (id) => request(`/shop/${id}/paylink`, { method: 'POST' }),
  // the admin's own copy of an uploaded PDF — opened as a top-level
  // navigation so the session cookie rides along
  shopPdfUrl: (id) => `${BASE}/api/shop/${id}/pdf`,
  // custom share links — each a bookable offer with its own price/length
  listBookingLinks: () => request('/bookings/links'),
  createBookingLink: (body) => request('/bookings/links', { method: 'POST', body }),
  updateBookingLink: (id, body) =>
    request(`/bookings/links/${id}`, { method: 'PATCH', body }),
  deleteBookingLink: (id) => request(`/bookings/links/${id}`, { method: 'DELETE' }),

  // analytics
  metricsSummary: (days = 30) => request(`/metrics/summary?days=${days}`),

  // community
  chatMembers: () => request('/chat/admin/members'),
  chatBanMember: (email) => request('/chat/admin/ban', { method: 'POST', body: { email } }),
  chatUnbanMember: (email) => request('/chat/admin/unban', { method: 'POST', body: { email } }),
  chatHistory: () => request('/chat/admin/messages'),
  chatRemoveMessage: (id) => request(`/chat/admin/messages/${id}`, { method: 'DELETE' }),
  chatSettings: () => request('/chat/admin/settings'),
  saveChatSettings: (settings) =>
    request('/chat/admin/settings', { method: 'PUT', body: settings }),

  // media
  uploadImage: (file, slot) => {
    const form = new FormData()
    form.append('file', file)
    form.append('slot', slot)
    return request('/media', { method: 'POST', body: form, isForm: true })
  },
  uploadPdf: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/media/pdf', { method: 'POST', body: form, isForm: true })
  },
}
