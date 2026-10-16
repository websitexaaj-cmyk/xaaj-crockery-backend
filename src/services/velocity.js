import axios from 'axios'

// ============================================================
// VELOCITY CONFIG
// ============================================================

const VELOCITY_BASE_URL =
  process.env.VELOCITY_BASE_URL ||
  'https://shazam.velocity.in'

let cachedToken = null
let tokenExpiresAt = 0

const VELOCITY_USERNAME =
  process.env.VELOCITY_USERNAME || ''

const VELOCITY_PASSWORD =
  process.env.VELOCITY_PASSWORD || ''

const TOKEN_BUFFER_MS =
  5 * 60 * 1000

// ============================================================
// GET VELOCITY TOKEN
// ============================================================

export async function getVelocityToken(
  forceRefresh = false
) {
  const now = Date.now()

  // ----------------------------------------------------------
  // USE CACHED TOKEN
  // ----------------------------------------------------------

  if (
    !forceRefresh &&
    cachedToken &&
    tokenExpiresAt >
      now + TOKEN_BUFFER_MS
  ) {
    return cachedToken
  }

  // ----------------------------------------------------------
  // CHECK CREDENTIALS
  // ----------------------------------------------------------

  if (
    !VELOCITY_USERNAME ||
    !VELOCITY_PASSWORD
  ) {
    throw Object.assign(
      new Error(
        'Velocity Shipping credentials are not configured'
      ),
      {
        statusCode: 503,
        code:
          'VELOCITY_NOT_CONFIGURED'
      }
    )
  }

  try {
    console.log(
      '[VELOCITY] Requesting fresh authentication token...'
    )

    const response =
      await axios.post(
        `${VELOCITY_BASE_URL}/custom/api/v1/auth-token`,
        {
          username:
            VELOCITY_USERNAME,

          password:
            VELOCITY_PASSWORD
        },
        {
          headers: {
            'Content-Type':
              'application/json'
          },

          timeout: 30000
        }
      )

    const token =
      response.data?.token

    const expiresAt =
      response.data?.expires_at

    if (!token) {
      throw new Error(
        'Velocity authentication succeeded but no token was returned'
      )
    }

    // --------------------------------------------------------
    // SAVE TOKEN
    // --------------------------------------------------------

    cachedToken = token

    if (expiresAt) {
      tokenExpiresAt =
        new Date(
          expiresAt
        ).getTime()
    } else {
      // Fallback: 23 hours
      tokenExpiresAt =
        Date.now() +
        23 * 60 * 60 * 1000
    }

    console.log(
      '[VELOCITY] Authentication successful. Fresh token received.'
    )

    return cachedToken

  } catch (error) {
    const status =
      error.response?.status

    const responseData =
      error.response?.data

    console.error(
      '[VELOCITY] Authentication failed:',
      {
        status,
        response:
          responseData,
        message:
          error.message
      }
    )

    const message =
      responseData?.error ||
      responseData?.message ||
      error.message ||
      'Velocity authentication failed'

    throw Object.assign(
      new Error(message),
      {
        statusCode:
          status || 502,

        code:
          'VELOCITY_AUTH_FAILED',

        velocityResponse:
          responseData
      }
    )
  }
}

// ============================================================
// COMMON VELOCITY REQUEST
//
// IMPORTANT:
// Velocity documentation says:
//
// Authorization: your_token_here
//
// So we intentionally send the token directly.
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

            // Velocity documentation:
            // Authorization: your_token_here
            Authorization:
              requestToken
          },

          data,

          params,

          timeout: 20000
        })

      return response
    }

  // ==========================================================
  // FIRST REQUEST
  // ==========================================================

  try {

    const response =
      await makeRequest(token)

    console.log(
      `[VELOCITY] ${endpoint} success`
    )

    return response.data

  } catch (error) {

    const status =
      error.response?.status

    const responseData =
      error.response?.data

    // ========================================================
    // 401 HANDLING
    // ========================================================

    if (status === 401) {

      console.warn(
        `[VELOCITY] ${endpoint} returned 401.`
      )

      console.warn(
        '[VELOCITY] Cached token may be invalid/revoked. Requesting a fresh token and retrying once...'
      )

      // ------------------------------------------------------
      // CLEAR OLD TOKEN
      // ------------------------------------------------------

      cachedToken = null
      tokenExpiresAt = 0

      try {

        // ----------------------------------------------------
        // GET FRESH TOKEN
        // ----------------------------------------------------

        token =
          await getVelocityToken(
            true
          )

        console.log(
          `[VELOCITY] Retrying ${endpoint} with fresh token...`
        )

        // ----------------------------------------------------
        // RETRY ONCE
        // ----------------------------------------------------

        const retryResponse =
          await makeRequest(token)

        console.log(
          `[VELOCITY] ${endpoint} retry successful`
        )

        return retryResponse.data

      } catch (retryError) {

        const retryStatus =
          retryError.response?.status

        const retryData =
          retryError.response?.data

        console.error(
          `[VELOCITY] ${endpoint} retry failed`,
          {
            status:
              retryStatus,

            response:
              retryData,

            message:
              retryError.message
          }
        )

        throw Object.assign(
          new Error(
            retryData?.message ||
            retryData?.error ||
            retryError.message ||
            'Velocity API retry failed'
          ),
          {
            statusCode:
              retryStatus || 502,

            code:
              'VELOCITY_API_ERROR',

            velocityResponse:
              retryData
          }
        )
      }
    }

    // ========================================================
    // NON-401 ERROR
    // ========================================================

    console.error(
      `[VELOCITY] ${endpoint} failed`,
      {
        status,

        response:
          responseData,

        message:
          error.message
      }
    )

    const message =
      responseData?.message ||
      responseData?.error ||
      error.message ||
      'Velocity API request failed'

    throw Object.assign(
      new Error(message),
      {
        statusCode:
          status || 502,

        code:
          'VELOCITY_API_ERROR',

        velocityResponse:
          responseData
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