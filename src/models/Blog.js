import mongoose from 'mongoose'

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 180
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 220,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    },

    coverImage: {
      type: String,
      required: true,
      trim: true
    },

    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
      index: true
    },

    excerpt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },

    content: {
      type: String,
      required: true,
      trim: true,
      minlength: 10
    },

    author: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      default: 'XAAJ Editorial'
    },

    publishDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },

    isPublished: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
)

blogSchema.index({
  isPublished: 1,
  publishDate: -1
})

blogSchema.index({
  category: 1,
  isPublished: 1,
  publishDate: -1
})

blogSchema.pre('validate', function normalizeBlogFields() {
  if (this.title) {
    this.title = this.title.trim()
  }

  if (this.slug) {
    this.slug = this.slug.trim().toLowerCase()
  }

  if (this.category) {
    this.category = this.category.trim()
  }

  if (this.excerpt) {
    this.excerpt = this.excerpt.trim()
  }

  if (this.content) {
    this.content = this.content.trim()
  }

  if (this.author) {
    this.author = this.author.trim()
  }
})

export default mongoose.model('Blog', blogSchema)