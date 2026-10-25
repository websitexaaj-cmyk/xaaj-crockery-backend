import express from 'express'
import PromotionalPopup from '../models/PromotionalPopup.js'

const asyncRoute = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

// Accept the field names used by the current Admin.jsx and persist the names
// consumed by the storefront popup component.
function normalizePayload(body = {}, { partial = false } = {}) {
  const payload = {}
  const aliases = {
    title: ['title'],
    imageUrl: ['imageUrl', 'image', 'mediaUrl'],
    imageAlt: ['imageAlt', 'alt'],
    displayDelaySeconds: ['displayDelaySeconds', 'delaySeconds'],
    visibleDurationSeconds: ['visibleDurationSeconds', 'displayDurationSeconds', 'durationSeconds'],
    startDate: ['startDate'],
    endDate: ['endDate'],
    device: ['device'],
    enabled: ['enabled'],
    targetUrl: ['targetUrl', 'clickUrl'],
    frequency: ['frequency']
  }

  for (const [target, keys] of Object.entries(aliases)) {
    const key = keys.find(candidate => hasOwn(body, candidate))
    if (key) payload[target] = body[key]
  }

  if (!partial) {
    if (!String(payload.title || '').trim()) {
      const error = new Error('Popup title is required.')
      error.statusCode = 400
      throw error
    }
    if (!String(payload.imageUrl || '').trim()) {
      const error = new Error('Upload an image or provide a public image URL.')
      error.statusCode = 400
      throw error
    }
    if (!payload.startDate || !payload.endDate) {
      const error = new Error('Start date and end date are required.')
      error.statusCode = 400
      throw error
    }
  }

  if (payload.title !== undefined) payload.title = String(payload.title).trim()
  if (payload.imageUrl !== undefined) payload.imageUrl = String(payload.imageUrl).trim()
  if (payload.imageAlt !== undefined) payload.imageAlt = String(payload.imageAlt || '').trim()

  if (payload.displayDelaySeconds !== undefined) {
    payload.displayDelaySeconds = Number(payload.displayDelaySeconds)
    if (!Number.isFinite(payload.displayDelaySeconds) || payload.displayDelaySeconds < 0 || payload.displayDelaySeconds > 3600) {
      const error = new Error('Display delay must be between 0 and 3600 seconds.')
      error.statusCode = 400
      throw error
    }
  }

  if (payload.visibleDurationSeconds !== undefined) {
    payload.visibleDurationSeconds = Number(payload.visibleDurationSeconds)
    if (!Number.isFinite(payload.visibleDurationSeconds) || payload.visibleDurationSeconds < 0 || payload.visibleDurationSeconds > 3600) {
      const error = new Error('Visibility duration must be between 0 and 3600 seconds.')
      error.statusCode = 400
      throw error
    }
  }

  for (const key of ['startDate', 'endDate']) {
    if (payload[key] !== undefined) {
      const raw = payload[key]
      if (!raw) {
        payload[key] = null
        continue
      }
      const parsed = new Date(raw)
      if (Number.isNaN(parsed.getTime())) {
        const error = new Error(`${key === 'startDate' ? 'Start' : 'End'} date is invalid.`)
        error.statusCode = 400
        throw error
      }
      // Treat date-input values as calendar dates: the end date stays active
      // throughout the selected day, not only at midnight UTC.
      if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        if (key === 'endDate') parsed.setUTCHours(23, 59, 59, 999)
      }
      payload[key] = parsed
    }
  }

  if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
    const error = new Error('End date must be on or after start date.')
    error.statusCode = 400
    throw error
  }

  if (payload.device !== undefined && !['all', 'desktop', 'mobile'].includes(payload.device)) {
    const error = new Error('Device must be all, desktop, or mobile.')
    error.statusCode = 400
    throw error
  }

  if (payload.enabled !== undefined) payload.enabled = payload.enabled === true || payload.enabled === 'true'

  if (payload.targetUrl !== undefined) {
    payload.targetUrl = String(payload.targetUrl || '/').trim()
    if (payload.targetUrl && !payload.targetUrl.startsWith('/') && !/^https:\/\//i.test(payload.targetUrl)) {
      const error = new Error('Popup target URL must be a relative path or HTTPS URL.')
      error.statusCode = 400
      throw error
    }
  }

  if (payload.frequency !== undefined && !['session', 'day', 'always'].includes(payload.frequency)) {
    const error = new Error('Frequency must be session, day, or always.')
    error.statusCode = 400
    throw error
  }

  return payload
}

function toAdminRecord(item) {
  const record = typeof item?.toObject === 'function' ? item.toObject() : item
  return {
    ...record,
    id: String(record._id),
    delaySeconds: record.displayDelaySeconds ?? 3,
    displayDurationSeconds: record.visibleDurationSeconds ?? 10,
    clickUrl: record.targetUrl || '/'
  }
}

// Factory receives the project's existing authentication middleware from index.js.
export default function createPromotionalPopupsRouter({ protect, adminOnly }) {
  if (typeof protect !== 'function' || typeof adminOnly !== 'function') {
    throw new Error('Popup Promotional routes require protect and adminOnly middleware.')
  }

  const router = express.Router()
  const requireAdmin = [protect, adminOnly]

  // Public storefront: return only an enabled popup within its campaign dates.
  router.get('/active', asyncRoute(async (_req, res) => {
    const now = new Date()
    const item = await PromotionalPopup.findOne({
      enabled: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ updatedAt: -1 }).lean()

    res.set('Cache-Control', 'no-store')
    res.json({ success: true, data: { item } })
  }))

  // Admin list endpoint.
  router.get('/admin', ...requireAdmin, asyncRoute(async (_req, res) => {
    const items = await PromotionalPopup.find().sort({ createdAt: -1 }).lean()
    res.json({ success: true, data: { popups: items.map(toAdminRecord) } })
  }))

  // Admin create endpoint: POST /api/promotional-popups
  router.post('/', ...requireAdmin, asyncRoute(async (req, res) => {
    const payload = normalizePayload(req.body)
    const item = await PromotionalPopup.create(payload)
    res.status(201).json({ success: true, data: { item: toAdminRecord(item) } })
  }))

  // Admin update endpoint: PATCH /api/promotional-popups/:id
  router.patch('/:id', ...requireAdmin, asyncRoute(async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(String(req.params.id || ''))) {
      return res.status(400).json({ success: false, message: 'Invalid popup ID.' })
    }
    const payload = normalizePayload(req.body, { partial: true })
    const item = await PromotionalPopup.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    })
    if (!item) return res.status(404).json({ success: false, message: 'Popup not found.' })
    res.json({ success: true, data: { item: toAdminRecord(item) } })
  }))

  // Admin delete endpoint.
  router.delete('/:id', ...requireAdmin, asyncRoute(async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(String(req.params.id || ''))) {
      return res.status(400).json({ success: false, message: 'Invalid popup ID.' })
    }
    const item = await PromotionalPopup.findByIdAndDelete(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Popup not found.' })
    res.json({ success: true, message: 'Popup deleted successfully.' })
  }))

  return router
}
