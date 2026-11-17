import express from 'express'
import crypto from 'node:crypto'

import Order from '../models/Order.js'
import VelocityWebhookEvent from '../models/VelocityWebhookEvent.js'
import { verifyVelocityWebhookKey } from '../services/velocity.js'

const router = express.Router()

const toValidDate = value => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// Convert Velocity status strings into a consistent format before mapping.
const normalizeStatusKey = status =>
  String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

const normalizeStatus = status => {
  const value = normalizeStatusKey(status)

  const statusMap = {
    pending: 'confirmed',
    rejected: 'cancelled',
    processing: 'processing',
    ready_for_pickup: 'packed',
    pickup_scheduled: 'packed',
    not_picked: 'packed',
    picked_up: 'shipped',
    in_transit: 'shipped',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    ndr_raised: 'out_for_delivery',
    need_attention: 'out_for_delivery',
    reattempt_delivery: 'out_for_delivery',
    cancelled: 'cancelled',
    lost: 'cancelled',
    externally_fulfilled: 'shipped',
    rto_initiated: 'shipped',
    rto_cancelled: 'shipped',
    rto_in_transit: 'shipped',
    rto_need_attention: 'shipped',
    rto_delivered: 'cancelled',
    rto_lost: 'cancelled',
    return_rejected: 'cancelled',
    return_pickup_scheduled: 'shipped',
    return_not_picked: 'shipped',
    return_in_transit: 'shipped',
    return_delivered: 'delivered',
    return_cancelled: 'cancelled',
    return_ndr_raised: 'out_for_delivery',
    return_need_attention: 'out_for_delivery',
    return_qc_failed: 'out_for_delivery',
    return_lost: 'cancelled'
  }

  return statusMap[value] || null
}

const getEventId = payload => {
  if (payload?.event_id) return String(payload.event_id)

  // Fallback for webhook payloads that do not contain event_id.
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
}

const isValidObjectId = value =>
  /^[a-f\d]{24}$/i.test(String(value || ''))

// POST /api/shipping/webhook
router.post('/webhook', async (req, res) => {
  let webhookEvent = null

  try {
    // 1. Authenticate the webhook using the X-API-Key header.
    const providedKey = req.get('x-api-key')

    if (!verifyVelocityWebhookKey(providedKey)) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized webhook request'
      })
    }

    // 2. Validate and read the Velocity payload.
    const payload = req.body

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      })
    }

    // Support the documented data wrapper and a payload wrapper fallback.
    const data = payload.data || payload.payload || {}

    const shipmentId = String(
      data.shipment_id || data.shipment?.id || ''
    ).trim()

    const awb = String(
      data.tracking_number || data.awb_code || data.awb || ''
    ).trim()

    // Velocity order_id is Velocity's internal order ID.
    // XAAJ stores it in Order.velocityOrderId.
    const velocityOrderId = String(data.order_id || '').trim()
    const orderExternalId = String(data.order_external_id || '').trim()

    if (!shipmentId && !awb && !velocityOrderId && !orderExternalId) {
      return res.status(400).json({
        success: false,
        message: 'Shipment ID, AWB or order reference is required'
      })
    }

    // 3. Idempotency: create one event record per unique event ID.
    const eventId = getEventId(payload)

    webhookEvent = await VelocityWebhookEvent.findOne({ eventId })

    if (webhookEvent?.processingStatus === 'processed') {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: 'Event already processed'
      })
    }

    if (!webhookEvent) {
      try {
        webhookEvent = await VelocityWebhookEvent.create({
          eventId,
          eventType: payload.event || payload.event_type || '',
          shipmentId,
          awb,
          orderExternalId,
          payload,
          processingStatus: 'received'
        })
      } catch (error) {
        if (error.code !== 11000) throw error

        webhookEvent = await VelocityWebhookEvent.findOne({ eventId })

        if (webhookEvent?.processingStatus === 'processed') {
          return res.status(200).json({
            success: true,
            duplicate: true,
            message: 'Event already processed'
          })
        }

        if (!webhookEvent) throw error
      }
    } else {
      webhookEvent.processingStatus = 'received'
      webhookEvent.errorMessage = ''
      webhookEvent.payload = payload
      await webhookEvent.save()
    }

    // 4. Find the matching XAAJ order.
    const conditions = []

    if (shipmentId) {
      conditions.push({ velocityShipmentId: shipmentId })
    }

    if (awb) {
      conditions.push(
        { velocityAwb: awb },
        { trackingNumber: awb }
      )
    }

    if (velocityOrderId) {
      conditions.push({ velocityOrderId })
    }

    // order_external_id is a merchant reference. Match MongoDB _id only
    // when the value is actually a valid MongoDB ObjectId.
    if (orderExternalId && isValidObjectId(orderExternalId)) {
      conditions.push({ _id: orderExternalId })
    }

    if (!conditions.length) {
      throw new Error('No usable order identifier in webhook payload')
    }

    const order = await Order.findOne({ $or: conditions })

    if (!order) {
      throw new Error(
        `Order not found. Velocity order ID: ${velocityOrderId || 'n/a'}, shipment ID: ${shipmentId || 'n/a'}, AWB: ${awb || 'n/a'}`
      )
    }

    // 5. Extract status and timestamps.
    const rawStatus = String(data.status || data.shipment_status || '').trim()
    const rawSubStatus = String(data.sub_status || '').trim()
    const normalizedStatus = normalizeStatus(rawStatus)

    const eventDate =
      toValidDate(payload.event_timestamp) ||
      toValidDate(data.event_timestamp) ||
      new Date()

    const expectedDelivery = toValidDate(
      data.estimated_delivery_date || data.expected_delivery_date
    )

    const deliveredAt = toValidDate(data.delivered_at)

    // 6. Update tracking identifiers and shipment information.
    if (shipmentId) order.velocityShipmentId = shipmentId

    if (awb) {
      order.velocityAwb = awb
      order.trackingNumber = awb
    }

    const courierName = data.courier_name || data.carrier_name
    if (courierName) order.courierName = String(courierName).trim()

    const carrierId = data.courier_company_id || data.carrier_id
    if (carrierId) order.velocityCarrierId = String(carrierId)

    if (data.tracking_url) {
      order.velocityTrackingUrl = String(data.tracking_url)
    }

    if (rawStatus) order.velocityStatus = rawStatus
    if (rawSubStatus) order.velocitySubStatus = rawSubStatus
    if (expectedDelivery) order.velocityExpectedDelivery = expectedDelivery
    if (deliveredAt) order.velocityDeliveredAt = deliveredAt

    order.velocityLastSyncedAt = new Date()
    order.velocityLastEventId = eventId

    // 7. Update customer-facing status.
    // Never let a late webhook change an already-cancelled XAAJ order.
    if (normalizedStatus && order.status !== 'cancelled') {
      order.status = normalizedStatus
    }

    // 8. Add this event to history only once.
    // This also protects history from duplicate deliveries of the same event.
    const historyAlreadyHasEvent = (order.shippingHistory || []).some(
      historyItem => historyItem.eventId === eventId
    )

    if (!historyAlreadyHasEvent) {
      order.shippingHistory.push({
        status: rawStatus || 'updated',
        subStatus: rawSubStatus,
        description: rawSubStatus || rawStatus || 'Shipment updated',
        location: data.location || data.current_location || '',
        source: 'velocity',
        eventId,
        occurredAt: eventDate
      })
    }

    await order.save()

    // 9. Mark the webhook event processed only after the order is saved.
    webhookEvent.processingStatus = 'processed'
    webhookEvent.processedAt = new Date()
    webhookEvent.errorMessage = ''
    await webhookEvent.save()

    console.log(
      `[VELOCITY WEBHOOK] Order ${order._id} updated: ${rawStatus || 'tracking details'}`
    )

    return res.status(200).json({
      success: true,
      message: 'Shipment tracking updated successfully',
      orderId: String(order._id),
      status: order.status,
      velocityStatus: order.velocityStatus,
      duplicate: historyAlreadyHasEvent
    })
  } catch (error) {
    console.error('[VELOCITY WEBHOOK ERROR]', error.message)

    if (webhookEvent) {
      try {
        webhookEvent.processingStatus = 'failed'
        webhookEvent.errorMessage = error.message
        await webhookEvent.save()
      } catch (saveError) {
        console.error(
          '[VELOCITY WEBHOOK EVENT SAVE ERROR]',
          saveError.message
        )
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    })
  }
})

export default router
