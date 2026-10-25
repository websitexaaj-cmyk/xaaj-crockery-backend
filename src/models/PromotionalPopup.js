import mongoose from 'mongoose'

const promotionalPopupSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  imageUrl: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  imageAlt: {
    type: String,
    default: '',
    trim: true,
    maxlength: 180
  },
  displayDelaySeconds: {
    type: Number,
    default: 3,
    min: 0,
    max: 3600
  },
  visibleDurationSeconds: {
    type: Number,
    default: 10,
    min: 0,
    max: 3600
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  device: {
    type: String,
    enum: ['all', 'desktop', 'mobile'],
    default: 'all'
  },
  enabled: {
    type: Boolean,
    default: true
  },
  targetUrl: {
    type: String,
    default: '/',
    trim: true,
    maxlength: 500
  },
  frequency: {
    type: String,
    enum: ['session', 'day', 'always'],
    default: 'session'
  }
}, { timestamps: true })

promotionalPopupSchema.index({ enabled: 1, startDate: 1, endDate: 1 })

const PromotionalPopup = mongoose.models.PromotionalPopup ||
  mongoose.model('PromotionalPopup', promotionalPopupSchema)

export default PromotionalPopup
