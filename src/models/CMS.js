import mongoose from 'mongoose'

const contentSchema = new mongoose.Schema(
  {
    // ==========================================================
    // CONTENT TYPE
    // ==========================================================

    type: {
      type: String,
      enum: [
        'announcement',
        'hero',
        'category-hero',
        'promotion',
        'testimonial',
        'gallery',
        'settings'
      ],
      required: true,
      index: true
    },

    // ==========================================================
    // COMMON CONTENT FIELDS
    // ==========================================================

    title: {
      type: String,
      trim: true
    },

    eyebrow: {
      type: String,
      trim: true
    },

    body: {
      type: String,
      trim: true
    },

    // ==========================================================
    // ANNOUNCEMENT
    // ==========================================================

    // Announcement bar ka text
    text: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },

    // Announcement ko ON/OFF karne ke liye
    enabled: {
      type: Boolean,
      default: true
    },

    // ==========================================================
    // HERO MEDIA
    // ==========================================================

    // Image URL OR Video URL
    image: {
      type: String,
      trim: true
    },

    // Hero media ka type
    // image = JPG, PNG, WEBP etc.
    // video = MP4, WEBM etc.
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      default: 'image'
    },

    mobileImage: {
      type: String,
      trim: true
    },

    // ==========================================================
    // BUTTON / LINK
    // ==========================================================

    buttonText: {
      type: String,
      trim: true
    },

    link: {
      type: String,
      trim: true
    },

    // ==========================================================
    // ORDER
    // ==========================================================

    order: {
      type: Number,
      default: 0
    },

    // ==========================================================
    // ACTIVE STATUS
    // ==========================================================

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    // ==========================================================
    // SCHEDULE
    // ==========================================================

    startsAt: {
      type: Date,
      default: null
    },

    endsAt: {
      type: Date,
      default: null
    },

    // ==========================================================
    // EXTRA DATA
    // ==========================================================

    // Category hero records store stable category information
    // here, for example:
    // {
    //   categorySlug: 'serveware',
    //   categoryName: 'Serveware',
    //   alt: 'XAAJ Serveware'
    // }
    metadata: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
)

export default mongoose.model(
  'Content',
  contentSchema
)
