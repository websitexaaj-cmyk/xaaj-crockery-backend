import axios from 'axios'

// ============================================================
// VELOCITY CONFIG
// ============================================================

const VELOCITY_BASE_URL =
  process.env.VELOCITY_BASE_URL ||
  'https://shazam.velocity.in'

const VELOCITY_API_TOKEN =
  (process.env.VELOCITY_API_TOKEN || '')
    .trim()
    .replace(/^Bearer\s+/i, '')

// ============================================================
// GET VELOCITY DASHBOARD API KEY
// ============================================================

export async function getVelocityToken() {
  if (!VELOCITY_API_TOKEN) {
    throw Object.assign(
      new Error(
        'Velocity dashboard API key is not configured. Set VELOCITY_API_TOKEN in the backend environment.'
      ),
      {
        statusCode: 503,
        code: 'VELOCITY_NOT_CONFIGURED'
      }
    )
  }

  // Dashboard-generated keys are used directly; the old
  // username/password token-generation endpoint is no longer used.
  return VELOCITY_API_TOKEN
}

// ============================================================
// COMMON VELOCITY REQUEST
// Dashboard API keys use: Authorization: Bearer <your-token>
// ============================================================

export async function velocityRequest({
  method = 'POST',
  endpoint,
  data,
  params
}) {

  // ----------------------------------------------------------
  // FIRST TOKEN
  // ----------------------------------------------------------

  let token =
    await getVelocityToken()

  // ----------------------------------------------------------
  // INTERNAL REQUEST FUNCTION
  // ----------------------------------------------------------

  const makeRequest =
    async requestToken => {

      console.log(
        `[VELOCITY] ${method} ${endpoint}`
      )

      const response =
        await axios({
          method,

          url:
            `${VELOCITY_BASE_URL}${endpoint}`,

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${requestToken}`
          },

          data,

          params,

          timeout: 20000
        })

      return response
    }

  // ==========================================================
  // REQUEST + ERROR HANDLING
  // ==========================================================

  try {
    const response = await makeRequest(token)

    console.log(
      `[VELOCITY] ${endpoint} success`
    )

    return response.data
  } catch (error) {
    const status = error.response?.status
    const responseData = error.response?.data

    console.error(
      `[VELOCITY] ${endpoint} failed`,
      {
        status,
        response: responseData,
        message: error.message
      }
    )

    const message =
      status === 401
        ? 'Velocity API key was rejected (401). Generate or enable a valid key in the Velocity dashboard and update VELOCITY_API_TOKEN in the backend environment.'
        : responseData?.message ||
          responseData?.error ||
          error.message ||
          'Velocity API request failed'

    throw Object.assign(
      new Error(message),
      {
        statusCode: status || 502,
        code: status === 401
          ? 'VELOCITY_API_KEY_REJECTED'
          : 'VELOCITY_API_ERROR',
        velocityResponse: responseData
      }
    )
  }
}

// ============================================================
// SERVICEABILITY
// ============================================================

export async function checkServiceability({
  from,
  to,
  paymentMode,
  shipmentType = 'forward'
}) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/serviceability',

    data: {
      from: String(from),

      to: String(to),

      payment_mode:
        String(paymentMode)
          .toLowerCase(),

      shipment_type:
        String(shipmentType)
          .toLowerCase()
    }
  })
}

// ============================================================
// CREATE WAREHOUSE
// ============================================================

export async function createWarehouse(
  data
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/warehouse',

    data
  })
}

// ============================================================
// CREATE FORWARD SHIPMENT
// ============================================================

export async function createForwardShipment(
  data
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/forward-order-orchestration',

    data
  })
}

// ============================================================
// CREATE FORWARD ORDER ONLY
// ============================================================

export async function createForwardOrder(
  data
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/forward-order',

    data
  })
}

// ============================================================
// ASSIGN FORWARD COURIER
// ============================================================

export async function assignForwardShipment({
  shipmentId,
  carrierId = ''
}) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/forward-order-shipment',

    data: {
      shipment_id:
        shipmentId,

      carrier_id:
        carrierId
    }
  })
}

// ============================================================
// CREATE REVERSE / RETURN SHIPMENT
// ============================================================

export async function createReverseShipment(
  data
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/reverse-order-orchestration',

    data
  })
}

// ============================================================
// CREATE REVERSE ORDER ONLY
// ============================================================

export async function createReverseOrder(
  data
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/reverse-order',

    data
  })
}

// ============================================================
// ASSIGN REVERSE COURIER
// ============================================================

export async function assignReverseShipment({
  returnId,
  warehouseId,
  carrierId = ''
}) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/reverse-order-shipment',

    data: {
      return_id:
        returnId,

      warehouse_id:
        warehouseId,

      carrier_id:
        carrierId
    }
  })
}

// ============================================================
// CANCEL SHIPMENT
// ============================================================

export async function cancelVelocityShipments(
  awbs
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/cancel-order',

    data: {
      awbs
    }
  })
}

// ============================================================
// TRACK SHIPMENTS
// ============================================================

export async function trackVelocityShipments(
  awbs
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/order-tracking',

    data: {
      awbs
    }
  })
}

// ============================================================
// GET FORWARD SHIPMENTS
// ============================================================

export async function getVelocityShipments(
  filters = {}
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/shipments',

    data: {
      page: 1,

      per_page: 20,

      ...filters
    }
  })
}

// ============================================================
// GET RETURNS
// ============================================================

export async function getVelocityReturns(
  filters = {}
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/returns',

    data: {
      page: 1,

      per_page: 20,

      ...filters
    }
  })
}

// ============================================================
// GET RATES
// ============================================================

export async function getVelocityRates(
  data
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/rates',

    data
  })
}

// ============================================================
// SHIPPING CHARGES
// ============================================================

export async function getShippingCharges(
  awbs
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/shipping-charges',

    data: {
      awbs
    }
  })
}

// ============================================================
// COD REMITTANCE
// ============================================================

export async function getCodRemittance(
  awbs
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/cod-remittance',

    data: {
      awbs
    }
  })
}

// ============================================================
// REPORTS
// ============================================================

export async function getVelocityReport({
  startDateTime,
  endDateTime,
  shipmentType = 'forward'
}) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/reports',

    data: {
      start_date_time:
        startDateTime,

      end_date_time:
        endDateTime,

      shipment_type:
        shipmentType
    }
  })
}

// ============================================================
// REATTEMPT
// ============================================================

export async function reattemptVelocityShipment({
  awb,
  updatedAddress,
  updatedPhoneNumber,
  comments
}) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/reattempt',

    data: {
      awb,

      ...(updatedAddress
        ? {
            updated_address:
              updatedAddress
          }
        : {}),

      ...(updatedPhoneNumber
        ? {
            updated_phone_number:
              updatedPhoneNumber
          }
        : {}),

      ...(comments
        ? {
            comments
          }
        : {})
    }
  })
}

// ============================================================
// INITIATE RTO
// ============================================================

export async function initiateVelocityRto(
  awb
) {
  return velocityRequest({
    endpoint:
      '/custom/api/v1/initiate-rto',

    data: {
      awb
    }
  })
}

// ============================================================
// DEFAULT EXPORT
// ============================================================

export default {
  getVelocityToken,

  velocityRequest,

  checkServiceability,

  createWarehouse,

  createForwardShipment,

  createForwardOrder,

  assignForwardShipment,

  createReverseShipment,

  createReverseOrder,

  assignReverseShipment,

  cancelVelocityShipments,

  trackVelocityShipments,

  getVelocityShipments,

  getVelocityReturns,

  getVelocityRates,

  getShippingCharges,

  getCodRemittance,

  getVelocityReport,

  reattemptVelocityShipment,

  initiateVelocityRto
}