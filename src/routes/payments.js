import { Router } from 'express'

import mongoose from 'mongoose'

import Order from '../models/Order.js'

import Product from '../models/Product.js'
import Offer from '../models/Offer.js'

import User from '../models/User.js'

import {
  asyncHandler,
  protect
} from '../middleware/index.js'

import {
  razorpay,
  verifyRazorpaySignature,
  sendEmail
} from '../services/integrations.js'

import {
  scheduleVelocityShipmentRetry
} from '../services/velocityShipmentRetry.js'


const router = Router()

const CUSTOMER_CARE_EMAIL = 'customercare@xaaj.in'
const CUSTOMER_CARE_PHONE = '+91 9899446117'


// Calculate the best eligible automatic offer from database-backed rules.
// Kept in this file so payments.js does not require an extra helper module.
const calculateAutomaticOfferDiscount = (items, offers, now = new Date()) => {
  const normalizedItems = (items || []).map(item => ({
    id: String(item.product?._id || item.product || ''),
    quantity: Math.max(1, Number(item.quantity || 1)),
    price: Math.max(0, Number(item.price || 0))
  }))
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const activeOffers = (offers || []).filter(offer => {
    if (!offer || offer.enabled !== true || offer.type === 'coupon') return false
    if (offer.startDate && new Date(offer.startDate) > now) return false
    if (offer.endDate && new Date(offer.endDate) < now) return false
    return subtotal >= Number(offer.minimumPurchase || 0)
  })
  const candidates = []
  for (const offer of activeOffers) {
    let eligibleSubtotal = 0
    if (offer.type === 'site-wide') {
      eligibleSubtotal = subtotal
    } else if (offer.type === 'product-wise') {
      const selectedIds = new Set((offer.productIds || []).map(value => String(value?._id || value)))
      eligibleSubtotal = normalizedItems
        .filter(item => selectedIds.has(item.id))
        .reduce((sum, item) => sum + item.price * item.quantity, 0)
    } else if (offer.type === 'bundle') {
      const bundleIds = [...new Set((offer.bundleProductIds || []).map(value => String(value?._id || value)))]
      if (bundleIds.length < 2) continue
      const cartIds = new Set(normalizedItems.map(item => item.id))
      if (!bundleIds.every(id => cartIds.has(id))) continue
      const bundleQuantity = normalizedItems
        .filter(item => bundleIds.includes(item.id))
        .reduce((sum, item) => sum + item.quantity, 0)
      if (bundleQuantity < Math.max(1, Number(offer.minimumQuantity || 0))) continue
      eligibleSubtotal = normalizedItems
        .filter(item => bundleIds.includes(item.id))
        .reduce((sum, item) => sum + item.price * item.quantity, 0)
    }
    if (eligibleSubtotal <= 0) continue
    const value = Math.max(0, Number(offer.discountValue || 0))
    const rawDiscount = offer.discountType === 'percentage'
      ? eligibleSubtotal * value / 100
      : value
    const offerDiscount = Math.min(eligibleSubtotal, Math.max(0, Math.round(rawDiscount)))
    if (offerDiscount > 0) candidates.push({ offer, discount: offerDiscount })
  }
  candidates.sort((a, b) => b.discount - a.discount)
  const best = candidates[0]
  return {
    discount: best ? Math.min(subtotal, best.discount) : 0,
    appliedOffer: best ? {
      offerId: best.offer._id,
      type: best.offer.type,
      title: best.offer.title,
      discount: Math.min(subtotal, best.discount)
    } : null
  }
}


// ============================================================
// CREATE RAZORPAY ORDER
// ============================================================

router.post(

  '/create-order',

  protect,

  asyncHandler(async (req, res) => {

    // --------------------------------------------------------
    // Razorpay configuration
    // --------------------------------------------------------

    if (!razorpay) {

      return res.status(503).json({

        success: false,

        message: 'Razorpay is not configured'

      })

    }


    // --------------------------------------------------------
    // PAYMENT METHOD
    // --------------------------------------------------------

    const paymentMethod =

      String(

        req.body.paymentMethod ||

        'razorpay'

      )

        .trim()

        .toLowerCase()


    if (paymentMethod === 'cod') {

      return res.status(400).json({

        success: false,

        message:
          'COD orders must be created through the order checkout flow.'

      })

    }


    if (

      paymentMethod !== 'razorpay'

    ) {

      return res.status(400).json({

        success: false,

        message: 'Invalid payment method'

      })

    }


    // --------------------------------------------------------
    // Cart items
    // --------------------------------------------------------

    const incoming =

      Array.isArray(req.body.items)

        ? req.body.items

        : []


    if (!incoming.length) {

      return res.status(400).json({

        success: false,

        message: 'Cart is empty'

      })

    }


    // --------------------------------------------------------
    // Product IDs
    // --------------------------------------------------------

    const productIds =

      incoming

        .map(item => item.product)

        .filter(Boolean)


    const products =

      await Product.find({

        _id: {

          $in: productIds

        },

        isActive: true

      })


    if (!products.length) {

      return res.status(400).json({

        success: false,

        message: 'No valid products found'

      })

    }


    // --------------------------------------------------------
    // Secure order items
    // --------------------------------------------------------

    const items =

      incoming

        .map(item => {

          const product =

            products.find(

              p =>

                p._id.toString() ===

                String(item.product)

            )


          if (!product) {

            return null

          }


          const quantity =

            Math.max(

              1,

              Number(item.quantity) || 1

            )


          // --------------------------------------------------
          // Stock validation
          // --------------------------------------------------

          if (

            product.stock <= 0

          ) {

            throw Object.assign(

              new Error(

                `${product.name} is out of stock`

              ),

              {

                statusCode: 400

              }

            )

          }


          if (

            quantity >

            product.stock

          ) {

            throw Object.assign(

              new Error(

                `${product.name} has only ${product.stock} item(s) available`

              ),

              {

                statusCode: 400

              }

            )

          }


          return {

            product:

              product._id,

            name:

              product.name,

            image:

              product.images?.[0] || '',

            price:

              product.price,

            quantity

          }

        })

        .filter(Boolean)


    if (!items.length) {

      return res.status(400).json({

        success: false,

        message: 'No valid products found'

      })

    }


    // ========================================================
    // CALCULATE SUBTOTAL
    // ========================================================

    const subtotal =

      items.reduce(

        (sum, item) =>

          sum +

          item.price *

            item.quantity,

        0

      )


    // ========================================================
    // COUPON DISCOUNT (server-calculated)
    // The browser may send a couponCode, but never sends a
    // discount amount that the backend trusts.
    // ========================================================

    let discount = 0
    let appliedCoupon = null
    const now = new Date()

    // Apply the best eligible automatic offer (site-wide, product-wise, or bundle).
    // Prices and offer rules are read from the database, never trusted from the client.
    const activeAutomaticOffers = await Offer.find({
      type: { $in: ['site-wide', 'product-wise', 'bundle'] },
      enabled: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
      ]
    })

    const automaticOfferResult = calculateAutomaticOfferDiscount(items, activeAutomaticOffers, now)
    discount = Math.min(subtotal, Math.max(0, Number(automaticOfferResult.discount || 0)))

    const couponCode = String(req.body.couponCode || '').trim().toUpperCase()

    if (couponCode) {
      const couponEligibleSubtotal = Math.max(0, subtotal - discount)
      const coupon = await Offer.findOne({
        type: 'coupon',
        couponCode,
        enabled: true,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
        ]
      })

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: 'This coupon is invalid, expired, or currently unavailable.'
        })
      }

      if (coupon.usageLimit != null && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) {
        return res.status(400).json({
          success: false,
          message: 'This coupon has reached its usage limit.'
        })
      }

      if (subtotal < Number(coupon.minimumPurchase || 0)) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ₹${Number(coupon.minimumPurchase || 0).toLocaleString('en-IN')} is required for this coupon.`
        })
      }

      const rawDiscount = coupon.discountType === 'percentage'
        ? couponEligibleSubtotal * Number(coupon.discountValue || 0) / 100
        : Number(coupon.discountValue || 0)

      const couponDiscount = Math.min(couponEligibleSubtotal, Math.max(0, Math.round(rawDiscount)))
      discount = Math.min(subtotal, discount + couponDiscount)
      appliedCoupon = {
        offerId: coupon._id,
        code: coupon.couponCode,
        title: coupon.title,
        discount: couponDiscount
      }
    }


    // ========================================================
    // SHIPPING FEE
    // ========================================================

    const shippingFee =

      subtotal >= 1000

        ? 0

        : 99


    // ========================================================
    // FINAL TOTAL
    // ========================================================

    const total =

      subtotal -

      discount +

      shippingFee


    // ========================================================
    // SHIPPING ADDRESS
    // ========================================================

    let shippingAddress =

      req.body.shippingAddress


    // --------------------------------------------------------
    // If checkout doesn't send address,
    // use user's saved registration address.
    // --------------------------------------------------------

    if (

      !shippingAddress ||

      typeof shippingAddress !== 'object'

    ) {

      const user =

        await User.findById(

          req.user.id

        )


      const savedAddress =

        user?.addresses?.[0]


      if (savedAddress) {

        shippingAddress = {

          name:

            savedAddress.name || '',

          email:

            user.email || '',

          phone:

            savedAddress.phone || '',

          address:

            [

              savedAddress.line1,

              savedAddress.line2

            ]

              .filter(Boolean)

              .join(', '),

          city:

            savedAddress.city || '',

          state:

            savedAddress.state || '',

          pin:

            savedAddress.postalCode || ''

        }

      }

    }


    // --------------------------------------------------------
    // Create immutable order address snapshot
    // --------------------------------------------------------

    shippingAddress = {

      name:

        String(

          shippingAddress?.name || ''

        ).trim(),

      email:

        String(

          shippingAddress?.email || ''

        )

          .trim()

          .toLowerCase(),

      phone:

        String(

          shippingAddress?.phone || ''

        ).trim(),

      address:

        String(

          shippingAddress?.address || ''

        ).trim(),

      city:

        String(

          shippingAddress?.city || ''

        ).trim(),

      state:

        String(

          shippingAddress?.state || ''

        ).trim(),

      pin:

        String(

          shippingAddress?.pin || ''

        ).trim()

    }


    // ========================================================
    // SHIPPING VALIDATION
    // ========================================================

    if (

      !shippingAddress.name ||

      !shippingAddress.email ||

      !shippingAddress.phone ||

      !shippingAddress.address ||

      !shippingAddress.city ||

      !shippingAddress.state ||

      !/^\d{6}$/.test(

        shippingAddress.pin

      )

    ) {

      return res.status(400).json({

        success: false,

        message:
          'Please provide complete and valid shipping details'

      })

    }


    // ========================================================
    // CREATE RAZORPAY ORDER
    // ========================================================

    const razorpayOrder =

      await razorpay.orders.create({

        amount:

          Math.round(

            total * 100

          ),

        currency:

          'INR',

        receipt:

          `xaaj_${req.user.id}_${Date.now()}`

      })


    // ========================================================
    // CREATE MONGODB ORDER
    // ========================================================

    const order =

      await Order.create({

        user:

          req.user.id,

        items,

        shippingAddress,

        subtotal,

        discount,

        appliedCoupon,

        couponCode: appliedCoupon?.code || '',

        shippingFee,

        total,

        status:

          'pending',

        paymentStatus:

          'pending',

        paymentProvider:

          'razorpay',

        razorpayOrderId:

          razorpayOrder.id

      })


    // ========================================================
    // RESPONSE
    // ========================================================

    res.status(201).json({

      success: true,

      data: {

        id:

          razorpayOrder.id,

        amount:

          razorpayOrder.amount,

        currency:

          razorpayOrder.currency,

        keyId:

          process.env.RAZORPAY_KEY_ID,

        orderId:

          order._id

      }

    })

  })

)


// ============================================================
// VERIFY RAZORPAY PAYMENT
// ============================================================

router.post(

  '/verify',

  protect,

  asyncHandler(async (req, res) => {

    const {

      razorpay_order_id:

        orderId,

      razorpay_payment_id:

        paymentId,

      razorpay_signature:

        signature

    } = req.body


    // --------------------------------------------------------
    // Validate Razorpay response
    // --------------------------------------------------------

    if (

      !orderId ||

      !paymentId ||

      !signature

    ) {

      return res.status(400).json({

        success: false,

        message:

          'Incomplete payment details'

      })

    }


    // ========================================================
    // VERIFY SIGNATURE
    // ========================================================

    const valid =

      verifyRazorpaySignature(

        orderId,

        paymentId,

        signature

      )


    if (!valid) {

      return res.status(400).json({

        success: false,

        message:

          'Payment verification failed'

      })

    }


    // ========================================================
    // DATABASE TRANSACTION
    // ========================================================

    const session =

      await mongoose.startSession()


    let order = null
    let wasAlreadyPaid = false


    try {

      await session.withTransaction(

        async () => {

          // --------------------------------------------------
          // Find user's order
          // --------------------------------------------------

          order =

            await Order.findOne({

              user:

                req.user.id,

              razorpayOrderId:

                orderId

            }).session(

              session

            )


          if (!order) {

            throw Object.assign(

              new Error(

                'Order not found'

              ),

              {

                statusCode: 404

              }

            )

          }


          // --------------------------------------------------
          // Never verify COD order through Razorpay.
          // --------------------------------------------------

          if (

            order.paymentProvider !==

            'razorpay'

          ) {

            throw Object.assign(

              new Error(

                'This order is not a Razorpay order'

              ),

              {

                statusCode: 400

              }

            )

          }


          // --------------------------------------------------
          // Already paid
          // --------------------------------------------------

          if (

            order.paymentStatus ===

            'paid'

          ) {

            wasAlreadyPaid = true

            return

          }


          // ==================================================
          // CHECK ALL STOCK FIRST
          // ==================================================

          for (

            const item of order.items

          ) {

            const product =

              await Product.findOne({

                _id:

                  item.product,

                isActive:

                  true

              }).session(

                session

              )


            if (!product) {

              throw Object.assign(

                new Error(

                  `${item.name} is no longer available`

                ),

                {

                  statusCode: 400

                }

              )

            }


            if (

              product.stock <

              item.quantity

            ) {

              throw Object.assign(

                new Error(

                  `${item.name} is out of stock or does not have enough stock`

                ),

                {

                  statusCode: 400

                }

              )

            }

          }


          // ==================================================
          // DECREASE STOCK
          // ==================================================

          for (

            const item of order.items

          ) {

            const updatedProduct =

              await Product.findOneAndUpdate(

                {

                  _id:

                    item.product,

                  isActive:

                    true,

                  stock: {

                    $gte:

                      item.quantity

                  }

                },

                {

                  $inc: {

                    stock:

                      -item.quantity

                  }

                },

                {

                  new:

                    true,

                  session

                }

              )


            if (!updatedProduct) {

              throw Object.assign(

                new Error(

                  `${item.name} is no longer available in the requested quantity`

                ),

                {

                  statusCode: 400

                }

              )

            }

          }


          // ==================================================
          // COUNT COUPON USAGE ONLY AFTER VERIFIED PAYMENT
          // ==================================================
          // This runs inside the same MongoDB transaction as the
          // stock and payment updates. Already-paid orders return
          // above, so retries do not increment usage twice.
          if (order.appliedCoupon?.offerId) {
            const couponFilter = {
              _id: order.appliedCoupon.offerId,
              type: 'coupon'
            }

            // Enforce usageLimit atomically when one is configured.
            const coupon = await Offer.findById(
              order.appliedCoupon.offerId
            ).session(session)

            if (!coupon) {
              throw Object.assign(
                new Error('The applied coupon could not be found.'),
                { statusCode: 409 }
              )
            }

            if (coupon.usageLimit != null) {
              couponFilter.$or = [
                { usedCount: { $lt: Number(coupon.usageLimit) } },
                { usedCount: { $exists: false } }
              ]
            }

            const updatedCoupon = await Offer.findOneAndUpdate(
              couponFilter,
              { $inc: { usedCount: 1 } },
              { new: true, session }
            )

            if (!updatedCoupon) {
              throw Object.assign(
                new Error('This coupon has reached its usage limit. Please contact customer care before retrying payment.'),
                { statusCode: 409 }
              )
            }
          }

          // ==================================================
          // UPDATE PAYMENT
          // ==================================================

          order.paymentStatus =

            'paid'


          order.paymentProvider =

            'razorpay'


          order.paymentReference =

            paymentId


          order.razorpayPaymentId =

            paymentId


          order.status =

            'confirmed'


          await order.save({

            session

          })

        }

      )

    } finally {

      await session.endSession()

    }


    // ========================================================
    // GET UPDATED ORDER
    // ========================================================

    order =

      await Order.findById(

        order._id

      ).populate(

        'user',

        'name email'

      )


    // ========================================================
    // CREATE VELOCITY PREPAID SHIPMENT
    // ========================================================

    let velocityShipmentCreated = false


    try {

      const velocityConfigured =

        Boolean(

          process.env.VELOCITY_WAREHOUSE_ID &&

          process.env.VELOCITY_STORE_NAME

        )


      if (!velocityConfigured) {

        console.warn(

          '[VELOCITY] Prepaid shipment skipped: Velocity configuration missing'

        )

      } else if (

        order.paymentStatus === 'paid' &&

        order.status === 'confirmed'

      ) {

        // ----------------------------------------------------
        // DUPLICATE PROTECTION
        // ----------------------------------------------------

        if (

          order.velocityShipmentId ||

          order.velocityAwb ||

          order.velocityOrderId

        ) {

          console.log(

            `[VELOCITY] Shipment already exists for order ${order._id}`

          )


          velocityShipmentCreated = true

        } else {

          // --------------------------------------------------
          // START VELOCITY PREPAID SHIPMENT
          // --------------------------------------------------
          //
          // Payment is already successful.
          //
          // If Velocity fails, retry service will retry
          // automatically.
          //
          // Customer DOES NOT need to pay again.
          // --------------------------------------------------

          await scheduleVelocityShipmentRetry(

            order._id

          )


          // --------------------------------------------------
          // Reload order because retry service may have
          // created and saved the shipment details.
          // --------------------------------------------------

          order =

            await Order.findById(

              order._id

            ).populate(

              'user',

              'name email'

            )


          velocityShipmentCreated = Boolean(

            order?.velocityShipmentId ||

            order?.velocityAwb ||

            order?.velocityOrderId

          )

        }

      }

    } catch (velocityError) {

      console.error(

        '[VELOCITY] PREPAID shipment scheduling failed:',

        {

          orderId:

            order?._id,

          message:

            velocityError?.message,

          response:

            velocityError?.velocityResponse

        }

      )

    }


    // ========================================================
    // PAYMENT CONFIRMATION EMAIL
    // Use the same XAAJ template as COD, only after Razorpay
    // signature and database payment verification succeed.
    // ========================================================

    const customerEmail =
      order.shippingAddress?.email ||
      order.user?.email

    const customerName =
      order.shippingAddress?.name ||
      order.user?.name ||
      'Customer'

    const orderNumber = String(order._id).slice(-8).toUpperCase()

    // Escape dynamic values before inserting them into HTML.
    const escapeHtml = value =>
      String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character])

    const productRows = (order.items || []).map(item => `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #eee;">
          ${escapeHtml(item.name || 'Product')}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:center;">
          ${Number(item.quantity || 0)}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
          ₹${(Number(item.price || 0) * Number(item.quantity || 0)).toLocaleString('en-IN')}
        </td>
      </tr>
    `).join('')

    const address = order.shippingAddress || {}

    if (customerEmail && !wasAlreadyPaid) {
      try {
        await sendEmail({
          to: customerEmail,
          subject: `XAAJ - Your Order Has Been Successfully Placed (#${orderNumber})`,
          html: `
            <!doctype html>
            <html lang="en">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your XAAJ order is confirmed</title></head>
            <body style="margin:0;padding:0;background:#f7f4ef;font-family:Arial,Helvetica,sans-serif;color:#39352f;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f4ef;"><tr><td align="center" style="padding:28px 12px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;">
                  <tr><td align="center" style="padding:30px 24px 24px;border-bottom:1px solid #e8e0d6;">
                    <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;letter-spacing:8px;line-height:1.2;">XAAJ</div>
                    <div style="font-size:10px;letter-spacing:3px;color:#8b6252;margin-top:8px;">STORIES CRAFTED IN EARTH</div>
                  </td></tr>
                  <tr><td align="center" style="padding:38px 32px 14px;">
                    <div style="font-size:11px;letter-spacing:2.5px;color:#9a6550;text-transform:uppercase;">Order confirmed</div>
                    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:normal;line-height:1.25;color:#39352f;margin:14px 0 12px;">A Little Beauty Is on Its Way!</h1>
                    <p style="font-size:15px;line-height:1.8;color:#625c54;margin:0;">Dear ${escapeHtml(customerName)},</p>
                    <p style="font-size:15px;line-height:1.8;color:#625c54;margin:12px 0 0;">Thank you for choosing XAAJ. We're delighted to be a part of your home.</p>
                    <p style="font-size:15px;line-height:1.8;color:#625c54;margin:12px 0 0;">Your order <strong style="color:#39352f;">#${escapeHtml(orderNumber)}</strong> is confirmed, and we're getting your thoughtfully chosen pieces ready for their journey to you.</p>
                    <p style="font-size:14px;line-height:1.8;color:#625c54;margin:12px 0 0;">Your Razorpay payment has been successfully verified.</p>
                  </td></tr>
                  <tr><td style="padding:22px 32px 8px;">
                    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:normal;color:#39352f;margin:0 0 16px;">Your order summary</h2>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;line-height:1.6;color:#625c54;border-collapse:collapse;">
                      <tr style="background:#f7f4ef;"><th align="left" style="padding:10px 8px;font-weight:normal;">Product</th><th align="center" style="padding:10px 8px;font-weight:normal;">Qty</th><th align="right" style="padding:10px 8px;font-weight:normal;">Amount</th></tr>
                      <tbody>${productRows}</tbody>
                      <tr><td colspan="3" style="padding:10px 0;border-top:1px solid #eee7df;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;line-height:1.6;color:#625c54;">
                        <tr><td>Subtotal</td><td align="right">₹${Number(order.subtotal || 0).toLocaleString('en-IN')}</td></tr>
                        <tr><td style="padding-top:7px;">Discount</td><td align="right" style="padding-top:7px;">−₹${Number(order.discount || 0).toLocaleString('en-IN')}</td></tr>
                        <tr><td style="padding-top:7px;">Shipping</td><td align="right" style="padding-top:7px;">${Number(order.shippingFee || 0) === 0 ? 'FREE' : `₹${Number(order.shippingFee || 0).toLocaleString('en-IN')}`}</td></tr>
                        <tr><td style="padding-top:12px;font-size:16px;font-weight:bold;color:#39352f;border-top:1px solid #eee7df;">Total</td><td align="right" style="padding-top:12px;font-size:16px;font-weight:bold;color:#39352f;border-top:1px solid #eee7df;">₹${Number(order.total || 0).toLocaleString('en-IN')}</td></tr>
                      </table></td></tr>
                    </table>
                  </td></tr>
                  <tr><td align="center" style="padding:26px 32px 12px;">
                    <div style="display:inline-block;background:#8b5140;color:#ffffff;font-size:12px;letter-spacing:1.5px;padding:15px 28px;">ORDER #${escapeHtml(orderNumber)}</div>
                  </td></tr>
                  <tr><td style="padding:24px 32px 8px;">
                    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:normal;color:#39352f;margin:0 0 12px;">Delivery details</h2>
                    <div style="font-size:14px;line-height:1.8;color:#625c54;">${escapeHtml(address.name || customerName)}<br>${escapeHtml(address.address || '')}<br>${escapeHtml([address.city, address.state].filter(Boolean).join(', '))}${address.pin ? ` — ${escapeHtml(address.pin)}` : ''}<br>Phone: ${escapeHtml(address.phone || '')}</div>
                    <p style="font-size:14px;line-height:1.8;color:#625c54;margin:14px 0 0;">We'll notify you as soon as your order is dispatched, along with tracking details so you can follow its journey home.</p>
                  </td></tr>
                  <tr><td align="center" style="padding:30px 32px 34px;">
                    <p style="font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.5;color:#39352f;margin:0 0 8px;">Until then, let the anticipation begin.</p>
                    <p style="font-size:14px;line-height:1.8;color:#625c54;margin:0;">With warmth,<br><strong style="color:#39352f;">Team XAAJ</strong></p>
                    <div style="font-size:10px;letter-spacing:2px;color:#9a6550;margin-top:14px;">STORIES CRAFTED IN EARTH</div>
                  </td></tr>
                  <tr><td align="center" style="padding:22px 24px;background:#f3eee7;border-top:1px solid #e8e0d6;">
                    <div style="font-size:12px;letter-spacing:1.5px;color:#8b5140;">XAAJ · STORES CRAFTED IN EARTH</div>
                    <p style="font-size:12px;line-height:1.7;color:#756e65;margin:12px 0 0;">Questions about your order? Contact us at <a href="mailto:${CUSTOMER_CARE_EMAIL}" style="color:#8b5140;text-decoration:underline;">${CUSTOMER_CARE_EMAIL}</a> or ${CUSTOMER_CARE_PHONE}.</p>
                  </td></tr>
                </table>
              </td></tr></table>
            </body></html>
          `
        })
      } catch (emailError) {
        // Email failure must not undo a successfully verified payment/order.
        console.error('[EMAIL] Prepaid order confirmation failed:', emailError?.message || emailError)
      }
    }


    // ========================================================
    // RESPONSE
    // ========================================================

    res.json({

      success:

        true,

      message:

        velocityShipmentCreated

          ? 'Payment verified, order confirmed and Velocity shipment created successfully'

          : 'Payment verified and order confirmed. Velocity shipment is pending.',

      data:

        order

    })

  })

)


// ============================================================
// EXPORT
// ============================================================

export default router