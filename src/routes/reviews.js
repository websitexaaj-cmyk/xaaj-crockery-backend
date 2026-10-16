import express from 'express'
import mongoose from 'mongoose'

import Review from '../models/Reviews.js'
import Order from '../models/Order.js'
import Product from '../models/Product.js'

import { protect, asyncHandler } from '../middleware/index.js'

const router = express.Router()

// ============================================================
// ACTIVE REVIEW FILTER
// ============================================================
// Supports:
// 1. New reviews -> isActive: true
// 2. Old reviews -> isActive field missing
// 3. Disabled reviews -> isActive: false (excluded)
// ============================================================

const activeReviewFilter = {
  $or: [
    { isActive: true },
    { isActive: { $exists: false } }
  ]
}

// ============================================================
// SUBMIT PRODUCT REVIEW
// Only delivered orders can be reviewed
// ============================================================

router.post(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const userId = req.user?._id || req.user?.id

    const {
      orderId,
      productId,
      rating,
      comment = ''
    } = req.body

    // ----------------------------------------------------------
    // BASIC VALIDATION
    // ----------------------------------------------------------

    if (!orderId || !productId || rating === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Order ID, Product ID and rating are required.'
      })
    }

    if (
      !mongoose.Types.ObjectId.isValid(orderId) ||
      !mongoose.Types.ObjectId.isValid(productId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order or product ID.'
      })
    }

    const numericRating = Number(rating)

    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a whole number between 1 and 5.'
      })
    }

    if (String(comment).length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Review comment cannot exceed 1000 characters.'
      })
    }

    // ----------------------------------------------------------
    // FIND USER'S ORDER
    // ----------------------------------------------------------

    const order = await Order.findOne({
      _id: orderId,
      user: userId
    })

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      })
    }

    // ----------------------------------------------------------
    // REVIEW ONLY AFTER DELIVERY
    // ----------------------------------------------------------

    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message:
          'You can review a product only after the order is delivered.'
      })
    }

    // ----------------------------------------------------------
    // CHECK WHETHER PRODUCT WAS PART OF THIS ORDER
    // ----------------------------------------------------------

    const orderItem = order.items.find(
      item => String(item.product) === String(productId)
    )

    if (!orderItem) {
      return res.status(400).json({
        success: false,
        message: 'This product was not part of this order.'
      })
    }

    // ----------------------------------------------------------
    // CHECK IF ALREADY REVIEWED
    // ----------------------------------------------------------

    const existingReview = await Review.findOne({
      user: userId,
      order: orderId,
      product: productId
    })

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message:
          'You have already reviewed this product from this order.'
      })
    }

    // ----------------------------------------------------------
    // CHECK PRODUCT
    // ----------------------------------------------------------

    const product = await Product.findById(productId)

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.'
      })
    }

    // ----------------------------------------------------------
    // CREATE REVIEW
    // ----------------------------------------------------------

    let review

    try {
      review = await Review.create({
        user: userId,
        order: orderId,
        product: productId,
        rating: numericRating,
        comment: String(comment).trim(),
        isVerifiedPurchase: true,
        isActive: true
      })
    } catch (error) {
      // Handles duplicate review race condition
      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            'You have already reviewed this product from this order.'
        })
      }

      throw error
    }

    // ----------------------------------------------------------
    // MARK ORDER ITEM AS REVIEWED
    // ----------------------------------------------------------

    orderItem.reviewSubmitted = true
    orderItem.reviewId = review._id
    orderItem.reviewedAt = new Date()

    order.markModified('items')

    await order.save()

    // ----------------------------------------------------------
    // RECALCULATE PRODUCT RATING
    // ----------------------------------------------------------
    // Includes both:
    // - new reviews with isActive: true
    // - old reviews where isActive does not exist
    // ----------------------------------------------------------

    const ratingStats = await Review.aggregate([
      {
        $match: {
          product: product._id,
          $or: [
            { isActive: true },
            { isActive: { $exists: false } }
          ]
        }
      },
      {
        $group: {
          _id: '$product',
          averageRating: {
            $avg: '$rating'
          },
          reviewCount: {
            $sum: 1
          }
        }
      }
    ])

    const stats = ratingStats[0]

    const averageRating = stats
      ? Number(Number(stats.averageRating).toFixed(2))
      : 0

    const reviewCount = stats
      ? Number(stats.reviewCount)
      : 0

    // ----------------------------------------------------------
    // UPDATE PRODUCT RATING
    // ----------------------------------------------------------

    await Product.findByIdAndUpdate(
      product._id,
      {
        $set: {
          rating: averageRating,
          reviewCount
        }
      },
      {
        new: true
      }
    )

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully.',
      review: {
        _id: review._id,
        product: review.product,
        order: review.order,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt
      },
      productRating: averageRating,
      productReviewCount: reviewCount
    })
  })
)

// ============================================================
// GET REVIEWS FOR A PRODUCT
// Public route
// ============================================================

router.get(
  '/product/:productId',
  asyncHandler(async (req, res) => {
    const { productId } = req.params

    // ----------------------------------------------------------
    // VALIDATE PRODUCT ID
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID.'
      })
    }

    // ----------------------------------------------------------
    // FIND PRODUCT
    // ----------------------------------------------------------

    const product = await Product.findById(productId).select(
      'rating reviewCount'
    )

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.'
      })
    }

    // ----------------------------------------------------------
    // GET ACTIVE REVIEWS
    // Includes old reviews where isActive is missing
    // ----------------------------------------------------------

    const reviews = await Review.find({
      product: productId,
      $or: [
        { isActive: true },
        { isActive: { $exists: false } }
      ]
    })
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .select(
        'user rating comment isVerifiedPurchase createdAt'
      )
      .lean()

    // ----------------------------------------------------------
    // CALCULATE LIVE RATING
    // ----------------------------------------------------------
    // This prevents stale product.rating/reviewCount values.
    // ----------------------------------------------------------

    const ratingStats = await Review.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(productId),
          $or: [
            { isActive: true },
            { isActive: { $exists: false } }
          ]
        }
      },
      {
        $group: {
          _id: '$product',
          averageRating: {
            $avg: '$rating'
          },
          reviewCount: {
            $sum: 1
          }
        }
      }
    ])

    const stats = ratingStats[0]

    const rating = stats
      ? Number(Number(stats.averageRating).toFixed(2))
      : 0

    const reviewCount = stats
      ? Number(stats.reviewCount)
      : 0

    return res.json({
      success: true,
      rating,
      reviewCount,
      reviews
    })
  })
)

// ============================================================
// GET REVIEWS OF A PARTICULAR ORDER
// Used by My Orders page
// ============================================================

router.get(
  '/order/:orderId',
  protect,
  asyncHandler(async (req, res) => {
    const userId = req.user?._id || req.user?.id
    const { orderId } = req.params

    // ----------------------------------------------------------
    // VALIDATE ORDER ID
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID.'
      })
    }

    // ----------------------------------------------------------
    // FIND USER'S ORDER
    // ----------------------------------------------------------

    const order = await Order.findOne({
      _id: orderId,
      user: userId
    }).select('status items')

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      })
    }

    // ----------------------------------------------------------
    // GET REVIEWS
    // Includes old reviews where isActive is missing
    // ----------------------------------------------------------

    const reviews = await Review.find({
      user: userId,
      order: orderId,
      $or: [
        { isActive: true },
        { isActive: { $exists: false } }
      ]
    })
      .select(
        'product rating comment createdAt'
      )
      .lean()

    // ----------------------------------------------------------
    // CREATE REVIEW MAP
    // ----------------------------------------------------------

    const reviewMap = new Map(
      reviews.map(review => [
        String(review.product),
        review
      ])
    )

    // ----------------------------------------------------------
    // BUILD ORDER ITEMS
    // ----------------------------------------------------------

    const items = order.items.map(item => {
      const review = reviewMap.get(
        String(item.product)
      )

      return {
        product: item.product,
        name: item.name,
        image: item.image,
        quantity: item.quantity,

        canReview:
          order.status === 'delivered' &&
          !item.reviewSubmitted,

        reviewSubmitted:
          Boolean(item.reviewSubmitted),

        review: review || null
      }
    })

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.json({
      success: true,
      orderStatus: order.status,
      items
    })
  })
)

export default router