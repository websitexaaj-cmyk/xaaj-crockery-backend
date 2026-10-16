// ============================================================
// XAAJ - Velocity Shipment Automatic Retry Service
// ============================================================

// Purpose:
// - Razorpay payment successful hone ke baad Velocity shipment
//   creation fail ho jaaye to automatically retry karna.

// Important:
// - Customer ko dobara payment nahi karni.
// - Order PAID/CONFIRMED hi rahega.
// - Maximum 3 Velocity attempts.
// - Successful shipment ke baad retry stop.
// - Duplicate shipment create hone se protection.


// ============================================================
// IMPORTS
// ============================================================

import mongoose from 'mongoose'

import Order from '../models/Order.js'
import Product from '../models/Product.js'

import {
  createForwardShipment
} from './velocity.js'


// ============================================================
// CONFIGURATION
// ============================================================

const MAX_ATTEMPTS = 3

// Retry delays:
// Attempt 1 = immediate
// Attempt 2 = 10 seconds
// Attempt 3 = 30 seconds

const RETRY_DELAYS = [
  10 * 1000,
  30 * 1000,
  60 * 1000
]


// ============================================================
// IN-MEMORY RETRY TRACKER
// ============================================================

const retryAttempts = new Map()


// ============================================================
// LOG HELPER
// ============================================================

function log(message, data = {}) {
  console.log(
    `[VELOCITY RETRY] ${message}`,
    data
  )
}


// ============================================================
// NORMALIZE VELOCITY RESPONSE
// ============================================================

function normalizeVelocityResponse(response) {

  /*
    Velocity forward-order API returns shipment details
    inside `payload`.

    Actual response example:

    {
      status: 1,
      payload: {
        pickup_location_added: 1,
        order_created: 1,
        awb_generated: 1,
        label_generated: 1,
        pickup_generated: 1,
        manifest_generated: 0,

        order_id: "ORD4WUZYZEJBD",
        shipment_id: "SHIO4KKTCQ2GI",
        awb_code: "153983260508727",

        courier_company_id: "CAR5PQGYFJ4AH",
        courier_name: "Xpressbees Standard 250G",

        label_url: "...",
        manifest_url: null
      }
    }

    IMPORTANT:
    Data `response.payload` ke andar hai.
  */

  const root =
    response?.data ??
    response?.result ??
    response

  const data =
    root?.payload ??
    root?.data ??
    root?.result ??
    root

  return {

    // ----------------------------------------------------------
    // VELOCITY ORDER ID
    // ----------------------------------------------------------

    velocityOrderId:
      data?.order_id ??
      data?.orderId ??
      data?.reference_number ??
      data?.referenceNumber ??
      '',


    // ----------------------------------------------------------
    // VELOCITY SHIPMENT ID
    // ----------------------------------------------------------

    velocityShipmentId:
      data?.shipment_id ??
      data?.shipmentId ??
      data?.shipment?.id ??
      '',


    // ----------------------------------------------------------
    // AWB
    // ----------------------------------------------------------

    velocityAwb:
      data?.awb ??
      data?.waybill ??
      data?.awb_number ??
      data?.waybill_number ??
      data?.awb_code ??
      data?.tracking_number ??
      '',


    // ----------------------------------------------------------
    // COURIER / CARRIER ID
    // ----------------------------------------------------------

    velocityCarrierId:
      data?.carrier_id ??
      data?.carrierId ??
      data?.courier_id ??
      data?.courier_company_id ??
      '',


    // ----------------------------------------------------------
    // TRACKING URL
    // ----------------------------------------------------------

    velocityTrackingUrl:
      data?.tracking_url ??
      data?.trackingUrl ??
      data?.track_url ??
      data?.label_url ??
      '',


    // ----------------------------------------------------------
    // COURIER NAME
    // ----------------------------------------------------------

    courierName:
      data?.courier_name ??
      data?.courierName ??
      data?.carrier_name ??
      '',


    // ----------------------------------------------------------
    // TRACKING NUMBER
    // ----------------------------------------------------------

    trackingNumber:
      data?.awb ??
      data?.waybill ??
      data?.awb_number ??
      data?.waybill_number ??
      data?.awb_code ??
      data?.tracking_number ??
      '',


    // ----------------------------------------------------------
    // VELOCITY STATUS
    // ----------------------------------------------------------

    velocityStatus:
      data?.shipment_status ??
      data?.status ??
      root?.status ??
      '',


    // ----------------------------------------------------------
    // SUB STATUS
    // ----------------------------------------------------------

    velocitySubStatus:
      data?.sub_status ??
      data?.subStatus ??
      '',


    // ----------------------------------------------------------
    // EXPECTED DELIVERY
    // ----------------------------------------------------------

    velocityExpectedDelivery:
      data?.expected_delivery ??
      data?.expectedDelivery ??
      data?.pickup_scheduled_date ??
      null
  }
}


// ============================================================
// CHECK IF SHIPMENT ALREADY EXISTS
// ============================================================

function shipmentAlreadyCreated(order) {

  return Boolean(
    order.velocityShipmentId ||
    order.velocityAwb ||
    order.velocityOrderId
  )
}


// ============================================================
// BUILD PREPAID VELOCITY PAYLOAD
// ============================================================

async function buildPrepaidPayload(order) {

  const productIds =
    order.items
      .map(item => item.product)
      .filter(Boolean)


  const products =
    await Product.find({
      _id: {
        $in: productIds
      }
    }).lean()


  const productMap =
    new Map(
      products.map(product => [
        String(product._id),
        product
      ])
    )


  let totalWeight = 0
  let maxLength = 0
  let maxBreadth = 0
  let maxHeight = 0


  // ==========================================================
  // CALCULATE PACKAGE DIMENSIONS
  // ==========================================================

  for (const item of order.items) {

    const product =
      productMap.get(
        String(item.product)
      )


    if (!product) {

      throw new Error(
        `Product not found for order item: ${item.name}`
      )

    }


    // Product.js shipping structure

    const weight =
      Number(
        product.shipping?.weight
      )


    const length =
      Number(
        product.shipping?.length
      )


    const breadth =
      Number(
        product.shipping?.breadth
      )


    const height =
      Number(
        product.shipping?.height
      )


    if (
      !Number.isFinite(weight) ||
      weight <= 0
    ) {

      throw new Error(
        `Invalid shipping weight for product: ${item.name}`
      )

    }


    if (
      !Number.isFinite(length) ||
      length <= 0
    ) {

      throw new Error(
        `Invalid shipping length for product: ${item.name}`
      )

    }


    if (
      !Number.isFinite(breadth) ||
      breadth <= 0
    ) {

      throw new Error(
        `Invalid shipping breadth for product: ${item.name}`
      )

    }


    if (
      !Number.isFinite(height) ||
      height <= 0
    ) {

      throw new Error(
        `Invalid shipping height for product: ${item.name}`
      )

    }


    const quantity =
      Math.max(
        1,
        Number(item.quantity) || 1
      )


    totalWeight +=
      weight * quantity


    maxLength =
      Math.max(
        maxLength,
        length
      )


    maxBreadth =
      Math.max(
        maxBreadth,
        breadth
      )


    maxHeight =
      Math.max(
        maxHeight,
        height
      )

  }


  if (
    totalWeight <= 0 ||
    maxLength <= 0 ||
    maxBreadth <= 0 ||
    maxHeight <= 0
  ) {

    throw new Error(
      'Invalid product shipping dimensions for Velocity shipment'
    )

  }


  const address =
    order.shippingAddress


  // ==========================================================
  // ITEMS
  // ==========================================================

  const items =
    order.items.map(item => ({

      name:
        item.name,

      sku:
        String(item.product),

      units:
        Number(item.quantity),

      selling_price:
        Number(item.price)

    }))


  // ==========================================================
  // VELOCITY PREPAID PAYLOAD
  // ==========================================================

  return {

    // --------------------------------------------------------
    // STORE / ORDER
    // --------------------------------------------------------

    store_name:
      process.env.VELOCITY_STORE_NAME,

    order_id:
      String(order._id),

    order_number:
      String(order._id),

    order_date:
      new Date().toISOString(),


    // --------------------------------------------------------
    // BILLING
    // --------------------------------------------------------

    billing_customer_name:
      address.name,

    billing_address:
      address.address,

    billing_city:
      address.city,

    billing_pincode:
      address.pin,

    billing_state:
      address.state,

    billing_country:
      'India',

    billing_phone:
      address.phone,

    shipping_is_billing:
      true,

    print_label:
      true,


    // --------------------------------------------------------
    // ITEMS
    // --------------------------------------------------------

    items,

    // Keep this as well for compatibility
    order_items:
      items,


    // --------------------------------------------------------
    // PAYMENT
    // --------------------------------------------------------

    payment_method:
      'PREPAID',

    cod_collectible:
      0,

    sub_total:
      Number(order.total),


    // --------------------------------------------------------
    // CUSTOMER
    // --------------------------------------------------------

    customer_name:
      address.name,

    customer_email:
      address.email || '',

    customer_phone:
      address.phone,


    // --------------------------------------------------------
    // SHIPPING ADDRESS
    // --------------------------------------------------------

    address:
      address.address,

    city:
      address.city,

    state:
      address.state,

    pincode:
      address.pin,


    // --------------------------------------------------------
    // PACKAGE
    // --------------------------------------------------------

    weight:
      Number(
        totalWeight.toFixed(3)
      ),

    length:
      Number(
        maxLength.toFixed(2)
      ),

    breadth:
      Number(
        maxBreadth.toFixed(2)
      ),

    height:
      Number(
        maxHeight.toFixed(2)
      ),


    // --------------------------------------------------------
    // WAREHOUSE
    // --------------------------------------------------------

    warehouse_id:
      process.env.VELOCITY_WAREHOUSE_ID
  }
}


// ============================================================
// CREATE VELOCITY SHIPMENT
// ============================================================

export async function createPrepaidVelocityShipment(
  orderId
) {

  // ----------------------------------------------------------
  // VALIDATE ORDER ID
  // ----------------------------------------------------------

  if (
    !mongoose.Types.ObjectId.isValid(
      orderId
    )
  ) {

    throw new Error(
      `Invalid order ID: ${orderId}`
    )

  }


  // ----------------------------------------------------------
  // GET ORDER
  // ----------------------------------------------------------

  const order =
    await Order.findById(orderId)


  if (!order) {

    throw new Error(
      `Order not found: ${orderId}`
    )

  }


  // ----------------------------------------------------------
  // PAYMENT CHECK
  // ----------------------------------------------------------

  if (
    order.paymentProvider !== 'razorpay' ||
    order.paymentStatus !== 'paid'
  ) {

    log(
      'Skipping shipment because payment is not PAID',
      {
        orderId:
          String(order._id),

        paymentStatus:
          order.paymentStatus,

        paymentProvider:
          order.paymentProvider
      }
    )


    return {
      success: false,
      skipped: true,
      reason: 'PAYMENT_NOT_PAID'
    }

  }


  // ----------------------------------------------------------
  // ORDER STATUS CHECK
  // ----------------------------------------------------------

  if (
    order.status !== 'confirmed'
  ) {

    log(
      'Skipping shipment because order is not confirmed',
      {
        orderId:
          String(order._id),

        status:
          order.status
      }
    )


    return {
      success: false,
      skipped: true,
      reason: 'ORDER_NOT_CONFIRMED'
    }

  }


  // ----------------------------------------------------------
  // DUPLICATE PROTECTION
  // ----------------------------------------------------------

  if (
    shipmentAlreadyCreated(order)
  ) {

    log(
      'Shipment already exists. Retry stopped.',
      {
        orderId:
          String(order._id),

        velocityOrderId:
          order.velocityOrderId,

        velocityShipmentId:
          order.velocityShipmentId,

        velocityAwb:
          order.velocityAwb
      }
    )


    retryAttempts.delete(
      String(order._id)
    )


    return {
      success: true,
      alreadyCreated: true,
      order
    }

  }


  // ----------------------------------------------------------
  // VELOCITY CONFIG CHECK
  // ----------------------------------------------------------

  if (
    !process.env.VELOCITY_WAREHOUSE_ID
  ) {

    throw new Error(
      'VELOCITY_WAREHOUSE_ID is not configured'
    )

  }


  if (
    !process.env.VELOCITY_STORE_NAME
  ) {

    throw new Error(
      'VELOCITY_STORE_NAME is not configured'
    )

  }


  // ----------------------------------------------------------
  // BUILD PAYLOAD
  // ----------------------------------------------------------

  const payload =
    await buildPrepaidPayload(
      order
    )


  // ----------------------------------------------------------
  // LOG PAYLOAD
  // ----------------------------------------------------------

  log(
    'Creating PREPAID Velocity shipment',
    {
      orderId:
        String(order._id),

      attempt:
        retryAttempts.get(
          String(order._id)
        ) || 1,

      items:
        payload.items?.length || 0,

      payment_method:
        payload.payment_method
    }
  )


  // ----------------------------------------------------------
  // CALL VELOCITY
  // ----------------------------------------------------------

  const response =
    await createForwardShipment(
      payload
    )


  // ----------------------------------------------------------
  // LOG RESPONSE
  // ----------------------------------------------------------

  console.log(
    '[VELOCITY RETRY] PREPAID shipment API response:',
    JSON.stringify(
      response,
      null,
      2
    )
  )


  // ----------------------------------------------------------
  // NORMALIZE RESPONSE
  // ----------------------------------------------------------

  const velocity =
    normalizeVelocityResponse(
      response
    )


  // ----------------------------------------------------------
  // VERIFY SUCCESS
  // ----------------------------------------------------------

  if (
    !velocity.velocityShipmentId &&
    !velocity.velocityAwb &&
    !velocity.velocityOrderId
  ) {

    const error =
      new Error(
        'Velocity response did not contain shipment/order reference'
      )

    // Keep complete response available in logs/catch block
    error.velocityResponse =
      response

    throw error

  }


  // ----------------------------------------------------------
  // SAVE VELOCITY DETAILS
  // ----------------------------------------------------------

  order.velocityOrderId =
    velocity.velocityOrderId


  order.velocityShipmentId =
    velocity.velocityShipmentId


  order.velocityAwb =
    velocity.velocityAwb


  order.velocityCarrierId =
    velocity.velocityCarrierId


  order.velocityTrackingUrl =
    velocity.velocityTrackingUrl


  order.courierName =
    velocity.courierName


  order.trackingNumber =
    velocity.trackingNumber


  order.velocityStatus =
    velocity.velocityStatus


  order.velocitySubStatus =
    velocity.velocitySubStatus


  order.velocityExpectedDelivery =
    velocity.velocityExpectedDelivery
      ? new Date(
          velocity.velocityExpectedDelivery
        )
      : null


  order.velocityLastSyncedAt =
    new Date()


  await order.save()


  // ----------------------------------------------------------
  // CLEAR RETRY COUNTER
  // ----------------------------------------------------------

  retryAttempts.delete(
    String(order._id)
  )


  log(
    'Velocity shipment created successfully',
    {
      orderId:
        String(order._id),

      velocityOrderId:
        order.velocityOrderId,

      velocityShipmentId:
        order.velocityShipmentId,

      velocityAwb:
        order.velocityAwb
    }
  )


  return {
    success: true,
    created: true,
    order
  }
}


// ============================================================
// RETRY HANDLER
// ============================================================

async function executeRetry(
  orderId
) {

  const key =
    String(orderId)


  try {

    const order =
      await Order.findById(
        orderId
      )


    // --------------------------------------------------------
    // ORDER NOT FOUND
    // --------------------------------------------------------

    if (!order) {

      log(
        'Retry stopped because order no longer exists',
        {
          orderId: key
        }
      )


      retryAttempts.delete(
        key
      )


      return

    }


    // --------------------------------------------------------
    // DUPLICATE PROTECTION
    // --------------------------------------------------------

    if (
      shipmentAlreadyCreated(
        order
      )
    ) {

      log(
        'Retry stopped because shipment already exists',
        {
          orderId: key
        }
      )


      retryAttempts.delete(
        key
      )


      return

    }


    // --------------------------------------------------------
    // CURRENT ATTEMPT
    // --------------------------------------------------------

    const currentAttempt =
      retryAttempts.get(key) || 1


    log(
      `Starting retry attempt ${currentAttempt}/${MAX_ATTEMPTS}`,
      {
        orderId: key
      }
    )


    // --------------------------------------------------------
    // TRY SHIPMENT
    // --------------------------------------------------------

    await createPrepaidVelocityShipment(
      orderId
    )


    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    retryAttempts.delete(
      key
    )

  } catch (error) {

    const currentAttempt =
      retryAttempts.get(key) || 1


    log(
      `Velocity attempt ${currentAttempt} failed`,
      {
        orderId: key,

        error:
          error?.message ||
          String(error),

        velocityResponse:
          error?.velocityResponse
      }
    )


    // --------------------------------------------------------
    // MAX RETRIES
    // --------------------------------------------------------

    if (
      currentAttempt >=
      MAX_ATTEMPTS
    ) {

      log(
        'Maximum Velocity retry attempts reached',
        {
          orderId: key,

          attempts:
            currentAttempt
        }
      )


      retryAttempts.delete(
        key
      )


      return

    }


    // --------------------------------------------------------
    // NEXT RETRY
    // --------------------------------------------------------

    const nextAttempt =
      currentAttempt + 1


    retryAttempts.set(
      key,
      nextAttempt
    )


    const delay =
      RETRY_DELAYS[
        currentAttempt - 1
      ] ??
      RETRY_DELAYS[
        RETRY_DELAYS.length - 1
      ]


    log(
      'Scheduling next Velocity retry',
      {
        orderId: key,

        nextAttempt,

        delayMs:
          delay
      }
    )


    setTimeout(
      () => {

        executeRetry(
          orderId
        )

      },
      delay
    )

  }
}


// ============================================================
// PUBLIC FUNCTION
// ============================================================
//
// payments.js se payment successful hone ke baad is function
// ko call kiya jayega.
//
// Immediate attempt + automatic retries.
//
// ============================================================

export async function scheduleVelocityShipmentRetry(
  orderId
) {

  const key =
    String(orderId)


  // ----------------------------------------------------------
  // DON'T START DUPLICATE RETRY CHAINS
  // ----------------------------------------------------------

  if (
    retryAttempts.has(key)
  ) {

    log(
      'Retry chain already exists',
      {
        orderId: key
      }
    )


    return

  }


  // ----------------------------------------------------------
  // FIRST ATTEMPT
  // ----------------------------------------------------------

  retryAttempts.set(
    key,
    1
  )


  try {

    log(
      'Starting initial Velocity shipment attempt',
      {
        orderId: key
      }
    )


    await createPrepaidVelocityShipment(
      orderId
    )


    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    retryAttempts.delete(
      key
    )

  } catch (error) {

    log(
      'Initial Velocity shipment attempt failed',
      {
        orderId: key,

        error:
          error?.message ||
          String(error),

        velocityResponse:
          error?.velocityResponse
      }
    )


    // --------------------------------------------------------
    // FIRST RETRY
    // --------------------------------------------------------

    const delay =
      RETRY_DELAYS[0]


    retryAttempts.set(
      key,
      2
    )


    log(
      'Scheduling Velocity retry #2',
      {
        orderId: key,

        delayMs:
          delay
      }
    )


    setTimeout(
      () => {

        executeRetry(
          orderId
        )

      },
      delay
    )

  }
}


// ============================================================
// MANUAL RETRY
// ============================================================
//
// Admin/backend future use ke liye.
//
// ============================================================

export async function retryVelocityShipment(
  orderId
) {

  const key =
    String(orderId)


  retryAttempts.delete(
    key
  )


  retryAttempts.set(
    key,
    1
  )


  return executeRetry(
    orderId
  )
}


// ============================================================
// EXPORT
// ============================================================

export default {
  createPrepaidVelocityShipment,
  scheduleVelocityShipmentRetry,
  retryVelocityShipment
}