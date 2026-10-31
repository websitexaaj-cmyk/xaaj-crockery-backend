import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import nodemailer from 'nodemailer'
import { v2 as cloudinary } from 'cloudinary'

// ============================================================
// CLOUDINARY
// ============================================================

const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
)

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  })
}

// ============================================================
// CLOUDINARY - UPLOAD IMAGE
// ============================================================

export const uploadImage = async (file, folder = 'xaaj') => {
  if (!cloudinaryConfigured) {
    throw new Error('Cloudinary is not configured')
  }

  const result = await cloudinary.uploader.upload(file, {
    folder,
    resource_type: 'image'
  })

  return {
    secure_url: result.secure_url,
    public_id: result.public_id
  }
}

// ============================================================
// CLOUDINARY - UPLOAD MEDIA
// ============================================================

export const uploadMedia = async (
  file,
  folder = 'xaaj/category-heroes',
  resourceType = 'auto'
) => {
  if (!cloudinaryConfigured) {
    throw new Error('Cloudinary is not configured')
  }

  const normalizedResourceType =
    ['image', 'video', 'auto'].includes(resourceType)
      ? resourceType
      : 'auto'

  if (Buffer.isBuffer(file)) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: normalizedResourceType
        },
        (error, uploadResult) => {
          if (error) {
            reject(error)
            return
          }

          resolve(uploadResult)
        }
      )

      stream.end(file)
    })

    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format
    }
  }

  if (typeof file !== 'string' || !file.trim()) {
    throw new Error('A valid image/video file is required')
  }

  const result = await cloudinary.uploader.upload(file, {
    folder,
    resource_type: normalizedResourceType
  })

  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
    resource_type: result.resource_type,
    format: result.format
  }
}

// ============================================================
// CLOUDINARY - UPLOAD VIDEO
// ============================================================

export const uploadVideo = async (
  file,
  folder = 'xaaj/category-heroes'
) => {
  return uploadMedia(file, folder, 'video')
}

// ============================================================
// CLOUDINARY - DELETE IMAGE
// ============================================================

export const removeImage = async publicId => {
  if (!cloudinaryConfigured || !publicId) {
    return null
  }

  return cloudinary.uploader.destroy(publicId)
}

// ============================================================
// CLOUDINARY - DELETE MEDIA
// ============================================================

export const removeMedia = async (
  publicId,
  resourceType = 'image'
) => {
  if (!cloudinaryConfigured || !publicId) {
    return null
  }

  const normalizedResourceType =
    resourceType === 'video' ? 'video' : 'image'

  return cloudinary.uploader.destroy(publicId, {
    resource_type: normalizedResourceType
  })
}

// ============================================================
// RAZORPAY
// ============================================================

const razorpayConfigured = Boolean(
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET
)

export const razorpay = razorpayConfigured
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    })
  : null

// ============================================================
// VERIFY RAZORPAY SIGNATURE
// ============================================================

export const verifyRazorpaySignature = (
  orderId,
  paymentId,
  signature
) => {
  if (
    !process.env.RAZORPAY_KEY_SECRET ||
    !orderId ||
    !paymentId ||
    !signature
  ) {
    return false
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8')
  const receivedBuffer = Buffer.from(String(signature), 'utf8')

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

// ============================================================
// SMTP / EMAIL
// ============================================================

// Create the transporter lazily. This ensures environment variables
// are read when an email is sent, not when this module is first imported.
// It also supports applications that load dotenv during server startup.

export let mailer = null
let mailerConfigKey = ''

const getMailer = () => {
  const host = process.env.SMTP_HOST?.trim()
  const portValue = process.env.SMTP_PORT?.trim()
  const user = process.env.SMTP_USER?.trim()
  const password = process.env.SMTP_PASSWORD

  const missingVariables = [
    ['SMTP_HOST', host],
    ['SMTP_PORT', portValue],
    ['SMTP_USER', user],
    ['SMTP_PASSWORD', password]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missingVariables.length > 0) {
    throw new Error(
      `SMTP is not configured. Missing environment variable(s): ${missingVariables.join(', ')}`
    )
  }

  const port = Number(portValue)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid port number')
  }

  // SMTP_SECURE can explicitly override the default:
  // port 465 uses implicit TLS; ports such as 587 use STARTTLS.
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE.trim().toLowerCase() === 'true'
      : port === 465

  const currentConfigKey = [
    host,
    port,
    user,
    password,
    secure
  ].join('|')

  if (!mailer || mailerConfigKey !== currentConfigKey) {
    if (mailer) {
      mailer.close()
    }

    mailer = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass: password
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      ...(port === 587 && !secure
        ? { requireTLS: true }
        : {})
    })

    mailerConfigKey = currentConfigKey
  }

  return mailer
}

// ============================================================
// SEND EMAIL
// ============================================================

export const sendEmail = async ({ to, subject, html, replyTo }) => {
  if (!to || !subject || !html) {
    throw new Error('Email recipient, subject and HTML are required')
  }

  const transporter = getMailer()

  const emailOptions = {
    from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim(),
    to: String(to).trim(),
    subject,
    html
  }

  if (replyTo) {
    emailOptions.replyTo = String(replyTo).trim().toLowerCase()
  }

  try {
    const result = await transporter.sendMail(emailOptions)

    console.log('[XAAJ EMAIL] SMTP send result', {
      to: emailOptions.to,
      subject: emailOptions.subject,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response
    })

    if (Array.isArray(result.rejected) && result.rejected.length > 0) {
      throw new Error(
        `SMTP provider rejected recipient(s): ${result.rejected.join(', ')}`
      )
    }

    if (Array.isArray(result.accepted) && result.accepted.length === 0) {
      throw new Error('SMTP provider did not accept any recipients')
    }

    return result
  } catch (error) {
    console.error('[XAAJ EMAIL] Failed to send email', {
      to: emailOptions.to,
      subject: emailOptions.subject,
      code: error?.code,
      command: error?.command,
      responseCode: error?.responseCode,
      response: error?.response,
      message: error?.message
    })

    throw error
  }
}
