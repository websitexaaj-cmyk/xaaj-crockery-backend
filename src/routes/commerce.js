import { Router } from 'express'

import Product from '../models/Product.js'

import {
  Cart,
  Wishlist,
  Coupon,
  Contact
} from '../models/Commerce.js'

import { asyncHandler, protect } from '../middleware/index.js'

const router = Router()

// ============================================================
// CART
// ============================================================

// GET CART
router.get(
  '/cart',
  protect,
  asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({
      user: req.user.id
    }).populate('items.product')

    return res.json({
      success: true,
      data:
        cart || {
          user: req.user.id,
          items: []
        }
    })
  })
)

// UPDATE CART
router.put(
  '/cart',
  protect,
  asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body.items)
      ? req.body.items
      : []

    const ids = items
      .map(item => item.product)
      .filter(Boolean)

    const products = await Product.find({
      _id: {
        $in: ids
      },
      isActive: true
    })

    const valid = items
      .map(item => {
        const product = products.find(
          p =>
            p._id.toString() ===
            String(item.product)
        )

        if (!product) {
          return null
        }

        return {
          product: product._id,
          quantity: Math.max(
            1,
            Math.min(
              99,
              Number(item.quantity) || 1
            )
          )
        }
      })
      .filter(Boolean)

    const cart =
      await Cart.findOneAndUpdate(
        {
          user: req.user.id
        },
        {
          user: req.user.id,
          items: valid
        },
        {
          upsert: true,
          new: true
        }
      ).populate('items.product')

    return res.json({
      success: true,
      data: cart
    })
  })
)

// ============================================================
// WISHLIST
// ============================================================

// GET WISHLIST
router.get(
  '/wishlist',
  protect,
  asyncHandler(async (req, res) => {
    const list =
      await Wishlist.findOne({
        user: req.user.id
      }).populate('products')

    return res.json({
      success: true,
      data:
        list || {
          user: req.user.id,
          products: []
        }
    })
  })
)

// ADD PRODUCT TO WISHLIST
router.post(
  '/wishlist/:productId',
  protect,
  asyncHandler(async (req, res) => {
    const list =
      await Wishlist.findOneAndUpdate(
        {
          user: req.user.id
        },
        {
          $addToSet: {
            products: req.params.productId
          }
        },
        {
          upsert: true,
          new: true
        }
      ).populate('products')

    return res.json({
      success: true,
      data: list
    })
  })
)

// REMOVE PRODUCT FROM WISHLIST
router.delete(
  '/wishlist/:productId',
  protect,
  asyncHandler(async (req, res) => {
    const list =
      await Wishlist.findOneAndUpdate(
        {
          user: req.user.id
        },
        {
          $pull: {
            products: req.params.productId
          }
        },
        {
          new: true
        }
      ).populate('products')

    return res.json({
      success: true,
      data: list
    })
  })
)

// ============================================================
// CONTACT
// ============================================================

router.post(
  '/contact',
  asyncHandler(async (req, res) => {
    const contact =
      await Contact.create(req.body)

    return res.status(201).json({
      success: true,
      data: contact
    })
  })
)

// ============================================================
// COUPON VALIDATION
// ============================================================

router.post(
  '/coupons/validate',
  protect,
  asyncHandler(async (req, res) => {
    const coupon =
      await Coupon.findOne({
        code: String(
          req.body.code || ''
        ).toUpperCase(),
        isActive: true
      })

    if (
      !coupon ||
      (
        coupon.expiresAt &&
        coupon.expiresAt < new Date()
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Coupon is invalid or expired'
      })
    }

    return res.json({
      success: true,
      data: coupon
    })
  })
)

// ============================================================
// EXPORT
// ============================================================

export default router