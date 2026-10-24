import { Router } from 'express'
import Product from '../models/Product.js'
import Offer from '../models/Offer.js'
import Review from '../models/Reviews.js'
import Subscriber from '../models/Subscriber.js'
import { sendEmail } from '../services/integrations.js'
import {
  asyncHandler,
  adminOnly,
  protect,
  productSchema,
  validate
} from '../middleware/index.js'
const router = Router()

const getActiveAutomaticOffers = async () => {
  const now = new Date()
  return Offer.find({
    enabled: true,
    type: { $in: ['site-wide', 'product-wise', 'bundle'] },
    $and: [
      { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
    ]
  }).select('type title description discountType discountValue minimumPurchase minimumQuantity productIds bundleProductIds startDate endDate').lean()
}

const getProductOfferMetadata = (product, offers) => {
  const id = String(product._id)
  const matched = offers.filter(offer =>
    offer.type === 'site-wide' ||
    (offer.type === 'product-wise' && (offer.productIds || []).some(productId => String(productId) === id)) ||
    (offer.type === 'bundle' && (offer.bundleProductIds || []).some(productId => String(productId) === id))
  )
  return matched.map(offer => ({
    _id: offer._id,
    type: offer.type,
    title: offer.title,
    description: offer.description || '',
    discountType: offer.discountType,
    discountValue: offer.discountValue,
    minimumPurchase: Number(offer.minimumPurchase || 0),
    minimumQuantity: Number(offer.minimumQuantity || 0)
  }))
}

// ============================================================
// PRODUCT CATEGORY / SUBCATEGORY RULES
// ============================================================
const PRODUCT_CATEGORIES = [
  'Dinnerware',
  'Drinkware',
  'Serveware',
  'Gifting'
]
const PRODUCT_SUBCATEGORIES = {
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
    'Tea Cup Set',
    'Serving Set'
  ]
}
const HSN_REGEX = /^\d{4}(?:\d{2})?(?:\d{2})?$/
const validateQuantityDiscount = quantityDiscount => {
  if (
    !quantityDiscount ||
    typeof quantityDiscount !== 'object' ||
    Array.isArray(quantityDiscount)
  ) {
    return 'Quantity discount settings must be an object'
  }
  const { enabled, minQuantity, discountPercent } = quantityDiscount
  if (typeof enabled !== 'boolean') {
    return 'Quantity discount enabled must be true or false'
  }
  const minimum = Number(minQuantity)
  const percentage = Number(discountPercent)
  if (!Number.isInteger(minimum) || minimum < 2) {
    return 'Minimum quantity must be a whole number of at least 2'
  }
  if (
    !Number.isFinite(percentage) ||
    percentage < 0 ||
    percentage > 100
  ) {
    return 'Quantity discount percentage must be between 0 and 100'
  }
  if (enabled && percentage <= 0) {
    return 'Enabled quantity discount must be greater than 0%'
  }
  return null
}
// ============================================================
// NEWSLETTER PRODUCT ANNOUNCEMENT
// ============================================================
const sendNewProductAnnouncement = async product => {
  try {
    const subscribers = await Subscriber.find({
      isSubscribed: true
    })
      .select('email -_id')
      .lean()
    if (!subscribers.length) {
      console.log(
        '[Newsletter] No active subscribers found.'
      )
      return
    }
    const productImage =
      Array.isArray(product.images) &&
      product.images.length > 0
        ? product.images[0]
        : ''
    const clientUrl = (
      process.env.CLIENT_URL ||
      process.env.FRONTEND_URL ||
      ''
    ).replace(/\/+$/, '')
    const productUrl = clientUrl
      ? `${clientUrl}/product/${encodeURIComponent(
          product.slug || product._id
        )}`
      : '#'
    const productName =
      String(product.name || 'A new piece').trim()
    const productPrice = Number(product.price)
    const imageHtml = productImage
      ? `
        \<img
          src="${productImage}"
          alt="${productName}"
          style="
            display:block;
            width:100%;
            height:360px;
            object-fit:cover;
          "
        />
      `
      : ''
    const priceHtml =
      Number.isFinite(productPrice)
        ? `
          \<p
            style="
              margin:24px 0;
              font-family:Georgia,'Times New Roman',serif;
              font-size:22px;
              color:#292824;
            "
          \>
            ₹${productPrice.toLocaleString('en-IN')}
          \</p>
        `
        : ''
    const emailHtml = `
      \<div
        style="
          margin:0;
          padding:40px 20px;
          background:#f6f2eb;
          font-family:Arial,Helvetica,sans-serif;
          color:#292824;
        "
      \>
        \<div
          style="
            max-width:600px;
            margin:0 auto;
            background:#ffffff;
            border:1px solid #e8e1d7;
            border-radius:20px;
            overflow:hidden;
          "
        \>
          ${imageHtml}
          \<div
            style="
              padding:42px 34px;
              text-align:center;
            "
          \>
            \<div
              style="
                font-size:11px;
                letter-spacing:4px;
                text-transform:uppercase;
                color:#b84d32;
                font-weight:600;
              "
            \>
              Just arrived at XAAJ
            \</div>
            \<h1
              style="
                margin:16px 0 14px;
                font-family:Georgia,'Times New Roman',serif;
                font-size:34px;
                line-height:1.2;
                font-weight:400;
                color:#292824;
              "
            \>
              ${productName}
            \</h1>
            \<p
              style="
                margin:0 auto;
                max-width:470px;
                font-size:15px;
                line-height:1.8;
                color:#706d67;
              "
            \>
              A new piece has found its way into the
              XAAJ collection — thoughtfully chosen for
              everyday rituals and beautiful moments.
            \</p>
            ${priceHtml}
            \<a
              href="${productUrl}"
              style="
                display:inline-block;
                padding:14px 24px;
                background:#292824;
                color:#ffffff;
                text-decoration:none;
                border-radius:999px;
                font-size:13px;
                letter-spacing:.5px;
              "
            \>
              Discover the piece
            \</a>
            \<div
              style="
                margin:32px auto;
                width:70px;
                height:1px;
                background:#d8d0c5;
              "
            \>\</div>
            \<p
              style="
                margin:0;
                font-family:Georgia,'Times New Roman',serif;
                font-size:18px;
                color:#292824;
              "
            \>
              With warmth,\<br />
              \<span style="font-size:16px;">
                Team XAAJ
              \</span>
            \</p>
          \</div>
          \<div
            style="
              padding:20px 30px;
              text-align:center;
              background:#f8f5ef;
              border-top:1px solid #eee8df;
              font-size:12px;
              line-height:1.6;
              color:#8a857d;
            "
          \>
            You’re receiving this because you subscribed
            to XAAJ updates.
          \</div>
        \</div>
      \</div>
    `
    const results = await Promise.allSettled(
      subscribers.map(({ email }) =>
        sendEmail({
          to: email,
          subject: `New at XAAJ — ${productName}`,
          html: emailHtml
        })
      )
    )
    const failed = results.filter(
      result => result.status === 'rejected'
    ).length
    const successful =
      subscribers.length - failed
    if (failed > 0) {
      console.error(
        `[Newsletter] ${failed} product announcement email(s) failed.`
      )
    }
    console.log(
      `[Newsletter] Product announcement sent to ${successful}/${subscribers.length} subscriber(s).`
    )
  } catch (error) {
    console.error(
      '[Newsletter] Product announcement error:',
      error
    )
  }
}
// ============================================================
// GET ALL PRODUCTS
// LIVE REVIEW RATING + REVIEW COUNT
// ============================================================
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      search,
      category,
      minPrice,
      maxPrice,
      inStock,
      tag,
      subcategory,
      sort = 'newest'
    } = req.query
    const page = Math.max(
      1,
      Number(req.query.page) || 1
    )
    const limit = Math.min(
      48,
      Math.max(
        1,
        Number(req.query.limit) || 24
      )
    )
    const filter = {
      isActive: true
    }
    if (category) {
      filter.category = String(category).trim()
    }
    if (subcategory) {
      filter.subcategory =
        String(subcategory).trim()
    }
if (search) {
      filter.$text = {
        $search: String(search).trim()
      }
    }
    const min = Number(minPrice)
    const max = Number(maxPrice)
    if (
      minPrice !== undefined &&
      Number.isFinite(min)
    ) {
      filter.price = {
        ...(filter.price || {}),
        $gte: Math.max(0, min)
      }
    }
    if (
      maxPrice !== undefined &&
      Number.isFinite(max)
    ) {
      filter.price = {
        ...(filter.price || {}),
        $lte: Math.max(0, max)
      }
    }
    if (inStock === 'true') {
      filter.stock = {
        $gt: 0
      }
    }
    if (tag) {
      filter.tags = String(tag)
        .trim()
        .toLowerCase()
    }
    const sortMap = {
      newest: {
        createdAt: -1
      },
      price_low: {
        price: 1
      },
      price_high: {
        price: -1
      },
      rating: {
        rating: -1,
        createdAt: -1
      }
    }
    const skip = (page - 1) * limit
    const [products, total] = await Promise.all([
      Product
        .find(filter)
        .sort(
          sortMap[sort] || sortMap.newest
        )
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter)
    ])
    const productIds = products.map(
      product => product._id
    )
    let reviewStats = []
    if (productIds.length > 0) {
      reviewStats = await Review.aggregate([
        {
          $match: {
            product: {
              $in: productIds
            },
            $or: [
              {
                isActive: true
              },
              {
                isActive: {
                  $exists: false
                }
              }
            ]
          }
        },
        {
          $group: {
            _id: '$product',
            rating: {
              $avg: '$rating'
            },
            reviewCount: {
              $sum: 1
            }
          }
        }
      ])
    }
    const reviewStatsMap = new Map(
      reviewStats.map(stat => [
        String(stat._id),
        {
          rating: Number(
            Number(stat.rating || 0).toFixed(2)
          ),
          reviewCount: Number(
            stat.reviewCount || 0
          )
        }
      ])
    )
    const activeAutomaticOffers = await getActiveAutomaticOffers()

  const productsWithReviews = products.map(
      product => {
        const stats = reviewStatsMap.get(
          String(product._id)
        )
        return {
          ...product,
          offers: getProductOfferMetadata(product, activeAutomaticOffers),
          rating: stats
            ? stats.rating
            : Number(product.rating || 0),
          reviewCount: stats
            ? stats.reviewCount
            : Number(product.reviewCount || 0)
        }
      }
    )
    return res.json({
      success: true,
      data: productsWithReviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  })
)
// ============================================================
// GET SINGLE PRODUCT
// Supports slug and MongoDB ID
// LIVE REVIEW RATING + REVIEW COUNT
// ============================================================
router.get(
  '/:identifier',
  asyncHandler(async (req, res) => {
    const identifier =
      String(req.params.identifier).trim()
    let product = await Product.findOne({
      slug: identifier.toLowerCase(),
      isActive: true
    }).lean()
    if (
      !product &&
      /^[a-fA-F0-9]{24}$/.test(identifier)
    ) {
      product = await Product.findOne({
        _id: identifier,
        isActive: true
      }).lean()
    }
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      })
    }
    const reviewStats = await Review.aggregate([
      {
        $match: {
          product: product._id,
          $or: [
            {
              isActive: true
            },
            {
              isActive: {
                $exists: false
              }
            }
          ]
        }
      },
      {
        $group: {
          _id: '$product',
          rating: {
            $avg: '$rating'
          },
          reviewCount: {
            $sum: 1
          }
        }
      }
    ])
    const stats = reviewStats[0]
    const rating = stats
      ? Number(
          Number(stats.rating || 0).toFixed(2)
        )
      : Number(product.rating || 0)
    const reviewCount = stats
      ? Number(stats.reviewCount || 0)
      : Number(product.reviewCount || 0)
    product.rating = rating
    product.reviewCount = reviewCount
    const activeAutomaticOffers = await getActiveAutomaticOffers()
    return res.json({
      success: true,
      data: {
        ...product,
        offers: getProductOfferMetadata(product, activeAutomaticOffers)
      }
    })
  })
)
// ============================================================
// CREATE PRODUCT
// ADMIN ONLY
// ============================================================
router.post(
  '/',
  protect,
  adminOnly,
  validate(productSchema),
  asyncHandler(async (req, res) => {
    const productData = {
      ...req.validated.body
    }
    if (productData.quantityDiscount !== undefined) {
      const quantityDiscountError = validateQuantityDiscount(
        productData.quantityDiscount
      )
      if (quantityDiscountError) {
        return res.status(422).json({
          success: false,
          message: quantityDiscountError
        })
      }
    }
    const productCategory =
      String(productData.category || '').trim()
    const productSubcategory =
      String(productData.subcategory || '').trim()
    const allowedSubcategories =
      PRODUCT_SUBCATEGORIES[productCategory] || []
    if (
      productSubcategory &&
      !allowedSubcategories.includes(
        productSubcategory
      )
    ) {
      return res.status(422).json({
        success: false,
        message:
          `Invalid subcategory for ${productCategory}`
      })
    }
    productData.subcategory =
      productCategory === 'Dinnerware'
        ? ''
        : productSubcategory
if (productData.hsnCode !== undefined) {
      productData.hsnCode =
        String(productData.hsnCode).trim()
    }
    // ========================================================
    // PRICING
    // MRP + DISCOUNT => SELLING PRICE
    // ========================================================
    const mrp = Number(productData.mrp)
    const discountPercent = Number(
      productData.discountPercent ?? 0
    )
    if (!Number.isFinite(mrp) || mrp <= 0) {
      return res.status(422).json({
        success: false,
        message: 'MRP must be greater than 0'
      })
    }
    if (
      !Number.isFinite(discountPercent) ||
      discountPercent < 0 ||
      discountPercent > 100
    ) {
      return res.status(422).json({
        success: false,
        message:
          'Discount percentage must be between 0 and 100'
      })
    }
    productData.mrp = mrp
    productData.discountPercent =
      Math.round(discountPercent * 100) / 100
    productData.price =
      Math.round(
        mrp -
          (mrp * productData.discountPercent) / 100
      )
    productData.compareAtPrice = mrp
    productData.showDiscountPercent =
      productData.showDiscountPercent !== undefined
        ? Boolean(productData.showDiscountPercent)
        : true
    // ========================================================
    // IMAGES
    // ========================================================
    if (Array.isArray(productData.images)) {
      productData.images =
        productData.images
          .map(image => String(image).trim())
          .filter(Boolean)
    } else {
      productData.images = []
    }
    const product =
      await Product.create(productData)
    await sendNewProductAnnouncement(product)
    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    })
  })
)
// ============================================================
// UPDATE PRODUCT
// ADMIN ONLY
// ============================================================
router.patch(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    if (
      !/^[a-fA-F0-9]{24}$/.test(
        req.params.id
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      })
    }
    const product =
      await Product.findById(
        req.params.id
      )
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      })
    }
    const updateData = {
      ...req.body
    }
    if (updateData.quantityDiscount !== undefined) {
      const quantityDiscountError = validateQuantityDiscount(
        updateData.quantityDiscount
      )
      if (quantityDiscountError) {
        return res.status(422).json({
          success: false,
          message: quantityDiscountError
        })
      }
    }
    // --------------------------------------------------------
    // Category / Subcategory
    // --------------------------------------------------------
    if (updateData.category !== undefined) {
      updateData.category =
        String(updateData.category).trim()
      if (
        !PRODUCT_CATEGORIES.includes(
          updateData.category
        )
      ) {
        return res.status(422).json({
          success: false,
          message: 'Invalid product category'
        })
      }
    }
    const finalCategory =
      updateData.category !== undefined
        ? updateData.category
        : product.category
    if (updateData.subcategory !== undefined) {
      const subcategory =
        updateData.subcategory === null
          ? ''
          : String(
              updateData.subcategory
            ).trim()
      const allowedSubcategories =
        PRODUCT_SUBCATEGORIES[finalCategory] || []
      if (
        subcategory &&
        !allowedSubcategories.includes(
          subcategory
        )
      ) {
        return res.status(422).json({
          success: false,
          message:
            `Invalid subcategory for ${finalCategory}`
        })
      }
      updateData.subcategory =
        finalCategory === 'Dinnerware'
          ? ''
          : subcategory
    } else if (
      finalCategory === 'Dinnerware'
    ) {
      updateData.subcategory = ''
    }
    // HSN code
    // --------------------------------------------------------
    if (updateData.hsnCode !== undefined) {
      updateData.hsnCode =
        String(updateData.hsnCode).trim()
      if (!HSN_REGEX.test(updateData.hsnCode)) {
        return res.status(422).json({
          success: false,
          message:
            'HSN code must contain 4, 6, or 8 digits'
        })
      }
    }
    // --------------------------------------------------------
    // Protected fields
    // --------------------------------------------------------
    delete updateData._id
    delete updateData.createdAt
    delete updateData.updatedAt
    // --------------------------------------------------------
    // MRP
    // --------------------------------------------------------
    if (updateData.mrp !== undefined) {
      updateData.mrp =
        Number(updateData.mrp)
      if (
        !Number.isFinite(updateData.mrp) ||
        updateData.mrp <= 0
      ) {
        return res.status(422).json({
          success: false,
          message:
            'MRP must be greater than 0'
        })
      }
    }
    // --------------------------------------------------------
    // DISCOUNT
    // --------------------------------------------------------
    if (
      updateData.discountPercent !== undefined
    ) {
      updateData.discountPercent =
        Number(
          updateData.discountPercent
        )
      if (
        !Number.isFinite(
          updateData.discountPercent
        ) ||
        updateData.discountPercent < 0 ||
        updateData.discountPercent > 100
      ) {
        return res.status(422).json({
          success: false,
          message:
            'Discount percentage must be between 0 and 100'
        })
      }
      updateData.discountPercent =
        Math.round(
          updateData.discountPercent * 100
        ) / 100
    }
    // --------------------------------------------------------
    // SHOW DISCOUNT %
    // --------------------------------------------------------
    if (
      updateData.showDiscountPercent !== undefined
    ) {
      if (
        typeof updateData.showDiscountPercent !==
        'boolean'
      ) {
        return res.status(422).json({
          success: false,
          message:
            'showDiscountPercent must be true or false'
        })
      }
    }
    // --------------------------------------------------------
    // FINAL PRICING
    // --------------------------------------------------------
    const finalMrp =
      updateData.mrp !== undefined
        ? updateData.mrp
        : Number(product.mrp)
    const finalDiscount =
      updateData.discountPercent !== undefined
        ? updateData.discountPercent
        : Number(product.discountPercent ?? 0)
    // If MRP or discount changes,
    // calculate selling price automatically.
    if (
      updateData.mrp !== undefined ||
      updateData.discountPercent !== undefined
    ) {
      updateData.price =
        Math.round(
          finalMrp -
            (finalMrp * finalDiscount) / 100
        )
    }
    // Backward compatibility:
    // If old frontend sends only price,
    // still allow it.
    else if (
      updateData.price !== undefined
    ) {
      updateData.price =
        Number(updateData.price)
      if (
        !Number.isFinite(updateData.price) ||
        updateData.price < 0
      ) {
        return res.status(422).json({
          success: false,
          message:
            'Invalid selling price'
        })
      }
    }
    const finalPrice =
      updateData.price !== undefined
        ? updateData.price
        : Number(product.price)
    if (finalPrice > finalMrp) {
      return res.status(422).json({
        success: false,
        message:
          'Selling price cannot be higher than MRP'
      })
    }
    if (
      updateData.mrp !== undefined ||
      updateData.discountPercent !== undefined
    ) {
      updateData.compareAtPrice =
        finalMrp
    }
    // --------------------------------------------------------
    // STOCK
    // --------------------------------------------------------
    if (updateData.stock !== undefined) {
      updateData.stock =
        Number(updateData.stock)
      if (
        !Number.isInteger(updateData.stock) ||
        updateData.stock < 0
      ) {
        return res.status(422).json({
          success: false,
          message:
            'Stock must be a valid whole number'
        })
      }
    }
    // --------------------------------------------------------
    // IMAGES
    // --------------------------------------------------------
    if (updateData.images !== undefined) {
      if (!Array.isArray(updateData.images)) {
        return res.status(422).json({
          success: false,
          message:
            'Images must be an array'
        })
      }
      updateData.images =
        updateData.images
          .map(image => String(image).trim())
          .filter(Boolean)
    }
    // --------------------------------------------------------
    // SAVE
    // --------------------------------------------------------
    Object.assign(
      product,
      updateData
    )
    await product.save()
    return res.json({
      success: true,
      message:
        'Product updated successfully',
      data: product
    })
  })
)
// ============================================================
// DELETE / ARCHIVE PRODUCT
// ADMIN ONLY
// ============================================================
router.delete(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    if (
      !/^[a-fA-F0-9]{24}$/.test(
        req.params.id
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      })
    }
    const product =
      await Product.findByIdAndUpdate(
        req.params.id,
        {
          isActive: false
        },
        {
          new: true
        }
      )
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      })
    }
    return res.json({
      success: true,
      message: 'Product archived'
    })
  })
)
// ============================================================
// EXPORT
// ============================================================
export default router