import mongoose from 'mongoose'

// =====================================================
// REVIEW SCHEMA
// =====================================================
// Customer sirf delivered order ke product par review
// de sakta hai.
//
// Ek user + ek order + ek product = sirf ek review.
// =====================================================

const reviewSchema = new mongoose.Schema(
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
    // ORDER
    // =================================================
    // Is review ko kis order se verify kiya gaya hai.
    // =================================================

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true
    },

    // =================================================
    // PRODUCT
    // =================================================

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true
    },

    // =================================================
    // RATING
    // =================================================
    // Customer 1 se 5 stars select karega.
    // =================================================

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be a whole number between 1 and 5.'
      }
    },

    // =================================================
    // REVIEW COMMENT
    // =================================================
    // Comment optional hai.
    // =================================================

    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },

    // =================================================
    // VERIFIED PURCHASE
    // =================================================
    // Review sirf delivered order ke product ke liye
    // submit hoga, isliye ye verified purchase
    // ko represent karta hai.
    // =================================================

    isVerifiedPurchase: {
      type: Boolean,
      default: true
    },

    // =================================================
    // ACTIVE REVIEW
    // =================================================
    // Future mein admin review hide/remove kar sake,
    // isliye active flag rakha gaya hai.
    // =================================================

    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
)

// =====================================================
// IMPORTANT UNIQUE INDEX
// =====================================================
// Same customer same order ke same product ko
// multiple baar review nahi kar sakta.
//
// User A + Order 123 + Product X = allowed
// User A + Order 123 + Product X = duplicate ❌
//
// User A + Order 123 + Product Y = allowed
// =====================================================

reviewSchema.index(
  {
    user: 1,
    order: 1,
    product: 1
  },
  {
    unique: true
  }
)

// =====================================================
// PRODUCT REVIEW QUERY INDEX
// =====================================================
// Product page par reviews efficiently fetch karne
// ke liye.
// =====================================================

reviewSchema.index({
  product: 1,
  isActive: 1,
  createdAt: -1
})

// =====================================================
// USER REVIEW QUERY INDEX
// =====================================================

reviewSchema.index({
  user: 1,
  createdAt: -1
})

// =====================================================
// EXPORT
// =====================================================
// Agar Review model already compiled hai to existing
// model use hoga.
// Agar nahi hai to naya model create hoga.
//
// Isse OverwriteModelError avoid hota hai.
// =====================================================

const Review =
  mongoose.models.Review ||
  mongoose.model('Review', reviewSchema)

export default Review