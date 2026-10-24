import mongoose from 'mongoose'

const offerSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['site-wide', 'product-wise', 'coupon', 'bundle'],
    required: true,
    index: true
  },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage',
    required: true
  },
  discountValue: { type: Number, required: true, min: 0.01 },
  couponCode: {
    type: String,
    trim: true,
    uppercase: true,
    default: '',
    set: value => String(value ?? '').trim().toUpperCase()
  },
  minimumPurchase: { type: Number, min: 0, default: 0 },
  minimumQuantity: { type: Number, min: 0, default: 0 },
  productIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    default: []
  },
  bundleProductIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    default: []
  },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  usageLimit: { type: Number, min: 1, default: null },
  // Increment only when a coupon is accepted according to checkout rules.
  usedCount: { type: Number, min: 0, default: 0 },
  enabled: { type: Boolean, default: true, index: true }
}, { timestamps: true })

offerSchema.pre('validate', function validateOffer() {
  if (this.discountType === 'percentage' && Number(this.discountValue) > 100) {
    this.invalidate('discountValue', 'Percentage discount cannot exceed 100%.')
  }

  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'End date cannot be earlier than start date.')
  }

  if (this.type === 'coupon' && !this.couponCode) {
    this.invalidate('couponCode', 'Coupon code is required for coupon offers.')
  }

  if (this.type !== 'coupon' && this.couponCode) {
    this.invalidate('couponCode', 'Coupon codes can only be set for coupon offers.')
  }

  if (this.type === 'product-wise' && (!this.productIds || this.productIds.length === 0)) {
    this.invalidate('productIds', 'Select at least one product.')
  }

  if (this.type === 'bundle' && (!this.bundleProductIds || this.bundleProductIds.length < 2)) {
    this.invalidate('bundleProductIds', 'Select at least two products for a bundle offer.')
  }

  if (this.type !== 'bundle' && Number(this.minimumQuantity || 0) < 0) {
    this.invalidate('minimumQuantity', 'Minimum quantity cannot be negative.')
  }

  if (this.usageLimit != null && Number(this.usedCount || 0) > Number(this.usageLimit)) {
    this.invalidate('usageLimit', 'Usage limit cannot be less than the current used count.')
  }
})

offerSchema.index(
  { type: 1, couponCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: 'coupon',
      couponCode: { $gt: '' }
    }
  }
)

export default mongoose.models.Offer || mongoose.model('Offer', offerSchema)
