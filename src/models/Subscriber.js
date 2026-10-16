import mongoose from 'mongoose'

// ============================================================
// XAAJ NEWSLETTER SUBSCRIBER SCHEMA
// ============================================================

const subscriberSchema = new mongoose.Schema(
  {
    // ========================================================
    // EMAIL
    // ========================================================

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254
    },

    // ========================================================
    // SUBSCRIPTION STATUS
    // ========================================================

    isSubscribed: {
      type: Boolean,
      default: true,
      index: true
    },

    // ========================================================
    // SUBSCRIBED DATE
    // ========================================================

    subscribedAt: {
      type: Date,
      default: Date.now
    },

    // ========================================================
    // UNSUBSCRIBED DATE
    // ========================================================

    unsubscribedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
)

// ============================================================
// INDEXES
// ============================================================

// Unique email
subscriberSchema.index(
  { email: 1 },
  { unique: true }
)

// Active subscribers
subscriberSchema.index({
  isSubscribed: 1
})

// ============================================================
// NORMALIZE EMAIL
// ============================================================

subscriberSchema.pre(
  'validate',
  function normalizeEmail() {

    if (this.email) {
      this.email =
        this.email
          .trim()
          .toLowerCase()
    }

  }
)

// ============================================================
// MODEL
// ============================================================

export default mongoose.model(
  'Subscriber',
  subscriberSchema
)