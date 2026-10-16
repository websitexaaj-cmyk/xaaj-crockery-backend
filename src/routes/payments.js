import { Router } from 'express'

import mongoose from 'mongoose'

import Order from '../models/Order.js'

import Product from '../models/Product.js'

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
    // DISCOUNT
    // ========================================================

    const discount = 0


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
    // ========================================================

    const customerEmail =

      order.shippingAddress?.email ||

      order.user?.email


    const customerName =

      order.shippingAddress?.name ||

      order.user?.name ||

      'Customer'


    if (customerEmail) {

      await sendEmail({

        to:

          customerEmail,

        subject:

          'XAAJ - Payment Confirmed',

        html: `

          <div style="

            font-family:Arial,sans-serif;

            line-height:1.6;

            max-width:600px;

            margin:auto;

            padding:20px;

          ">

            <h2>

              Thank you for your order! 🎉

            </h2>

            <p>

              Hi

              <strong>

                ${customerName}

              </strong>,

            </p>

            <p>

              Your payment has been

              successfully received.

            </p>

            <p>

              <strong>

                Order ID:

              </strong>

              ${order._id}

            </p>

            <p>

              <strong>

                Payment ID:

              </strong>

              ${paymentId}

            </p>

            <p>

              <strong>

                Order Total:

              </strong>

              ₹${order.total}

            </p>

            <p>

              Your order is now

              <strong>

                confirmed

              </strong>

              and will be processed shortly.

            </p>

            <p>

              Thank you for shopping with

              <strong>

                XAAJ

              </strong>.

            </p>

          </div>

        `

      })

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