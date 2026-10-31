import mongoose from 'mongoose'

const offerRedemptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  offer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer',
    required: true,
    index: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  redeemedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true })

// One redemption per user for each individual one-time offer.
// The checkout/payment routes should create records only for
// site-wide and coupon offers after the order is accepted/paid.
offerRedemptionSchema.index({ user: 1, offer: 1 }, { unique: true })

export default mongoose.models.OfferRedemption ||
  mongoose.model('OfferRedemption', offerRedemptionSchema)
