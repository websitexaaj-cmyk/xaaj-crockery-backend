import mongoose from 'mongoose'

// ============================================================
// CART SCHEMA
// ============================================================

export const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      index: true
    },

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product'
        },

        quantity: {
          type: Number,
          min: 1
        }
      }
    ]
  },
  {
    timestamps: true
  }
)

// ============================================================
// WISHLIST SCHEMA
// ============================================================

export const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      index: true
    },

    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      }
    ]
  },
  {
    timestamps: true
  }
)

// ============================================================
// COUPON SCHEMA
// ============================================================

export const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true
    },

    type: {
      type: String,
      enum: ['percent', 'fixed'],
      required: true
    },

    value: {
      type: Number,
      min: 0,
      required: true
    },

    minOrderValue: {
      type: Number,
      default: 0
    },

    expiresAt: Date,

    usageLimit: Number,

    usedCount: {
      type: Number,
      default: 0
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
)

// ============================================================
// CONTACT SCHEMA
// ============================================================

export const contactSchema = new mongoose.Schema(
  {
    name: String,

    email: String,

    subject: String,

    message: String,

    status: {
      type: String,
      enum: ['new', 'read', 'resolved'],
      default: 'new',
      index: true
    }
  },
  {
    timestamps: true
  }
)

// ============================================================
// MODELS
// ============================================================

export const Cart =
  mongoose.models.Cart ||
  mongoose.model('Cart', cartSchema)

export const Wishlist =
  mongoose.models.Wishlist ||
  mongoose.model('Wishlist', wishlistSchema)

export const Coupon =
  mongoose.models.Coupon ||
  mongoose.model('Coupon', couponSchema)

export const Contact =
  mongoose.models.Contact ||
  mongoose.model('Contact', contactSchema)