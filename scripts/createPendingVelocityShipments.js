import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'

import Order from '../src/models/Order.js'
import { createPrepaidVelocityShipment } from '../src/services/velocityShipmentRetry.js'

// ============================================================
// LOAD BACKEND .ENV
// ============================================================

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({
  path: path.resolve(__dirname, '../.env')
})

// ============================================================
// MAIN
// ============================================================

async function main() {
  try {
    console.log('========================================')
    console.log('PENDING RAZORPAY VELOCITY SHIPMENTS')
    console.log('========================================')

    // ========================================================
    // CHECK MONGODB URI
    // ========================================================

    if (!process.env.MONGODB_URI) {
      throw new Error(
        'MONGODB_URI is missing in backend/.env'
      )
    }

    console.log('Connecting to MongoDB...')

    // ========================================================
    // MONGODB CONNECTION
    // ========================================================

    await mongoose.connect(process.env.MONGODB_URI)

    console.log('MongoDB connected ✅')

    // ========================================================
    // FIND RAZORPAY PAID ORDERS
    // WHERE VELOCITY SHIPMENT IS NOT CREATED
    // ========================================================

    const orders = await Order.find({
      paymentProvider: 'razorpay',

      paymentStatus: 'paid',

      status: 'confirmed',

      $and: [
        {
          $or: [
            {
              velocityShipmentId: {
                $exists: false
              }
            },
            {
              velocityShipmentId: null
            },
            {
              velocityShipmentId: ''
            }
          ]
        },

        {
          $or: [
            {
              velocityAwb: {
                $exists: false
              }
            },
            {
              velocityAwb: null
            },
            {
              velocityAwb: ''
            }
          ]
        }
      ]
    }).sort({
      createdAt: 1
    })

    // ========================================================
    // RESULT
    // ========================================================

    console.log(
      `Found ${orders.length} pending Razorpay orders.`
    )

    if (orders.length === 0) {
      console.log(
        'No pending Razorpay shipments found.'
      )

      return
    }

    // ========================================================
    // COUNTERS
    // ========================================================

    let successCount = 0
    let failedCount = 0

    // ========================================================
    // PROCESS ORDERS
    // ========================================================

    for (const order of orders) {
      console.log('')
      console.log('----------------------------------------')
      console.log(`Processing Order: ${order._id}`)
      console.log(`Total: ₹${order.total}`)
      console.log(`Payment Provider: ${order.paymentProvider}`)
      console.log(`Payment Status: ${order.paymentStatus}`)
      console.log(`Order Status: ${order.status}`)
      console.log('----------------------------------------')

      try {
        // ====================================================
        // CREATE VELOCITY PREPAID SHIPMENT
        // ====================================================

        const result =
          await createPrepaidVelocityShipment(
            order._id
          )

        // ====================================================
        // SUCCESS
        // ====================================================

        if (
          result?.success ||
          result?.created ||
          result?.alreadyCreated
        ) {
          successCount += 1

          console.log(
            `SUCCESS ✅ Velocity shipment processed for ${order._id}`
          )

          console.log({
            velocityOrderId:
              result?.order?.velocityOrderId,

            velocityShipmentId:
              result?.order?.velocityShipmentId,

            velocityAwb:
              result?.order?.velocityAwb
          })

          continue
        }

        // ====================================================
        // SKIPPED
        // ====================================================

        failedCount += 1

        console.log(
          `SKIPPED ⚠️ Order ${order._id}`
        )

        console.log(result)

      } catch (error) {
        // ====================================================
        // FAILED
        // ====================================================

        failedCount += 1

        console.error(
          `FAILED ❌ Order ${order._id}`
        )

        console.error({
          message: error?.message,

          velocityResponse:
            error?.velocityResponse
        })
      }
    }

    // ========================================================
    // FINAL RESULT
    // ========================================================

    console.log('')
    console.log('========================================')
    console.log('PROCESS COMPLETED')
    console.log('========================================')

    console.log(
      `Total found : ${orders.length}`
    )

    console.log(
      `Successful  : ${successCount}`
    )

    console.log(
      `Failed      : ${failedCount}`
    )

    console.log('========================================')

  } catch (error) {
    // ========================================================
    // SCRIPT ERROR
    // ========================================================

    console.error('')
    console.error('SCRIPT FAILED ❌')
    console.error(error)

    process.exitCode = 1

  } finally {
    // ========================================================
    // CLOSE MONGODB
    // ========================================================

    if (
      mongoose.connection.readyState !== 0
    ) {
      await mongoose.connection.close()

      console.log(
        'MongoDB connection closed.'
      )
    }
  }
}

// ============================================================
// RUN
// ============================================================

main()