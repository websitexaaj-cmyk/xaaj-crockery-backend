import { Router } from 'express'

import Product from '../models/Product.js'

import User from '../models/User.js'

import Order from '../models/Order.js'

import Offer from '../models/Offer.js'

import {

  asyncHandler,

  protect,

  adminOnly

} from '../middleware/index.js'

import { sendEmail } from '../services/integrations.js'

import {

  createForwardShipment,

  cancelVelocityShipments

} from '../services/velocity.js'

const router = Router()


// Calculate the best eligible automatic offer on the server.
// Kept in this file so no additional helper module is required.
const calculateAutomaticOfferDiscount = (items, offers, now = new Date()) => {
  const cartItems = (items || []).map(item => ({
    id: String(item.product?._id || item.product || ''),
    quantity: Math.max(1, Number(item.quantity || 1)),
    price: Math.max(0, Number(item.price || 0))
  }))
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const candidates = []

  for (const offer of offers || []) {
    if (!offer || offer.enabled !== true || offer.type === 'coupon') continue
    if (offer.startDate && new Date(offer.startDate) > now) continue
    if (offer.endDate && new Date(offer.endDate) < now) continue
    if (subtotal < Number(offer.minimumPurchase || 0)) continue

    let eligibleSubtotal = 0
    if (offer.type === 'site-wide') {
      eligibleSubtotal = subtotal
    } else if (offer.type === 'product-wise') {
      const selectedIds = new Set((offer.productIds || []).map(id => String(id?._id || id)))
      eligibleSubtotal = cartItems.filter(item => selectedIds.has(item.id))
        .reduce((sum, item) => sum + item.price * item.quantity, 0)
    } else if (offer.type === 'bundle') {
      const bundleIds = [...new Set((offer.bundleProductIds || []).map(id => String(id?._id || id)))]
      if (bundleIds.length < 2) continue
      const cartIds = new Set(cartItems.map(item => item.id))
      if (!bundleIds.every(id => cartIds.has(id))) continue
      const bundleQuantity = cartItems.filter(item => bundleIds.includes(item.id))
        .reduce((sum, item) => sum + item.quantity, 0)
      if (bundleQuantity < Math.max(1, Number(offer.minimumQuantity || 1))) continue
      eligibleSubtotal = cartItems.filter(item => bundleIds.includes(item.id))
        .reduce((sum, item) => sum + item.price * item.quantity, 0)
    } else continue

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
  return best ? {
    discount: Math.min(subtotal, best.discount),
    appliedOffer: {
      offerId: best.offer._id,
      type: best.offer.type,
      title: best.offer.title,
      discount: Math.min(subtotal, best.discount)
    }
  } : { discount: 0, appliedOffer: null }
}

const CUSTOMER_CARE_EMAIL = 'customercare@xaaj.in'

const CUSTOMER_CARE_PHONE = '+91 9899446117'

// Shared XAAJ premium order-confirmation email design (Shopify-inspired).
const buildXaaJOrderConfirmationEmail = ({ customerName, orderNumber, orderDate, productRows, subtotal, discount, shippingFee, total, paymentMethod, paymentStatus, shippingAddress, escapeHtml, formatMoney, paymentNote = '' }) => {
  const address = shippingAddress || {}
  const addressHtml = [address.address, [address.city, address.state].filter(Boolean).join(', '), address.pin ? `PIN: ${address.pin}` : '', address.phone ? `Phone: ${address.phone}` : ''].filter(Boolean).map(value => escapeHtml(value)).join('<br>')
  const money = value => formatMoney ? formatMoney(value) : `₹${Number(value || 0).toLocaleString('en-IN')}`
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f4ef;font-family:Arial,Helvetica,sans-serif;color:#39352f;"><tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;">
      <tr><td align="center" style="padding:30px 24px 24px;border-bottom:1px solid #e8e0d6;"><div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;letter-spacing:8px;line-height:1.2;">XAAJ</div><div style="font-size:10px;letter-spacing:3px;color:#8b6252;margin-top:8px;">STORIES CRAFTED IN EARTH</div></td></tr>
      <tr><td align="center" style="padding:38px 32px 14px;"><div style="font-size:11px;letter-spacing:2.5px;color:#9a6550;text-transform:uppercase;">Order confirmed</div><h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:normal;line-height:1.25;color:#39352f;margin:14px 0 12px;">A Little Beauty Is on Its Way!</h1><p style="font-size:15px;line-height:1.8;color:#625c54;margin:0;">Dear ${escapeHtml(customerName || 'XAAJ Customer')},</p><p style="font-size:15px;line-height:1.8;color:#625c54;margin:12px 0 0;">Thank you for choosing XAAJ. We're delighted to be a part of your home.</p><p style="font-size:15px;line-height:1.8;color:#625c54;margin:12px 0 0;">Your order <strong style="color:#39352f;">#${escapeHtml(orderNumber)}</strong> is confirmed, and we're getting your thoughtfully chosen pieces ready for their journey to you.</p></td></tr>
      <tr><td style="padding:22px 32px 8px;"><h2 style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:normal;color:#39352f;margin:0 0 16px;">Your order summary</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;line-height:1.6;color:#625c54;"><tr><td style="padding:12px 0;border-top:1px solid #eee7df;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;border-collapse:collapse;"><thead><tr style="background:#f7f4ef;"><th align="left" style="padding:10px 8px;">Product</th><th align="center" style="padding:10px 8px;">Qty</th><th align="right" style="padding:10px 8px;">Amount</th></tr></thead><tbody>${productRows}</tbody></table></td></tr><tr><td style="padding:10px 0;border-top:1px solid #eee7df;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td>Subtotal</td><td align="right">${money(subtotal)}</td></tr><tr><td style="padding-top:7px;">Discount</td><td align="right" style="padding-top:7px;">-${money(discount)}</td></tr><tr><td style="padding-top:7px;">Shipping</td><td align="right" style="padding-top:7px;">${Number(shippingFee) === 0 ? 'FREE' : money(shippingFee)}</td></tr><tr><td style="padding-top:12px;font-size:16px;font-weight:bold;color:#39352f;">Total</td><td align="right" style="padding-top:12px;font-size:16px;font-weight:bold;color:#39352f;">${money(total)}</td></tr></table></td></tr></table></td></tr>
      <tr><td align="center" style="padding:26px 32px 12px;"><a href="https://xaaj.in" style="display:inline-block;background:#8b5140;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:1.5px;padding:15px 28px;">VIEW YOUR ORDER</a></td></tr>
      <tr><td style="padding:24px 32px 8px;"><h2 style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:normal;color:#39352f;margin:0 0 12px;">Delivery details</h2><div style="font-size:14px;line-height:1.8;color:#625c54;"><strong>${escapeHtml(address.name || customerName || 'XAAJ Customer')}</strong><br>${addressHtml}</div><p style="font-size:14px;line-height:1.8;color:#625c54;margin:14px 0 0;">We'll notify you as soon as your order is dispatched, along with tracking details so you can follow its journey home.</p><div style="margin-top:16px;padding:14px;background:#f7f4ef;font-size:14px;line-height:1.8;color:#625c54;"><strong>Payment method:</strong> ${escapeHtml(paymentMethod)}<br><strong>Payment status:</strong> ${escapeHtml(paymentStatus)}${paymentNote ? `<br><strong>Payment ID:</strong> ${escapeHtml(paymentNote)}` : ''}</div></td></tr>
      <tr><td align="center" style="padding:30px 32px 34px;"><p style="font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.5;color:#39352f;margin:0 0 8px;">Until then, let the anticipation begin.</p><p style="font-size:14px;line-height:1.8;color:#625c54;margin:0;">With warmth,<br><strong style="color:#39352f;">Team XAAJ</strong></p><div style="font-size:10px;letter-spacing:2px;color:#9a6550;margin-top:14px;">STORIES CRAFTED IN EARTH</div></td></tr>
      <tr><td align="center" style="padding:22px 24px;background:#f3eee7;border-top:1px solid #e8e0d6;"><a href="https://xaaj.in" style="font-size:12px;letter-spacing:1.5px;color:#8b5140;text-decoration:none;">EXPLORE XAAJ</a><p style="font-size:12px;line-height:1.7;color:#756e65;margin:12px 0 0;">Questions about your order? Contact us at <a href="mailto:customercare@xaaj.in" style="color:#8b5140;text-decoration:underline;">customercare@xaaj.in</a> or +91 9899446117.</p><p style="font-size:11px;color:#948b80;margin:10px 0 0;">XAAJ · STORIES CRAFTED IN EARTH</p></td></tr>
    </table></td></tr></table>`
}


// ============================================================

// GET ALL ORDERS

// ============================================================

router.get(

  '/',

  protect,

  asyncHandler(async (req, res) => {

    const filter =

      req.user.role === 'admin' &&

      req.query.all === 'true'

        ? {}

        : {

            user: req.user.id

          }

    const orders = await Order.find(filter)

      .populate('user', 'name email')

      .sort({ createdAt: -1 })

    res.json({

      success: true,

      data: orders

    })

  })

)

// ============================================================

// GET SINGLE ORDER

// ============================================================

router.get(

  '/:id',

  protect,

  asyncHandler(async (req, res) => {

    const order = await Order.findOne({

      _id: req.params.id,

      ...(req.user.role === 'admin'

        ? {}

        : {

            user: req.user.id

          })

    }).populate('user', 'name email')

    if (!order) {

      return res.status(404).json({

        success: false,

        message: 'Order not found'

      })

    }

    res.json({

      success: true,

      data: order

    })

  })

)

// ============================================================

// CREATE ORDER

//

// Payment:

// razorpay

// cod

//

// Shipping:

// >= ₹1000 => FREE

// < ₹1000  => ₹99

// ============================================================

router.post(

  '/',

  protect,

  asyncHandler(async (req, res) => {

    // ========================================================

    // CART

    // ========================================================

    const incoming = Array.isArray(req.body.items)

      ? req.body.items

      : []

    if (!incoming.length) {

      return res.status(400).json({

        success: false,

        message: 'Cart is empty'

      })

    }

    // ========================================================

    // PRODUCT IDS

    // ========================================================

    const productIds = incoming

      .map(item => item.product)

      .filter(Boolean)

    if (!productIds.length) {

      return res.status(400).json({

        success: false,

        message: 'No valid products found'

      })

    }

    const products = await Product.find({

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

    // ========================================================

    // SECURE ORDER ITEMS

    // ========================================================

    const items = []

    const packageItems = []

    let discount = 0

    for (const incomingItem of incoming) {

      const product = products.find(

        p =>

          p._id.toString() ===

          String(incomingItem.product)

      )

      if (!product) {

        continue

      }

      const quantity = Math.max(

        1,

        Number(incomingItem.quantity) || 1

      )

      // ------------------------------------------------------

      // STOCK

      // ------------------------------------------------------

      if (quantity > product.stock) {

        const error = new Error(

          `${product.name} does not have enough stock`

        )

        error.statusCode = 400

        throw error

      }

      // ------------------------------------------------------

      // QUANTITY-BASED DISCOUNT
      // Calculate from product settings stored in MongoDB.
      // Never trust discount values sent by the frontend.

      // ------------------------------------------------------

      const quantityDiscount = product.quantityDiscount

      if (
        quantityDiscount?.enabled === true &&
        Number.isInteger(quantity) &&
        quantity >= Number(quantityDiscount.minQuantity) &&
        Number(quantityDiscount.discountPercent) > 0 &&
        Number(quantityDiscount.discountPercent) <= 100
      ) {
        const itemDiscount =
          (Number(product.price) *
            quantity *
            Number(quantityDiscount.discountPercent)) /
          100

        discount += Math.round(itemDiscount)
      }

      // ------------------------------------------------------

      // ORDER ITEM SNAPSHOT

      // ------------------------------------------------------

      items.push({

        product: product._id,

        name: product.name,

        image: product.images?.[0] || '',

        price: Number(product.price),

        quantity

      })

      // ------------------------------------------------------

      // VELOCITY SHIPPING DATA

      // ------------------------------------------------------

      packageItems.push({

        weight: Number(

          product.shipping?.weight || 0

        ),

        length: Number(

          product.shipping?.length || 0

        ),

        breadth: Number(

          product.shipping?.breadth || 0

        ),

        height: Number(

          product.shipping?.height || 0

        ),

        quantity

      })

    }

    if (!items.length) {

      return res.status(400).json({

        success: false,

        message: 'No valid products found'

      })

    }

    // ========================================================

    // SUBTOTAL

    // ========================================================

    const subtotal = items.reduce(

      (sum, item) =>

        sum +

        Number(item.price) *

          Number(item.quantity),

      0

    )

    // ========================================================
    // APPLY THE BEST AUTOMATIC OFFER (server-side validation)
    // Site-wide, product-wise and bundle offers apply to COD and
    // Razorpay because they are calculated before payment handling.
    // ========================================================
    const nowForOffers = new Date()
    const activeAutomaticOffers = await Offer.find({
      type: { $in: ['site-wide', 'product-wise', 'bundle'] },
      enabled: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: nowForOffers } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: nowForOffers } }] },
        { $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }, { usedCount: { $exists: false } }] }
      ]
    })
    const automaticOfferResult = calculateAutomaticOfferDiscount(items, activeAutomaticOffers, nowForOffers)
    const automaticOfferDiscount = Math.min(
      Math.max(0, subtotal - discount),
      Number(automaticOfferResult.discount || 0)
    )
    discount += automaticOfferDiscount
    const appliedAutomaticOffer = automaticOfferResult.appliedOffer
      ? { ...automaticOfferResult.appliedOffer, discount: automaticOfferDiscount }
      : null

    // ========================================================
    // APPLY COUPON OFFER (server-side validation)
    // The frontend sends only the code; price/discount are
    // recalculated from database prices here.
    // ========================================================

    const couponCode = String(req.body.couponCode || '').trim().toUpperCase()
    let appliedCoupon = null

    if (couponCode) {
      const now = new Date()
      const coupon = await Offer.findOne({
        type: 'coupon',
        couponCode,
        enabled: true,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
        ]
      })

      if (!coupon) {
        return res.status(400).json({ success: false, message: 'This coupon is invalid, inactive, or expired.' })
      }

      if (subtotal < Number(coupon.minimumPurchase || 0)) {
        return res.status(400).json({
          success: false,
          message: `This coupon requires a minimum cart value of ₹${Number(coupon.minimumPurchase || 0).toLocaleString('en-IN')}.`
        })
      }

      const eligibleSubtotal = Math.max(0, subtotal - discount)
      const requestedDiscount = coupon.discountType === 'percentage'
        ? eligibleSubtotal * Number(coupon.discountValue) / 100
        : Number(coupon.discountValue)
      const couponDiscount = Math.min(eligibleSubtotal, Math.max(0, Math.round(requestedDiscount)))

      discount += couponDiscount
      appliedCoupon = { offerId: coupon._id, code: coupon.couponCode, title: coupon.title, discount: couponDiscount }
    }

    // ========================================================

    // SHIPPING FEE

    //

    // ₹1000 or above = FREE

    // Below ₹1000 = ₹99

    // ========================================================

    const shippingFee =

      subtotal >= 1000

        ? 0

        : 99

    // ========================================================

    // DISCOUNT

    // Calculated above from each eligible product's saved settings.

    // ========================================================

    // ========================================================

    // TOTAL

    // ========================================================

    const total =

      subtotal -

      discount +

      shippingFee

    // ========================================================

    // PAYMENT METHOD

    // ========================================================

    const paymentMethod = String(

      req.body.paymentMethod ||

        'razorpay'

    )

      .trim()

      .toLowerCase()

    if (

      !['razorpay', 'cod'].includes(

        paymentMethod

      )

    ) {

      return res.status(400).json({

        success: false,

        message: 'Invalid payment method'

      })

    }

    // ========================================================

    // SHIPPING ADDRESS

    // ========================================================

    let shippingAddress =

      req.body.shippingAddress || null

    // If checkout didn't send address,

    // use first saved address.

    if (

      !shippingAddress ||

      typeof shippingAddress !== 'object'

    ) {

      const user = await User.findById(

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

          address: [

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

    // ========================================================

    // NORMALIZE ADDRESS

    // ========================================================

    shippingAddress = {

      name: String(

        shippingAddress?.name || ''

      ).trim(),

      email: String(

        shippingAddress?.email || ''

      )

        .trim()

        .toLowerCase(),

      phone: String(

        shippingAddress?.phone || ''

      ).trim(),

      address: String(

        shippingAddress?.address || ''

      ).trim(),

      city: String(

        shippingAddress?.city || ''

      ).trim(),

      state: String(

        shippingAddress?.state || ''

      ).trim(),

      pin: String(

        shippingAddress?.pin || ''

      ).trim()

    }

    // ========================================================

    // ADDRESS VALIDATION

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

    // VELOCITY PACKAGE

    // ========================================================

    const velocityPackage =

      packageItems.reduce(

        (acc, item) => {

          acc.weight +=

            item.weight *

            item.quantity

          acc.length = Math.max(

            acc.length,

            item.length

          )

          acc.breadth = Math.max(

            acc.breadth,

            item.breadth

          )

          acc.height = Math.max(

            acc.height,

            item.height

          )

          return acc

        },

        {

          weight: 0,

          length: 0,

          breadth: 0,

          height: 0

        }

      )

    // ========================================================

    // VELOCITY CONFIG

    // ========================================================

    const velocityConfigured =

      Boolean(

        process.env.VELOCITY_WAREHOUSE_ID

      ) &&

      Boolean(

        process.env.VELOCITY_STORE_NAME

      )

    // ========================================================

    // COD PACKAGE VALIDATION

    // ========================================================

    if (

      paymentMethod === 'cod' &&

      velocityConfigured &&

      (

        velocityPackage.weight <= 0 ||

        velocityPackage.length <= 0 ||

        velocityPackage.breadth <= 0 ||

        velocityPackage.height <= 0

      )

    ) {

      return res.status(400).json({

        success: false,

        message:

          'Shipping package details are missing. Please add weight and dimensions to all products before placing a COD order.'

      })

    }

    // ========================================================

    // CREATE XAAJ ORDER

    // ========================================================

    const order = await Order.create({

      user: req.user.id,

      items,

      shippingAddress,

      subtotal,

      discount,

      ...(appliedCoupon ? { appliedCoupon } : {}),
      ...(appliedAutomaticOffer ? { appliedOffer: appliedAutomaticOffer } : {}),

      couponCode: appliedCoupon?.code || '',

      shippingFee,

      total,

      status: 'pending',

      paymentStatus: 'pending',

      paymentProvider:

        paymentMethod

    })

    // ========================================================
    // RESERVE COUPON USAGE FOR ACCEPTED COD ORDERS
    // Razorpay usage is counted later, only after verified payment.
    // The conditional update prevents exceeding a configured limit.
    // ========================================================

    if (paymentMethod === 'cod' && appliedCoupon?.offerId) {
      const couponUsageFilter = {
        _id: appliedCoupon.offerId,
        type: 'coupon',
        enabled: true
      }

      const currentCoupon = await Offer.findById(appliedCoupon.offerId)

      if (!currentCoupon) {
        await Order.deleteOne({ _id: order._id })
        return res.status(409).json({
          success: false,
          message: 'The selected coupon is no longer available. Please try again.'
        })
      }

      if (currentCoupon.usageLimit != null) {
        couponUsageFilter.$or = [
          { usedCount: { $lt: Number(currentCoupon.usageLimit) } },
          { usedCount: { $exists: false } }
        ]
      }

      const updatedCoupon = await Offer.findOneAndUpdate(
        couponUsageFilter,
        { $inc: { usedCount: 1 } },
        { new: true }
      )

      if (!updatedCoupon) {
        await Order.deleteOne({ _id: order._id })
        return res.status(409).json({
          success: false,
          message: 'This coupon has reached its usage limit. Please choose another coupon.'
        })
      }
    }

    // ========================================================

    // VELOCITY - COD

    //

    // COD order is sent to Velocity immediately.

    //

    // Razorpay order will be sent to Velocity only after

    // successful Razorpay payment verification.

    // ========================================================

    if (

      paymentMethod === 'cod' &&

      !velocityConfigured

    ) {

      console.warn(

        '[VELOCITY] COD shipment skipped: VELOCITY_WAREHOUSE_ID or VELOCITY_STORE_NAME is missing.'

      )

    }

    if (

      paymentMethod === 'cod' &&

      velocityConfigured

    ) {

      try {

        // ----------------------------------------------------

        // LOG BEFORE API CALL

        // ----------------------------------------------------

        console.log(

          '[VELOCITY] Creating COD shipment...',

          {

            orderId: String(order._id),

            warehouseId:

              process.env.VELOCITY_WAREHOUSE_ID,

            storeName:

              process.env.VELOCITY_STORE_NAME,

            total: Number(total),

            subtotal: Number(subtotal),

            shippingFee:

              Number(shippingFee),

            package:

              velocityPackage

          }

        )

        // ----------------------------------------------------

        // CREATE VELOCITY SHIPMENT

        // ----------------------------------------------------

        const velocityResult =

          await createForwardShipment({

            store_name:

              process.env.VELOCITY_STORE_NAME,

            order_id:

              String(order._id),

            order_date:

              new Date().toISOString(),

            billing_customer_name:

              shippingAddress.name,

            billing_address:

              shippingAddress.address,

            billing_city:

              shippingAddress.city,

            billing_pincode:

              shippingAddress.pin,

            billing_state:

              shippingAddress.state,

            billing_country:

              'India',

            billing_phone:

              shippingAddress.phone,

            shipping_is_billing:

              true,

            print_label:

              true,

            order_items:

              items.map(item => ({

                name:

                  item.name,

                sku:

                  String(item.product),

                units:

                  Number(item.quantity),

                selling_price:

                  Number(item.price)

              })),

            payment_method:

                       'COD',

                     sub_total:

                    Number(total),

                      cod_collectible:

                      Number(total),

length:

  velocityPackage.length,

            breadth:

              velocityPackage.breadth,

            height:

              velocityPackage.height,

            weight:

              velocityPackage.weight,

            warehouse_id:

              process.env.VELOCITY_WAREHOUSE_ID

          })

        // ----------------------------------------------------

        // LOG COMPLETE VELOCITY RESPONSE

        // ----------------------------------------------------

        console.log(

          '[VELOCITY] COD shipment API response:',

          JSON.stringify(

            velocityResult,

            null,

            2

          )

        )

        // ----------------------------------------------------

        // NORMALIZE RESPONSE

        // ----------------------------------------------------

        const velocityData =

          velocityResult?.data ||

          velocityResult?.result ||

          velocityResult ||

          {}

        // ----------------------------------------------------

        // VELOCITY ORDER ID

        // ----------------------------------------------------

        order.velocityOrderId =

          velocityData?.order_id ||

          velocityData?.external_order_id ||

          String(order._id)

        // ----------------------------------------------------

        // SHIPMENT ID

        // ----------------------------------------------------

        order.velocityShipmentId =

          velocityData?.shipment_id ||

          velocityData?.shipment?.id ||

          velocityData?.id ||

          ''

        // ----------------------------------------------------

        // AWB

        // ----------------------------------------------------

        order.velocityAwb =

          velocityData?.awb_code ||

          velocityData?.awb ||

          velocityData?.tracking_number ||

          ''

        // ----------------------------------------------------

        // CARRIER

        // ----------------------------------------------------

        order.velocityCarrierId =

          velocityData?.carrier_id ||

          velocityData?.carrier?.id ||

          ''

        // ----------------------------------------------------

        // TRACKING URL

        // ----------------------------------------------------

        order.velocityTrackingUrl =

          velocityData?.tracking_url ||

          velocityData?.track_url ||

          velocityData?.label_url ||

          ''

        // ----------------------------------------------------

        // COURIER

        // ----------------------------------------------------

        order.courierName =

          velocityData?.courier_name ||

          velocityData?.courier?.name ||

          ''

        // ----------------------------------------------------

        // TRACKING NUMBER

        // ----------------------------------------------------

        order.trackingNumber =

          order.velocityAwb || ''

        // ----------------------------------------------------

        // VELOCITY STATUS

        // ----------------------------------------------------

        order.velocityStatus =

          velocityData?.status ||

          velocityData?.shipment_status ||

          'created'

        order.velocityLastSyncedAt =

          new Date()

        await order.save()

        // ----------------------------------------------------

        // SUCCESS LOG

        // ----------------------------------------------------

        console.log(

          '[VELOCITY] COD shipment created successfully:',

          {

            orderId:

              String(order._id),

            velocityOrderId:

              order.velocityOrderId,

            velocityShipmentId:

              order.velocityShipmentId,

            velocityAwb:

              order.velocityAwb,

            velocityCarrierId:

              order.velocityCarrierId,

            velocityTrackingUrl:

              order.velocityTrackingUrl,

            velocityStatus:

              order.velocityStatus

          }

        )

        // ----------------------------------------------------

        // IMPORTANT DEBUG

        //

        // If shipment ID exists but AWB is empty,

        // Velocity may require another shipment-assignment

        // API call.

        // ----------------------------------------------------

        if (

          order.velocityShipmentId &&

          !order.velocityAwb

        ) {

          console.warn(

            '[VELOCITY] Shipment created but AWB is empty. Check the Velocity API response/assignment step.'

          )

        }

      } catch (velocityError) {

        // ----------------------------------------------------

        // VELOCITY FAILURE

        //

        // XAAJ order remains created.

        // ----------------------------------------------------

        console.error(

          '[VELOCITY] COD shipment creation failed:',

          velocityError?.response?.data ||

          velocityError?.message ||

          velocityError

        )

        console.error(

          '[VELOCITY] Full error:',

          JSON.stringify(

            velocityError?.response?.data ||

              {},

            null,

            2

          )

        )

      }

    }

    // ========================================================
    // CUSTOMER ORDER CONFIRMATION EMAIL - COD ONLY
    // Prepaid confirmation is sent after Razorpay verification.
    // ========================================================

    if (paymentMethod === 'cod') {
      const escapeHtml = value =>
        String(value ?? '').replace(/[&<>"']/g, char => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[char])

      const orderNumber = String(order._id).slice(-8).toUpperCase()
      const customerName = shippingAddress.name || 'Customer'
      const customerEmail = shippingAddress.email
      const orderDate = new Date(order.createdAt || Date.now()).toLocaleString(
        'en-IN',
        {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }
      )

      const productRows = items.map(item => `
        <tr>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;">
            ${escapeHtml(item.name)}
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:center;">
            ${Number(item.quantity)}
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
            ₹${(Number(item.price) * Number(item.quantity)).toLocaleString('en-IN')}
          </td>
        </tr>
      `).join('')

      if (customerEmail) {
        try {
          await sendEmail({
            to: customerEmail,
            subject: `XAAJ - Your Order Has Been Successfully Placed (#${orderNumber})`,
            html: buildXaaJOrderConfirmationEmail({
              customerName, orderNumber, orderDate, productRows, subtotal, discount, shippingFee, total,
              paymentMethod: 'Cash on Delivery (COD)', paymentStatus: 'Pay on delivery',
              shippingAddress, escapeHtml
            })
          })
        } catch (emailError) {
          // Email failure must not undo a successfully created order.
          console.error(
            '[ORDER EMAIL] COD order confirmation email failed:',
            emailError?.message || emailError
          )
        }
      } else {
        console.warn(
          '[ORDER EMAIL] COD confirmation skipped: customer email is missing.',
          String(order._id)
        )
      }
    }

    // ========================================================

    // RESPONSE

    // ========================================================

    res.status(201).json({

      success: true,

      message:

        'Order created successfully',

      data: order

    })

  })

)

// ============================================================

// CUSTOMER CANCEL ORDER

//

// Customer can cancel only when status = pending.

//

// Once order moves to another status,

// online cancellation is disabled.

//

// Velocity cancellation is attempted first.

// ============================================================

router.patch(

  '/:id/cancel',

  protect,

  asyncHandler(async (req, res) => {

    // ========================================================

    // FIND ORDER

    // ========================================================

    const order =

      await Order.findOne({

        _id: req.params.id,

        user: req.user.id

      }).populate(

        'user',

        'name email'

      )

    if (!order) {

      return res.status(404).json({

        success: false,

        message: 'Order not found'

      })

    }

    // ========================================================

    // ONLY PENDING CAN CANCEL

    // ========================================================

    if (

      order.status !== 'pending'

    ) {

      return res.status(400).json({

        success: false,

        code:

          'CANCELLATION_UNAVAILABLE',

        message:

          `This order can no longer be cancelled online. Please contact Customer Care at ${CUSTOMER_CARE_EMAIL} or ${CUSTOMER_CARE_PHONE}.`

      })

    }

    // ========================================================

    // CANCEL VELOCITY SHIPMENT

    // ========================================================

    if (order.velocityAwb) {

      try {

        console.log(

          '[VELOCITY] Cancelling shipment:',

          order.velocityAwb

        )

        const velocityCancelResult =

          await cancelVelocityShipments([

            order.velocityAwb

          ])

        console.log(

          '[VELOCITY] Cancellation response:',

          JSON.stringify(

            velocityCancelResult,

            null,

            2

          )

        )

        const cancelData =

          velocityCancelResult?.data ||

          velocityCancelResult?.result ||

          velocityCancelResult ||

          {}

        order.velocityStatus =

          cancelData?.status ||

          'cancelled'

        order.velocityLastSyncedAt =

          new Date()

      } catch (velocityError) {

        console.error(

          '[VELOCITY] Shipment cancellation failed:',

          velocityError?.response?.data ||

          velocityError?.message ||

          velocityError

        )

        return res.status(400).json({

          success: false,

          code:

            'VELOCITY_CANCELLATION_FAILED',

          message:

            `The shipping partner could not cancel this shipment. Please contact Customer Care at ${CUSTOMER_CARE_EMAIL} or ${CUSTOMER_CARE_PHONE}.`

        })

      }

    }

    // ========================================================

    // CANCEL XAAJ ORDER

    // ========================================================

    order.status = 'cancelled'

    await order.save()

    // ========================================================

    // CUSTOMER EMAIL

    // ========================================================

    const orderNumber = String(order._id).slice(-8).toUpperCase()
    const customerEmail =

      order.shippingAddress?.email ||

      order.user?.email

    const customerName =

      order.shippingAddress?.name ||

      order.user?.name ||

      'Customer'

    if (customerEmail) {

      try {

        await sendEmail({

          to: customerEmail,

          subject:

            'XAAJ - Order Cancelled',

          html: `

            <div style="

              font-family:Arial,sans-serif;

              line-height:1.6;

              max-width:600px;

              margin:auto;

              padding:20px;

            ">

              <h2>

                Your order has been cancelled

              </h2>

              <p>

                Hi <strong>${customerName}</strong>,

              </p>

              <p>

                Your XAAJ order has been

                successfully cancelled.

              </p>

              <div style="

                margin-top:20px;

                padding:16px;

                border:1px solid #e5e5e5;

                border-radius:10px;

              ">

                <p style="margin:0 0 8px;">

                  <strong>Order Number:</strong>

                  ${orderNumber}

                </p>

                <p style="margin:0;">

                  <strong>Order Total:</strong>

                  ₹${order.total}

                </p>

              </div>

              <p style="margin-top:24px;">

                For any assistance, contact

                <strong>${CUSTOMER_CARE_EMAIL}</strong>

                or

                <strong>${CUSTOMER_CARE_PHONE}</strong>.

              </p>

              <p>

                Thank you for shopping with

                <strong>XAAJ</strong>.

              </p>

            </div>

          `

        })

      } catch (emailError) {

        console.error(

          'Cancellation email failed:',

          emailError?.message ||

          emailError

        )

      }

    }

    // ========================================================

    // RESPONSE

    // ========================================================

    res.json({

      success: true,

      message:

        'Order cancelled successfully',

      data: order

    })

  })

)

// ============================================================

// UPDATE ORDER STATUS

//

// ADMIN ONLY

//

// pending

// confirmed

// processing

// packed

// shipped

// out_for_delivery

// delivered

// cancelled

// ============================================================

router.patch(

  '/:id/status',

  protect,

  adminOnly,

  asyncHandler(async (req, res) => {

    const allowedStatuses = [

      'pending',

      'confirmed',

      'processing',

      'packed',

      'shipped',

      'out_for_delivery',

      'delivered',

      'cancelled'

    ]

    const status =

      String(

        req.body.status || ''

      ).trim()

    const courierName =

      String(

        req.body.courierName || ''

      ).trim()

    const trackingNumber =

      String(

        req.body.trackingNumber || ''

      ).trim()

    // ========================================================

    // STATUS VALIDATION

    // ========================================================

    if (

      !allowedStatuses.includes(

        status

      )

    ) {

      return res.status(400).json({

        success: false,

        message:

          'Invalid order status'

      })

    }

    // ========================================================

    // FIND ORDER

    // ========================================================

    const order =

      await Order.findById(

        req.params.id

      ).populate(

        'user',

        'name email'

      )

    if (!order) {

      return res.status(404).json({

        success: false,

        message:

          'Order not found'

      })

    }

    const orderNumber = String(order._id).slice(-8).toUpperCase()
    const oldStatus =

      order.status

    // ========================================================

    // ADMIN CANCELLATION

    //

    // Cancel Velocity shipment first.

    // ========================================================

    if (

      status === 'cancelled' &&

      oldStatus !== 'cancelled' &&

      order.velocityAwb

    ) {

      try {

        console.log(

          '[VELOCITY] Admin cancelling shipment:',

          order.velocityAwb

        )

        const cancelResult =

          await cancelVelocityShipments([

            order.velocityAwb

          ])

        console.log(

          '[VELOCITY] Admin cancellation response:',

          JSON.stringify(

            cancelResult,

            null,

            2

          )

        )

        order.velocityStatus =

          'cancelled'

        order.velocityLastSyncedAt =

          new Date()

      } catch (velocityError) {

        console.error(

          '[VELOCITY] Admin cancellation failed:',

          velocityError?.response?.data ||

          velocityError?.message ||

          velocityError

        )

        return res.status(400).json({

          success: false,

          code:

            'VELOCITY_CANCELLATION_FAILED',

          message:

            `Velocity shipment could not be cancelled. Please try again or contact Customer Care at ${CUSTOMER_CARE_EMAIL}.`

        })

      }

    }

    // ========================================================

    // UPDATE STATUS

    // ========================================================

    order.status = status

    // ========================================================

    // UPDATE COURIER

    // ========================================================

    if (courierName) {

      order.courierName =

        courierName

    }

    // ========================================================

    // UPDATE TRACKING

    // ========================================================

    if (trackingNumber) {

      order.trackingNumber =

        trackingNumber

    }

    await order.save()

    // ========================================================

    // CUSTOMER DETAILS

    // ========================================================

    const customerEmail =

      order.shippingAddress?.email ||

      order.user?.email

    const customerName =

      order.shippingAddress?.name ||

      order.user?.name ||

      'Customer'

    // ========================================================

    // EMAIL DEFAULT

    // ========================================================

    let emailSubject =

      'XAAJ - Order Status Updated'

    let emailTitle =

      'Your order status was updated'

    let emailMessage =

      `Your order status has been changed to ${status.replace(/_/g, ' ')}.`

    // ========================================================

    // STATUS EMAIL

    // ========================================================

    switch (status) {

      case 'pending':

        emailSubject =

          'XAAJ - Order Pending'

        emailTitle =

          'Your order is pending'

        emailMessage =

          'Your order has been received and is currently pending confirmation.'

        break

      case 'confirmed':

        emailSubject =

          'XAAJ - Order Confirmed'

        emailTitle =

          'Your order is confirmed! 🎉'

        emailMessage =

          'Your order has been confirmed successfully.'

        break

      case 'processing':

        emailSubject =

          'XAAJ - Order Processing'

        emailTitle =

          'Your order is being processed'

        emailMessage =

          'We have started processing your order.'

        break

      case 'packed':

        emailSubject =

          'XAAJ - Order Packed'

        emailTitle =

          'Your order has been packed 📦'

        emailMessage =

          'Your order has been carefully packed and is ready for dispatch.'

        break

      case 'shipped':

        emailSubject =

          'XAAJ - Order Shipped'

        emailTitle =

          'Your order is on the way 🚚'

        emailMessage =

          'Your order has been shipped and is now on its way to you.'

        break

      case 'out_for_delivery':

        emailSubject =

          'XAAJ - Out for Delivery'

        emailTitle =

          'Your order is out for delivery 🛵'

        emailMessage =

          'Your order is currently out for delivery and should reach you soon.'

        break

      case 'delivered':

        emailSubject =

          'XAAJ - Order Delivered'

        emailTitle =

          'Your order has been delivered 🎉'

        emailMessage =

          'Your XAAJ order has been successfully delivered.'

        break

      case 'cancelled':

        emailSubject =

          'XAAJ - Order Cancelled'

        emailTitle =

          'Your order has been cancelled'

        emailMessage =

          `Your order has been cancelled. If you need assistance, please contact ${CUSTOMER_CARE_EMAIL} or ${CUSTOMER_CARE_PHONE}.`

        break

    }

    // ========================================================

    // COURIER INFORMATION

    // ========================================================

    let courierHtml = ''

    if (

      status === 'shipped' ||

      status === 'out_for_delivery' ||

      status === 'delivered'

    ) {

      const courier =

        order.courierName ||

        'Not provided'

      const tracking =

        order.trackingNumber ||

        order.velocityAwb ||

        'Not provided'

      const trackingUrl =

        order.velocityTrackingUrl || ''

      courierHtml = `

        <div style="

          margin-top:20px;

          padding:16px;

          background:#f7f7f7;

          border-radius:10px;

        ">

          <p style="margin:0 0 8px;">

            <strong>Courier:</strong>

            ${courier}

          </p>

          <p style="margin:0;">

            <strong>Tracking Number:</strong>

            ${tracking}

          </p>

          ${

            trackingUrl

              ? `

                <p style="margin:12px 0 0;">

                  <a

                    href="${trackingUrl}"

                    target="_blank"

                    rel="noopener noreferrer"

                  >

                    Track Your Order

                  </a>

                </p>

              `

              : ''

          }

        </div>

      `

    }

    // ========================================================

    // SEND EMAIL ONLY IF STATUS CHANGED

    // ========================================================

    if (

      customerEmail &&

      oldStatus !== status

    ) {

      try {

        await sendEmail({

          to: customerEmail,

          subject:

            emailSubject,

          html: `

            <div style="

              font-family:Arial,sans-serif;

              line-height:1.6;

              max-width:600px;

              margin:auto;

              padding:20px;

            ">

              <h2>

                ${emailTitle}

              </h2>

              <p>

                Hi <strong>${customerName}</strong>,

              </p>

              <p>

                ${emailMessage}

              </p>

              <div style="

                margin-top:20px;

                padding:16px;

                border:1px solid #e5e5e5;

                border-radius:10px;

              ">

                <p style="margin:0 0 8px;">

                  <strong>Order Number:</strong>

                  ${orderNumber}

                </p>

                <p style="margin:0 0 8px;">

                  <strong>Order Total:</strong>

                  ₹${order.total}

                </p>

                <p style="margin:0;">

                  <strong>Status:</strong>

                  ${status.replace(

                    /_/g,

                    ' '

                  )}

                </p>

              </div>

              ${courierHtml}

              <p style="margin-top:24px;">

                Thank you for shopping with

                <strong>XAAJ</strong>.

              </p>

              ${

                status === 'cancelled'

                  ? `

                    <p>

                      Customer Care:

                      <strong>

                        ${CUSTOMER_CARE_EMAIL}

                      </strong>

                      <br />

                      <strong>

                        ${CUSTOMER_CARE_PHONE}

                      </strong>

                    </p>

                  `

                  : ''

              }

            </div>

          `

        })

      } catch (emailError) {

        console.error(

          'Order status email failed:',

          emailError?.message ||

          emailError

        )

      }

    }

    // ========================================================

    // RESPONSE

    // ========================================================

    res.json({

      success: true,

      message:

        'Order updated successfully',

      data: order

    })

  })

)

// ============================================================

// EXPORT

// ============================================================

export default router