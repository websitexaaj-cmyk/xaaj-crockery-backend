import mongoose from 'mongoose'

// =====================================================
// SHIPPING ADDRESS SNAPSHOT
// =====================================================
// Order create hone ke time customer ka address yahan
// copy hoga. Baad mein user apna address change kare,
// purane order ka address change nahi hoga.
// =====================================================

const shippingAddressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true, maxlength: 15 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    pin: { type: String, required: true, trim: true, match: /^\d{6}$/ }
  },
  { _id: false }
)

// =====================================================
// ORDER ITEM SCHEMA
// =====================================================

const itemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: '', trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be a whole number'
      }
    },
    reviewSubmitted: { type: Boolean, default: false },
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review',
      default: null
    },
    reviewedAt: { type: Date, default: null }
  },
  { _id: false }
)

// =====================================================
// APPLIED COUPON SNAPSHOT
// =====================================================
// Coupon details are saved with the order so later edits
// to the Offer document do not change historical orders.
// =====================================================

const appliedCouponSchema = new mongoose.Schema(
  {
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Offer',
      default: null
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
      default: ''
    },
    title: {
      type: String,
      trim: true,
      maxlength: 150,
      default: ''
    },
    discount: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  { _id: false }
)

// =====================================================
// ORDER SCHEMA
// =====================================================

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    items: {
      type: [itemSchema],
      required: true,
      validate: {
        validator: value => Array.isArray(value) && value.length > 0,
        message: 'Order must contain at least one item'
      }
    },

    shippingAddress: {
      type: shippingAddressSchema,
      required: true
    },

    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    // Detailed coupon snapshot plus legacy couponCode field.
    appliedCoupon: {
      type: appliedCouponSchema,
      default: null
    },
    couponCode: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
      maxlength: 50
    },

    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'packed',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled'
      ],
      default: 'pending',
      index: true
    },

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true
    },

    paymentProvider: { type: String, default: '', trim: true },
    paymentReference: { type: String, default: '', trim: true },

    razorpayOrderId: { type: String, default: '', trim: true, index: true },
    razorpayPaymentId: { type: String, default: '', trim: true },

    courierName: { type: String, default: '', trim: true, maxlength: 100 },
    trackingNumber: { type: String, default: '', trim: true, maxlength: 150 },

    velocityOrderId: { type: String, default: '', trim: true, index: true },
    velocityShipmentId: { type: String, default: '', trim: true, index: true },
    velocityAwb: { type: String, default: '', trim: true, index: true },
    velocityCarrierId: { type: String, default: '', trim: true },
    velocityTrackingUrl: { type: String, default: '', trim: true },
    velocityStatus: { type: String, default: '', trim: true },
    velocitySubStatus: { type: String, default: '', trim: true },
    velocityExpectedDelivery: { type: Date, default: null },
    velocityLastSyncedAt: { type: Date, default: null }
  },
  { timestamps: true }
)

// =====================================================
// INDEXES
// =====================================================

orderSchema.index({ createdAt: -1 })
orderSchema.index({ user: 1, createdAt: -1 })
orderSchema.index({ status: 1, createdAt: -1 })
orderSchema.index({ paymentStatus: 1, createdAt: -1 })
orderSchema.index({ velocityAwb: 1 })
orderSchema.index({ velocityShipmentId: 1 })
orderSchema.index({ user: 1, status: 1, createdAt: -1 })

export default mongoose.models.Order || mongoose.model('Order', orderSchema)
