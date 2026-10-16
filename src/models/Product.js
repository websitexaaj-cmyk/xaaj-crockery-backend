
import mongoose from 'mongoose'

const productSchema = new mongoose.Schema(
  {
    // PRODUCT NAME
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    // SEO-FRIENDLY PRODUCT URL
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },

    // PRODUCT DESCRIPTION
    description: {
      type: String,
      required: true,
      trim: true
    },

    // PRODUCT DETAILS & CARE
    productDetails: {
      type: String,
      trim: true,
      default: ''
    },

    // SHIPPING & PAYMENT
    shippingPayment: {
      type: String,
      trim: true,
      default: ''
    },

    // RETURN & EXCHANGE
    returnExchange: {
      type: String,
      trim: true,
      default: ''
    },

    // PRODUCT CATEGORY
    category: {
      type: String,
      required: true,
      enum: [
        'Dinnerware',
        'Drinkware',
        'Serveware',
        'Gifting',

        // Legacy category compatibility
        'Dinner Sets',
        'Plates',
        'Bowls',
        'Cups',
        'Mugs'
      ],
      index: true
    },

    // PRODUCT SUBCATEGORY
    subcategory: {
      type: String,
      enum: [
        '',
        'Cups',
        'Mugs',
        'Pasta Plate',
        'Serving Bowl',
        'Serving Platter',
        'Tea Set',
        'Tea Cup Set'
      ],
      default: '',
      trim: true
    },

    // HSN CODE
    hsnCode: {
      type: String,
      required: true,
      trim: true,
      match: [
        /^\d{4}(?:\d{2})?(?:\d{2})?$/,
        'HSN code must contain 4, 6, or 8 digits.'
      ],
      index: true
    },

    // MRP / ORIGINAL PRICE
    mrp: {
      type: Number,
      required: true,
      min: 0
    },

    // REGULAR PRODUCT DISCOUNT
    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    // SHOW REGULAR DISCOUNT BADGE
    showDiscountPercent: {
      type: Boolean,
      default: true
    },

    // QUANTITY-BASED DISCOUNT
    // Example: Buy 3 or more and get 10% extra discount.
    quantityDiscount: {
      enabled: {
        type: Boolean,
        default: false
      },

      minQuantity: {
        type: Number,
        default: 2,
        min: 2,
        validate: {
          validator: Number.isInteger,
          message: 'Minimum quantity must be a whole number.'
        }
      },

      discountPercent: {
        type: Number,
        default: 10,
        min: 0,
        max: 100
      }
    },

    // SELLING PRICE
    price: {
      type: Number,
      required: true,
      min: 0
    },

    // OLD FIELD - COMPATIBILITY
    compareAtPrice: {
      type: Number,
      min: 0
    },

    // PRODUCT IMAGES
    images: [
      {
        type: String,
        trim: true
      }
    ],

    // AVAILABLE STOCK
    stock: {
      type: Number,
      min: 0,
      default: 0
    },

    // SHIPPING PACKAGE DETAILS
    // weight = KG; length, breadth, height = CM
    shipping: {
      weight: {
        type: Number,
        required: true,
        min: 0.001
      },

      length: {
        type: Number,
        required: true,
        min: 0.1
      },

      breadth: {
        type: Number,
        required: true,
        min: 0.1
      },

      height: {
        type: Number,
        required: true,
        min: 0.1
      }
    },

    // PRODUCT TAGS
    tags: [
      {
        type: String,
        lowercase: true,
        trim: true
      }
    ],

    // PRODUCT RATING
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },

    // NUMBER OF REVIEWS
    reviewCount: {
      type: Number,
      min: 0,
      default: 0
    },

    // PRODUCT ACTIVE / INACTIVE
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

// VALIDATE SUBCATEGORY
productSchema.pre('validate', function validateSubcategory() {
  const allowedSubcategories = {
    Dinnerware: [],

    Drinkware: [
      'Cups',
      'Mugs'
    ],

    Serveware: [
      'Pasta Plate',
      'Serving Bowl',
      'Serving Platter'
    ],

    Gifting: [
      'Tea Set',
      'Tea Cup Set'
    ]
  }

  const category = String(this.category || '').trim()
  const subcategory = String(this.subcategory || '').trim()

  if (!subcategory) {
    this.subcategory = ''
    return
  }

  if (category === 'Dinnerware') {
    this.subcategory = ''
    return
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      allowedSubcategories,
      category
    )
  ) {
    this.subcategory = ''
    return
  }

  if (!allowedSubcategories[category].includes(subcategory)) {
    this.invalidate(
      'subcategory',
      `Invalid subcategory "${subcategory}" for ${category}.`
    )
    return
  }

  this.subcategory = subcategory
})

// VALIDATE REGULAR DISCOUNT
productSchema.pre('validate', function validateDiscount() {
  const discount = Number(this.discountPercent)

  if (
    !Number.isFinite(discount) ||
    discount < 0 ||
    discount > 100
  ) {
    this.invalidate(
      'discountPercent',
      'Discount percentage must be between 0 and 100.'
    )
  }
})

// VALIDATE QUANTITY DISCOUNT
productSchema.pre('validate', function validateQuantityDiscount() {
  const quantityDiscount = this.quantityDiscount

  // Skip enabled-only validation when quantity discount is disabled.
  if (!quantityDiscount?.enabled) {
    return
  }

  const minQuantity = Number(quantityDiscount.minQuantity)
  const discountPercent = Number(quantityDiscount.discountPercent)

  if (!Number.isInteger(minQuantity) || minQuantity < 2) {
    this.invalidate(
      'quantityDiscount.minQuantity',
      'Minimum quantity must be a whole number of at least 2.'
    )
  }

  if (
    !Number.isFinite(discountPercent) ||
    discountPercent <= 0 ||
    discountPercent > 100
  ) {
    this.invalidate(
      'quantityDiscount.discountPercent',
      'Quantity discount must be greater than 0 and at most 100.'
    )
  }
})

// VALIDATE PRICE
productSchema.pre('validate', function validatePrices() {
  if (
    this.mrp !== undefined &&
    this.price !== undefined &&
    Number(this.price) > Number(this.mrp)
  ) {
    this.invalidate(
      'price',
      'Selling price cannot be greater than MRP.'
    )
  }
})

// TEXT SEARCH INDEX
productSchema.index({
  name: 'text',
  description: 'text',
  productDetails: 'text',
  tags: 'text'
})

// PRODUCT INDEXES
productSchema.index({
  category: 1,
  subcategory: 1,
  isActive: 1
})

productSchema.index({
  createdAt: -1
})

export default mongoose.model('Product', productSchema)
