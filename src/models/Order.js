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
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 15
    },

    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },

    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    state: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    pin: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{6}$/
    }
  },
  {
    _id: false
  }
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

    // =================================================
    // PRODUCT NAME SNAPSHOT
    // =================================================

    name: {
      type: String,
      required: true,
      trim: true
    },

    // =================================================
    // PRODUCT IMAGE SNAPSHOT
    // =================================================

    image: {
      type: String,
      default: '',
      trim: true
    },

    // =================================================
    // PRODUCT PRICE SNAPSHOT
    // =================================================

    price: {
      type: Number,
      required: true,
      min: 0
    },

    // =================================================
    // QUANTITY
    // =================================================

    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be a whole number'
      }
    },

    // =================================================
    // PRODUCT REVIEW
    // =================================================
    // Review har order item ke level par track hoga.
    //
    // Example:
    //
    // Order:
    //   Product A -> reviewed
    //   Product B -> not reviewed
    //
    // User ko Product A ke liye review dobara option
    // nahi milega, lekin Product B ke liye milega.
    // =====================================================

    reviewSubmitted: {
      type: Boolean,
      default: false
    },

    // Review document ka reference
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review',
      default: null
    },

    // Review submit hone ka time
    reviewedAt: {
      type: Date,
      default: null
    }
  },
  {
    _id: false
  }
)

// =====================================================
// ORDER SCHEMA
// =====================================================

const orderSchema = new mongoose.Schema(
  {
    // =================================================
    // CUSTOMER
    // =================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // =================================================
    // PRODUCTS
    // =================================================

    items: {
      type: [itemSchema],
      required: true,

      validate: {
        validator: value =>
          Array.isArray(value) && value.length > 0,

        message: 'Order must contain at least one item'
      }
    },

    // =================================================
    // SHIPPING ADDRESS SNAPSHOT
    // =================================================

    shippingAddress: {
      type: shippingAddressSchema,
      required: true
    },

    // =================================================
    // PRICE DETAILS
    // =================================================

    subtotal: {
      type: Number,
      required: true,
      min: 0
    },

    discount: {
      type: Number,
      default: 0,
      min: 0
    },

    shippingFee: {
      type: Number,
      default: 0,
      min: 0
    },

    total: {
      type: Number,
      required: true,
      min: 0
    },

    // =================================================
    // ORDER STATUS
    // =================================================

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

    // =================================================
    // PAYMENT STATUS
    // =================================================

    paymentStatus: {
      type: String,

      enum: [
        'pending',
        'paid',
        'failed',
        'refunded'
      ],

      default: 'pending',
      index: true
    },

    paymentProvider: {
      type: String,
      default: '',
      trim: true
    },

    paymentReference: {
      type: String,
      default: '',
      trim: true
    },

    // =================================================
    // RAZORPAY
    // =================================================

    razorpayOrderId: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    razorpayPaymentId: {
      type: String,
      default: '',
      trim: true
    },

    // =================================================
    // SHIPPING / DELIVERY
    // =================================================
    // Manual fallback fields.
    // Agar Velocity se data nahi aata to admin manually
    // courier aur tracking update kar sakta hai.
    // =================================================

    courierName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100
    },

    trackingNumber: {
      type: String,
      default: '',
      trim: true,
      maxlength: 150
    },

    // =================================================
    // VELOCITY SHIPPING
    // =================================================

    // Velocity order/shipment reference
    velocityOrderId: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    velocityShipmentId: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    // Velocity AWB / tracking number
    velocityAwb: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    // Velocity assigned courier ID
    velocityCarrierId: {
      type: String,
      default: '',
      trim: true
    },

    // Tracking URL provided by Velocity
    velocityTrackingUrl: {
      type: String,
      default: '',
      trim: true
    },

    // Raw/current status received from Velocity
    velocityStatus: {
      type: String,
      default: '',
      trim: true
    },

    // More specific Velocity sub-status
    velocitySubStatus: {
      type: String,
      default: '',
      trim: true
    },

    // Expected delivery date from Velocity
    velocityExpectedDelivery: {
      type: Date,
      default: null
    },

    // Last time Velocity tracking/status was synced
    velocityLastSyncedAt: {
      type: Date,
      default: null
    },

    // =================================================
    // COUPON
    // =================================================

    couponCode: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
      maxlength: 50
    }
  },
  {
    timestamps: true
  }
)

// =====================================================
// INDEXES
// =====================================================

orderSchema.index({
  createdAt: -1
})

orderSchema.index({
  user: 1,
  createdAt: -1
})

orderSchema.index({
  status: 1,
  createdAt: -1
})

orderSchema.index({
  paymentStatus: 1,
  createdAt: -1
})

orderSchema.index({
  velocityAwb: 1
})

orderSchema.index({
  velocityShipmentId: 1
})

// =====================================================
// REVIEW-RELATED INDEX
// =====================================================
// Delivered orders aur review eligibility ko efficiently
// query karne ke liye.
// =====================================================

orderSchema.index({
  user: 1,
  status: 1,
  createdAt: -1
})

// =====================================================
// EXPORT
// =====================================================

export default mongoose.model(
  'Order',
  orderSchema
)