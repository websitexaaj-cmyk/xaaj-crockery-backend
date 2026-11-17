
import mongoose from 'mongoose'

const velocityWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 200
    },

    eventType: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100
    },

    shipmentId: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    awb: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    orderExternalId: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },

    processingStatus: {
      type: String,
      enum: ['received', 'processed', 'failed'],
      default: 'received',
      index: true
    },

    errorMessage: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000
    },

    processedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
)

velocityWebhookEventSchema.index({ createdAt: -1 })
velocityWebhookEventSchema.index({ processingStatus: 1, createdAt: -1 })

export default mongoose.models.VelocityWebhookEvent ||
  mongoose.model('VelocityWebhookEvent', velocityWebhookEventSchema)
