import { Router } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'

import User from '../models/User.js'
import { env } from '../config/env.js'

import {
  asyncHandler,
  protect,
  registerSchema,
  loginSchema,
  validate
} from '../middleware/index.js'

import { sendEmail } from '../services/integrations.js'

const router = Router()

// ============================================================
// JWT TOKEN
// ============================================================

const tokenFor = user =>
  jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      email: user.email
    },
    env.jwtSecret,
    {
      expiresIn: '7d'
    }
  )

// ============================================================
// PASSWORD RESET TOKEN
// ============================================================

const passwordResetTokenFor = user =>
  jwt.sign(
    {
      id: user._id.toString(),
      purpose: 'password-reset'
    },
    env.jwtSecret,
    {
      expiresIn: '10m'
    }
  )

// ============================================================
// LOGIN RESPONSE
// ============================================================

const send = (res, user, status = 200) =>
  res.status(status).json({
    success: true,
    token: tokenFor(user),
    user
  })

// ============================================================
// GENERATE 6 DIGIT OTP
// ============================================================

const generateOtp = () =>
  crypto.randomInt(100000, 1000000).toString()

// ============================================================
// HASH OTP
// ============================================================

const hashOtp = otp =>
  crypto
    .createHash('sha256')
    .update(otp)
    .digest('hex')

// ============================================================
// SEND VERIFICATION EMAIL
// ============================================================

const sendVerificationEmail = async (user, otp) => {
  await sendEmail({
    to: user.email,

    subject: 'XAAJ - Verify Your Email',

    html: `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 600px;
        margin: 0 auto;
        padding: 30px 20px;
        line-height: 1.6;
        color: #222;
      ">

        <h2 style="margin-bottom: 10px;">
          Welcome to XAAJ!
        </h2>

        <p>
          Hi <strong>${user.name}</strong>,
        </p>

        <p>
          Thank you for creating your XAAJ account.
          Please verify your email address using the OTP below.
        </p>

        <div style="
          margin: 25px 0;
          padding: 20px;
          text-align: center;
          background: #f7f7f7;
          border-radius: 12px;
        ">

          <p style="
            margin: 0 0 8px;
            font-size: 14px;
            color: #666;
          ">
            Your verification code
          </p>

          <div style="
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
          ">
            ${otp}
          </div>

        </div>

        <p>
          This OTP is valid for <strong>10 minutes</strong>.
        </p>

        <p>
          If you did not create this account, you can safely ignore
          this email.
        </p>

        <p style="margin-top: 30px;">
          Thank you,<br />
          <strong>XAAJ Team</strong>
        </p>

      </div>
    `
  })
}

// ============================================================
// SEND PASSWORD RESET OTP EMAIL
// ============================================================

const sendPasswordResetEmail = async (user, otp) => {
  await sendEmail({
    to: user.email,

    subject: 'XAAJ - Password Reset OTP',

    html: `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 600px;
        margin: 0 auto;
        padding: 30px 20px;
        line-height: 1.6;
        color: #222;
      ">

        <h2 style="margin-bottom: 10px;">
          Reset Your XAAJ Password
        </h2>

        <p>
          Hi <strong>${user.name}</strong>,
        </p>

        <p>
          We received a request to reset your XAAJ account password.
          Use the OTP below to continue.
        </p>

        <div style="
          margin: 25px 0;
          padding: 20px;
          text-align: center;
          background: #f7f7f7;
          border-radius: 12px;
        ">

          <p style="
            margin: 0 0 8px;
            font-size: 14px;
            color: #666;
          ">
            Your password reset OTP
          </p>

          <div style="
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
          ">
            ${otp}
          </div>

        </div>

        <p>
          This OTP is valid for <strong>10 minutes</strong>.
        </p>

        <p>
          If you did not request a password reset,
          you can safely ignore this email.
        </p>

        <p style="margin-top: 30px;">
          Thank you,<br />
          <strong>XAAJ Team</strong>
        </p>

      </div>
    `
  })
}

// ============================================================
// REGISTER
// ============================================================

router.post(
  '/register',
  validate(registerSchema),

  asyncHandler(async (req, res) => {
    const {
      name,
      email,
      password,
      phone,
      address,
      city,
      state,
      pin
    } = req.validated.body

    const normalizedEmail = String(email)
      .trim()
      .toLowerCase()

    // ----------------------------------------------------------
    // CHECK EXISTING EMAIL
    // ----------------------------------------------------------

    const exists = await User.findOne({
      email: normalizedEmail
    })

    // ----------------------------------------------------------
    // EXISTING BUT NOT VERIFIED
    // ----------------------------------------------------------

    if (exists && !exists.emailVerified) {
      const otp = generateOtp()

      exists.emailVerificationOtp =
        hashOtp(otp)

      exists.emailVerificationExpires =
        new Date(
          Date.now() + 10 * 60 * 1000
        )

      await exists.save()

      await sendVerificationEmail(
        exists,
        otp
      )

      return res.status(200).json({
        success: true,
        requiresEmailVerification: true,
        email: exists.email,
        message:
          'Your account is not verified. A new OTP has been sent to your email.'
      })
    }

    // ----------------------------------------------------------
    // EXISTING VERIFIED ACCOUNT
    // ----------------------------------------------------------

    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      })
    }

    // ----------------------------------------------------------
    // GENERATE OTP
    // ----------------------------------------------------------

    const otp = generateOtp()

    // ----------------------------------------------------------
    // CREATE SAVED ADDRESS
    // ----------------------------------------------------------

    const savedAddress = {
      label: 'Home',
      name: name.trim(),
      line1: address.trim(),
      line2: '',
      city: city.trim(),
      state: state.trim(),
      postalCode: pin.trim(),
      phone: phone.trim()
    }

    // ----------------------------------------------------------
    // CREATE USER
    // ----------------------------------------------------------

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,

      addresses: [savedAddress],

      emailVerified: false,

      emailVerificationOtp:
        hashOtp(otp),

      emailVerificationExpires:
        new Date(
          Date.now() + 10 * 60 * 1000
        )
    })

    // ----------------------------------------------------------
    // SEND OTP EMAIL
    // ----------------------------------------------------------

    await sendVerificationEmail(
      user,
      otp
    )

    // ----------------------------------------------------------
    // ACCOUNT CREATED BUT NOT LOGGED IN
    // ----------------------------------------------------------

    return res.status(201).json({
      success: true,
      requiresEmailVerification: true,
      email: user.email,
      message:
        'Account created. Please verify your email using the OTP sent to your email.'
    })
  })
)

// ============================================================
// VERIFY EMAIL
// ============================================================

router.post(
  '/verify-email',

  asyncHandler(async (req, res) => {
    const email = String(
      req.body.email || ''
    )
      .trim()
      .toLowerCase()

    const otp = String(
      req.body.otp || ''
    ).trim()

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      })
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message:
          'OTP must be a 6-digit number'
      })
    }

    // ----------------------------------------------------------
    // FIND USER WITH OTP
    // ----------------------------------------------------------

    const user = await User.findOne({
      email
    }).select(
      '+emailVerificationOtp +emailVerificationExpires'
    )

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid verification request'
      })
    }

    // ----------------------------------------------------------
    // ALREADY VERIFIED
    // ----------------------------------------------------------

    if (user.emailVerified) {
      return send(res, user)
    }

    // ----------------------------------------------------------
    // CHECK OTP EXPIRY
    // ----------------------------------------------------------

    if (
      !user.emailVerificationExpires ||
      user.emailVerificationExpires < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message:
          'OTP has expired. Please request a new OTP.'
      })
    }

    // ----------------------------------------------------------
    // CHECK OTP
    // ----------------------------------------------------------

    const hashedOtp = hashOtp(otp)

    if (
      hashedOtp !==
      user.emailVerificationOtp
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      })
    }

    // ----------------------------------------------------------
    // VERIFY ACCOUNT
    // ----------------------------------------------------------

    user.emailVerified = true
    user.emailVerificationOtp = ''
    user.emailVerificationExpires = null

    await user.save()

    // ----------------------------------------------------------
    // AUTO LOGIN
    // ----------------------------------------------------------

    return send(res, user)
  })
)

// ============================================================
// RESEND VERIFICATION OTP
// ============================================================

router.post(
  '/resend-verification',

  asyncHandler(async (req, res) => {
    const email = String(
      req.body.email || ''
    )
      .trim()
      .toLowerCase()

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      })
    }

    const user = await User.findOne({
      email
    })

    // ----------------------------------------------------------
    // DO NOT REVEAL WHETHER ACCOUNT EXISTS
    // ----------------------------------------------------------

    if (!user) {
      return res.json({
        success: true,
        message:
          'If the account exists and is not verified, a new OTP has been sent.'
      })
    }

    if (user.emailVerified) {
      return res.json({
        success: true,
        message:
          'Email is already verified. You can login normally.'
      })
    }

    const otp = generateOtp()

    user.emailVerificationOtp =
      hashOtp(otp)

    user.emailVerificationExpires =
      new Date(
        Date.now() + 10 * 60 * 1000
      )

    await user.save()

    await sendVerificationEmail(
      user,
      otp
    )

    return res.json({
      success: true,
      requiresEmailVerification: true,
      email: user.email,
      message:
        'A new verification OTP has been sent.'
    })
  })
)

// ============================================================
// LOGIN
// ============================================================

router.post(
  '/login',
  validate(loginSchema),

  asyncHandler(async (req, res) => {
    const {
      email,
      password
    } = req.validated.body

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase()

    const user = await User.findOne({
      email: normalizedEmail
    }).select('+password')

    // ----------------------------------------------------------
    // INVALID LOGIN
    // ----------------------------------------------------------

    if (
      !user ||
      !(await user.comparePassword(password))
    ) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid email or password'
      })
    }

    // ----------------------------------------------------------
    // EMAIL NOT VERIFIED
    // ----------------------------------------------------------

    if (
      !user.emailVerified &&
      user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        requiresEmailVerification: true,
        email: user.email,
        message:
          'Please verify your email before logging in.'
      })
    }

    // ----------------------------------------------------------
    // UPDATE LAST LOGIN
    // ----------------------------------------------------------

    user.lastLoginAt = new Date()

    await user.save()

    return send(res, user)
  })
)

// ============================================================
// CURRENT USER
// ============================================================

router.get(
  '/me',
  protect,

  asyncHandler(async (req, res) => {
    const user =
      await User.findById(req.user.id)

    res.json({
      success: true,
      user
    })
  })
)

// ============================================================
// FORGOT PASSWORD
// ============================================================
//
// Email
//   ↓
// Generate 6-digit OTP
//   ↓
// Hash OTP
//   ↓
// Save OTP for 10 minutes
//   ↓
// Send OTP to email
//
// ============================================================

router.post(
  '/forgot-password',

  asyncHandler(async (req, res) => {
    const email = String(
      req.body.email || ''
    )
      .trim()
      .toLowerCase()

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      })
    }

    const user = await User.findOne({
      email
    })

    // ----------------------------------------------------------
    // GENERIC RESPONSE
    // Prevent account enumeration
    // ----------------------------------------------------------

    if (
      !user ||
      !user.isActive ||
      !user.emailVerified
    ) {
      return res.json({
        success: true,
        message:
          'If the account exists, a password reset OTP has been sent to your email.'
      })
    }

    // ----------------------------------------------------------
    // GENERATE RESET OTP
    // ----------------------------------------------------------

    const otp = generateOtp()

    user.passwordResetOtp =
      hashOtp(otp)

    user.passwordResetExpires =
      new Date(
        Date.now() + 10 * 60 * 1000
      )

    await user.save()

    // ----------------------------------------------------------
    // SEND RESET OTP
    // ----------------------------------------------------------

    await sendPasswordResetEmail(
      user,
      otp
    )

    return res.json({
      success: true,
      message:
        'If the account exists, a password reset OTP has been sent to your email.'
    })
  })
)

// ============================================================
// VERIFY PASSWORD RESET OTP
// ============================================================
//
// Email + OTP
//   ↓
// Verify OTP
//   ↓
// Return short-lived reset token
//
// ============================================================

router.post(
  '/verify-reset-otp',

  asyncHandler(async (req, res) => {
    const email = String(
      req.body.email || ''
    )
      .trim()
      .toLowerCase()

    const otp = String(
      req.body.otp || ''
    ).trim()

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message:
          'Email and OTP are required'
      })
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message:
          'OTP must be a 6-digit number'
      })
    }

    // ----------------------------------------------------------
    // FIND USER + RESET OTP
    // ----------------------------------------------------------

    const user =
      await User.findOne({
        email
      }).select(
        '+passwordResetOtp +passwordResetExpires'
      )

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid or expired OTP'
      })
    }

    // ----------------------------------------------------------
    // CHECK EXPIRY
    // ----------------------------------------------------------

    if (
      !user.passwordResetExpires ||
      user.passwordResetExpires < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message:
          'OTP has expired. Please request a new OTP.'
      })
    }

    // ----------------------------------------------------------
    // CHECK OTP
    // ----------------------------------------------------------

    const hashedOtp = hashOtp(otp)

    if (
      hashedOtp !==
      user.passwordResetOtp
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      })
    }

    // ----------------------------------------------------------
    // OTP VERIFIED
    // ----------------------------------------------------------
    //
    // OTP is cleared so it cannot be reused.
    // A short-lived reset session is created.
    //
    // ----------------------------------------------------------

    user.passwordResetOtp = ''

    // Keep reset session active for 10 minutes.
    user.passwordResetExpires =
      new Date(
        Date.now() + 10 * 60 * 1000
      )

    await user.save()

    const resetToken =
      passwordResetTokenFor(user)

    return res.json({
      success: true,
      resetToken,
      message:
        'OTP verified. You can now reset your password.'
    })
  })
)

// ============================================================
// RESET PASSWORD
// ============================================================
//
// Requires:
// - Email
// - Reset token received after OTP verification
// - New password
// - Confirm password
//
// ============================================================

router.post(
  '/reset-password',

  asyncHandler(async (req, res) => {
    const email = String(
      req.body.email || ''
    )
      .trim()
      .toLowerCase()

    const resetToken =
      String(
        req.body.resetToken || ''
      ).trim()

    const password =
      String(
        req.body.newPassword ||
        req.body.password ||
        ''
      )

    const confirmPassword =
      String(
        req.body.confirmPassword ||
        ''
      )

    // ----------------------------------------------------------
    // REQUIRED FIELDS
    // ----------------------------------------------------------

    if (
      !email ||
      !resetToken ||
      !password ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Email, reset token, new password and confirm password are required'
      })
    }

    // ----------------------------------------------------------
    // PASSWORD LENGTH
    // ----------------------------------------------------------

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          'Password must be at least 8 characters'
      })
    }

    // ----------------------------------------------------------
    // PASSWORD MATCH
    // ----------------------------------------------------------

    if (
      password !== confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Passwords do not match'
      })
    }

    // ----------------------------------------------------------
    // VERIFY RESET TOKEN
    // ----------------------------------------------------------

    let decoded

    try {
      decoded =
        jwt.verify(
          resetToken,
          env.jwtSecret
        )
    } catch {
      return res.status(400).json({
        success: false,
        message:
          'Reset session has expired. Please request a new OTP.'
      })
    }

    // ----------------------------------------------------------
    // CHECK TOKEN PURPOSE
    // ----------------------------------------------------------

    if (
      decoded?.purpose !==
      'password-reset'
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid password reset token'
      })
    }

    // ----------------------------------------------------------
    // FIND USER
    // IMPORTANT:
    // passwordResetExpires has select:false
    // so explicitly select it here.
    // ----------------------------------------------------------

    const user =
      await User.findById(decoded.id).select(
        '+passwordResetOtp +passwordResetExpires'
      )

    if (
      !user ||
      !user.isActive ||
      !user.emailVerified ||
      user.email !== email
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid password reset request'
      })
    }

    // ----------------------------------------------------------
    // CHECK RESET SESSION EXPIRY
    // ----------------------------------------------------------

    if (
      !user.passwordResetExpires ||
      user.passwordResetExpires < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Reset session has expired. Please request a new OTP.'
      })
    }

    // ----------------------------------------------------------
    // SAVE NEW PASSWORD
    // ----------------------------------------------------------
    //
    // bcrypt hashing happens automatically
    // in User model pre-save middleware.
    //
    // ----------------------------------------------------------

    user.password = password

    // Make reset session single-use.
    user.passwordResetOtp = ''
    user.passwordResetExpires = null

    await user.save()

    return res.json({
      success: true,
      message:
        'Password updated successfully. You can now login with your new password.'
    })
  })
)

// ============================================================
// LOGOUT
// ============================================================

router.post(
  '/logout',

  (_req, res) =>
    res.json({
      success: true,
      message:
        'Logged out successfully'
    })
)

// ============================================================
// EXPORT
// ============================================================

export default router