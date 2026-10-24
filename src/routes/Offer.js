import { Router } from 'express'
import mongoose from 'mongoose'

import Offer from '../models/Offer.js'
import Product from '../models/Product.js'
import { asyncHandler, protect } from '../middleware/index.js'

const router = Router()

// --------------------------------------------------
// Public customer endpoints
// Keep these BEFORE router.use(protect, adminOnly).
// --------------------------------------------------
const isOfferActive = offer => {
  const now = new Date()
  return offer.enabled === true &&
    (!offer.startDate || new Date(offer.startDate) <= now) &&
    (!offer.endDate || new Date(offer.endDate) >= now) &&
    (offer.usageLimit == null || offer.usedCount < offer.usageLimit)
}

const calculateDiscount = (offer, eligibleSubtotal) => {
  const raw = offer.discountType === 'percentage'
    ? eligibleSubtotal * Number(offer.discountValue || 0) / 100
    : Number(offer.discountValue || 0)

  return Math.max(0, Math.min(eligibleSubtotal, Math.round(raw * 100) / 100))
}

// GET /api/offers/active
// Returns customer-safe active automatic offers. Coupon codes are not exposed.
router.get('/active', asyncHandler(async (_req, res) => {
  const offers = await Offer.find({
    enabled: true,
    type: { $in: ['site-wide', 'product-wise', 'bundle'] },
    $and: [
      { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: new Date() } }] },
      { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: new Date() } }] },
      { $or: [{ usageLimit: null }, { usageLimit: { $exists: false } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] }
    ]
  })
    .select('type title discountType discountValue minimumPurchase minimumQuantity productIds bundleProductIds startDate endDate')
    .populate('productIds', 'name price images')
    .populate('bundleProductIds', 'name price images')
    .sort({ createdAt: -1 })

  res.json({
    success: true,
    data: {
      offers: offers.filter(isOfferActive)
    }
  })
}))

// POST /api/offers/validate-coupon
// Body: { code, items: [{ productId, quantity }] }
// The server calculates the preview from current database prices.
router.post('/validate-coupon', asyncHandler(async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase()
  const items = Array.isArray(req.body?.items) ? req.body.items : []

  if (!code) {
    return res.status(400).json({ success: false, message: 'Enter a coupon code.' })
  }
  if (!items.length) {
    return res.status(400).json({ success: false, message: 'Your cart is empty.' })
  }

  const normalizedItems = []
  for (const item of items) {
    const productId = String(item.productId || item.product || item.id || '')
    const quantity = Number(item.quantity ?? item.qty ?? 1)
    if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Cart contains an invalid product or quantity.' })
    }
    normalizedItems.push({ productId, quantity })
  }

  const offer = await Offer.findOne({ type: 'coupon', couponCode: code })
  if (!offer || !isOfferActive(offer)) {
    return res.status(404).json({ success: false, message: 'This coupon is invalid, expired, disabled, or has reached its usage limit.' })
  }

  const ids = normalizedItems.map(item => item.productId)
  const products = await Product.find({ _id: { $in: ids }, isActive: true }).select('name price')
  if (products.length !== new Set(ids).size) {
    return res.status(400).json({ success: false, message: 'One or more cart products are unavailable.' })
  }

  const byId = new Map(products.map(product => [String(product._id), product]))
  const subtotal = normalizedItems.reduce((sum, item) => {
    const product = byId.get(item.productId)
    return sum + Number(product?.price || 0) * item.quantity
  }, 0)

  if (subtotal < Number(offer.minimumPurchase || 0)) {
    return res.status(400).json({
      success: false,
      message: `Minimum purchase for this coupon is ₹${Number(offer.minimumPurchase || 0).toFixed(2)}.`,
      data: { minimumPurchase: Number(offer.minimumPurchase || 0), subtotal }
    })
  }

  const discount = calculateDiscount(offer, subtotal)
  return res.json({
    success: true,
    message: 'Coupon applied successfully.',
    data: {
      couponCode: offer.couponCode,
      title: offer.title,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      subtotal,
      discount,
      eligibleTotal: Math.max(0, subtotal - discount)
    }
  })
}))

// --------------------------------------------------
// Admin authorization
// --------------------------------------------------
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required.'
    })
  }

  next()
}

router.use(protect, adminOnly)

// --------------------------------------------------
// Helpers
// --------------------------------------------------
const validateOffer = payload => {
  const errors = []

  if (!payload.title || !String(payload.title).trim()) {
    errors.push('Offer name is required.')
  }

  if (!['site-wide', 'product-wise', 'coupon', 'bundle'].includes(payload.type)) {
    errors.push('Invalid offer type.')
  }

  if (!['percentage', 'fixed'].includes(payload.discountType)) {
    errors.push('Invalid discount type.')
  }

  const discountValue = Number(payload.discountValue)

  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    errors.push('Discount value must be greater than zero.')
  }

  if (payload.discountType === 'percentage' && discountValue > 100) {
    errors.push('Percentage discount cannot exceed 100%.')
  }

  if (payload.type === 'coupon' && !String(payload.couponCode || '').trim()) {
    errors.push('Coupon code is required.')
  }

  if (payload.type === 'product-wise' && (!Array.isArray(payload.productIds) || payload.productIds.length === 0)) {
    errors.push('Select at least one product.')
  }

  if (payload.type === 'bundle' && (!Array.isArray(payload.bundleProductIds) || payload.bundleProductIds.length < 2)) {
    errors.push('Select at least two products for a bundle offer.')
  }

  if (payload.minimumPurchase != null && (!Number.isFinite(Number(payload.minimumPurchase)) || Number(payload.minimumPurchase) < 0)) {
    errors.push('Minimum purchase cannot be negative.')
  }

  if (payload.minimumQuantity != null && (!Number.isFinite(Number(payload.minimumQuantity)) || Number(payload.minimumQuantity) < 0)) {
    errors.push('Minimum quantity cannot be negative.')
  }

  if (payload.usageLimit != null && payload.usageLimit !== '' && (!Number.isInteger(Number(payload.usageLimit)) || Number(payload.usageLimit) < 1)) {
    errors.push('Usage limit must be a positive whole number.')
  }

  const start = payload.startDate ? new Date(payload.startDate) : null
  const end = payload.endDate ? new Date(payload.endDate) : null

  if (start && Number.isNaN(start.getTime())) errors.push('Invalid start date.')
  if (end && Number.isNaN(end.getTime())) errors.push('Invalid end date.')

  if (start && end && start > end) {
    errors.push('End date cannot be earlier than start date.')
  }

  return errors
}

const normalizePayload = body => ({
  type: body.type,
  title: String(body.title || '').trim(),
  discountType: body.discountType,
  discountValue: Number(body.discountValue),
  couponCode: String(body.couponCode || '').trim().toUpperCase(),
  minimumPurchase: body.minimumPurchase === '' || body.minimumPurchase == null ? 0 : Number(body.minimumPurchase),
  minimumQuantity: body.minimumQuantity === '' || body.minimumQuantity == null ? 0 : Number(body.minimumQuantity),
  productIds: Array.isArray(body.productIds) ? [...new Set(body.productIds.map(String))] : [],
  bundleProductIds: Array.isArray(body.bundleProductIds) ? [...new Set(body.bundleProductIds.map(String))] : [],
  startDate: body.startDate || null,
  endDate: body.endDate || null,
  usageLimit: body.usageLimit === '' || body.usageLimit == null ? null : Number(body.usageLimit),
  enabled: body.enabled !== false
})

const validateProductIds = async (ids, fieldName) => {
  if (!ids.length) return null

  if (ids.some(id => !mongoose.isValidObjectId(id))) {
    return `${fieldName} contains an invalid product ID.`
  }

  const count = await Product.countDocuments({
    _id: { $in: ids },
    isActive: true
  })

  if (count !== ids.length) {
    return `${fieldName} contains a missing or inactive product.`
  }

  return null
}

const sendValidationErrors = (res, errors) =>
  res.status(400).json({
    success: false,
    message: errors.join(' ')
  })

const handleDatabaseError = (err, res) => {
  if (err?.code === 11000) {
    res.status(409).json({
      success: false,
      message: 'An offer with this coupon code already exists.'
    })
    return true
  }

  if (err?.name === 'ValidationError' || err?.name === 'CastError') {
    res.status(400).json({
      success: false,
      message: err.message
    })
    return true
  }

  return false
}

// --------------------------------------------------
// GET ALL OFFERS FOR ADMIN
// GET /api/offers/admin
// --------------------------------------------------
router.get(
  '/admin',
  asyncHandler(async (_req, res) => {
    const offers = await Offer.find()
      .populate('productIds', 'name price images')
      .populate('bundleProductIds', 'name price images')
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      data: { offers }
    })
  })
)

// --------------------------------------------------
// CREATE OFFER
// POST /api/offers
// --------------------------------------------------
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = normalizePayload(req.body)
    const errors = validateOffer(payload)

    if (errors.length) return sendValidationErrors(res, errors)

    const productError = await validateProductIds(payload.productIds, 'Selected products')
    const bundleError = await validateProductIds(payload.bundleProductIds, 'Bundle products')

    if (productError || bundleError) {
      return sendValidationErrors(res, [productError, bundleError].filter(Boolean))
    }

    try {
      const offer = await Offer.create(payload)
      return res.status(201).json({
        success: true,
        message: 'Offer created successfully.',
        data: offer
      })
    } catch (err) {
      if (handleDatabaseError(err, res)) return
      throw err
    }
  })
)

// --------------------------------------------------
// UPDATE OFFER
// PATCH /api/offers/:id
// --------------------------------------------------
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid offer ID.' })
    }

    const existing = await Offer.findById(req.params.id)
    if (!existing) return res.status(404).json({ success: false, message: 'Offer not found.' })

    const merged = { ...existing.toObject(), ...req.body }
    const payload = normalizePayload(merged)
    const errors = validateOffer(payload)
    if (errors.length) return sendValidationErrors(res, errors)

    const productError = await validateProductIds(payload.productIds, 'Selected products')
    const bundleError = await validateProductIds(payload.bundleProductIds, 'Bundle products')
    if (productError || bundleError) {
      return sendValidationErrors(res, [productError, bundleError].filter(Boolean))
    }

    try {
      payload.usedCount = existing.usedCount
      const offer = await Offer.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true, runValidators: true })
      return res.json({ success: true, message: 'Offer updated successfully.', data: offer })
    } catch (err) {
      if (handleDatabaseError(err, res)) return
      throw err
    }
  })
)

// --------------------------------------------------
// DELETE OFFER
// DELETE /api/offers/:id
// --------------------------------------------------
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid offer ID.' })
    }

    const offer = await Offer.findByIdAndDelete(req.params.id)
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found.' })

    return res.json({ success: true, message: 'Offer deleted successfully.' })
  })
)

export default router
