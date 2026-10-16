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
    cloud_name:
      process.env.CLOUDINARY_CLOUD_NAME,

    api_key:
      process.env.CLOUDINARY_API_KEY,

    api_secret:
      process.env.CLOUDINARY_API_SECRET
  })
}


// ============================================================
// CLOUDINARY - UPLOAD IMAGE
// ============================================================

export const uploadImage = async (
  file,
  folder = 'xaaj'
) => {
  if (!cloudinaryConfigured) {
    throw new Error(
      'Cloudinary is not configured'
    )
  }

  const result =
    await cloudinary.uploader.upload(
      file,
      {
        folder,
        resource_type: 'image'
      }
    )

  return {
    secure_url:
      result.secure_url,

    public_id:
      result.public_id
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
    throw new Error(
      'Cloudinary is not configured'
    )
  }

  const normalizedResourceType =
    ['image', 'video', 'auto'].includes(resourceType)
      ? resourceType
      : 'auto'

  // ----------------------------------------------------------
  // Buffer upload
  // ----------------------------------------------------------

  if (Buffer.isBuffer(file)) {
    const result =
      await new Promise((resolve, reject) => {
        const stream =
          cloudinary.uploader.upload_stream(
            {
              folder,
              resource_type:
                normalizedResourceType
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
      secure_url:
        result.secure_url,

      public_id:
        result.public_id,

      resource_type:
        result.resource_type,

      format:
        result.format
    }
  }

  // ----------------------------------------------------------
  // String / Data URI upload
  // ----------------------------------------------------------

  if (
    typeof file !== 'string' ||
    !file.trim()
  ) {
    throw new Error(
      'A valid image/video file is required'
    )
  }

  const result =
    await cloudinary.uploader.upload(
      file,
      {
        folder,
        resource_type:
          normalizedResourceType
      }
    )

  return {
    secure_url:
      result.secure_url,

    public_id:
      result.public_id,

    resource_type:
      result.resource_type,

    format:
      result.format
  }
}


// ============================================================
// CLOUDINARY - UPLOAD VIDEO
// ============================================================

export const uploadVideo = async (
  file,
  folder = 'xaaj/category-heroes'
) => {
  return uploadMedia(
    file,
    folder,
    'video'
  )
}


// ============================================================
// CLOUDINARY - DELETE IMAGE
// ============================================================

export const removeImage =
  async publicId => {
    if (
      !cloudinaryConfigured ||
      !publicId
    ) {
      return null
    }

    return cloudinary.uploader.destroy(
      publicId
    )
  }


// ============================================================
// CLOUDINARY - DELETE MEDIA
// ============================================================

export const removeMedia = async (
  publicId,
  resourceType = 'image'
) => {
  if (
    !cloudinaryConfigured ||
    !publicId
  ) {
    return null
  }

  const normalizedResourceType =
    resourceType === 'video'
      ? 'video'
      : 'image'

  return cloudinary.uploader.destroy(
    publicId,
    {
      resource_type:
        normalizedResourceType
    }
  )
}


// ============================================================
// RAZORPAY
// ============================================================

const razorpayConfigured = Boolean(
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET
)

export const razorpay =
  razorpayConfigured
    ? new Razorpay({
        key_id:
          process.env.RAZORPAY_KEY_ID,

        key_secret:
          process.env.RAZORPAY_KEY_SECRET
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

  const expectedSignature =
    crypto
      .createHmac(
        'sha256',
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(
        `${orderId}|${paymentId}`
      )
      .digest('hex')

  const expectedBuffer =
    Buffer.from(
      expectedSignature,
      'utf8'
    )

  const receivedBuffer =
    Buffer.from(
      String(signature),
      'utf8'
    )

  if (
    expectedBuffer.length !==
    receivedBuffer.length
  ) {
    return false
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    receivedBuffer
  )
}


// ============================================================
// SMTP / EMAIL
// ============================================================

const smtpConfigured = Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASSWORD
)


// ============================================================
// NODEMAILER
// ============================================================

export const mailer =
  smtpConfigured
    ? nodemailer.createTransport({
        host:
          process.env.SMTP_HOST,

        port:
          Number(
            process.env.SMTP_PORT
          ),

        secure:
          Number(
            process.env.SMTP_PORT
          ) === 465,

        auth: {
          user:
            process.env.SMTP_USER,

          pass:
            process.env.SMTP_PASSWORD
        }
      })
    : null


// ============================================================
// SEND EMAIL
// ============================================================

export const sendEmail = async ({
  to,
  subject,
  html,
  replyTo
}) => {

  if (!mailer) {
    console.warn(
      '[XAAJ] SMTP is not configured. Email was not sent.'
    )

    return null
  }

  if (
    !to ||
    !subject ||
    !html
  ) {
    throw new Error(
      'Email recipient, subject and HTML are required'
    )
  }

  const emailOptions = {
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER,

    to,

    subject,

    html
  }

  // Reply-To is used by contact/B2B enquiry emails.
  // When XAAJ replies to the admin notification,
  // the reply goes directly to the customer.

  if (replyTo) {
    emailOptions.replyTo =
      String(replyTo).trim().toLowerCase()
  }

  const result =
    await mailer.sendMail(
      emailOptions
    )

  console.log(
    `[XAAJ] Email sent successfully to ${to}`
  )

  return result
}