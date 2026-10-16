import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

// ============================================================
// ADDRESS SCHEMA
// ============================================================

const addressSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      default: 'Home',
      maxlength: 30
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    line1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250
    },

    line2: {
      type: String,
      trim: true,
      default: '',
      maxlength: 250
    },

    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    state: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    postalCode: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{6}$/,
      maxlength: 6
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{10,15}$/,
      maxlength: 15
    }
  },
  {
    _id: true
  }
)

// ============================================================
// USER SCHEMA
// ============================================================

const userSchema = new mongoose.Schema(
  {
    // ========================================================
    // BASIC USER DETAILS
    // ========================================================

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false
    },

    // ========================================================
    // USER ROLE
    // ========================================================

    role: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer',
      index: true
    },

    // ========================================================
    // SAVED ADDRESSES
    // ========================================================

    addresses: {
      type: [addressSchema],
      default: []
    },

    // ========================================================
    // EMAIL VERIFICATION
    // ========================================================

    emailVerified: {
      type: Boolean,
      default: false,
      index: true
    },

    // Store hashed OTP, never plain OTP
    emailVerificationOtp: {
      type: String,
      select: false,
      default: ''
    },

    emailVerificationExpires: {
      type: Date,
      select: false,
      default: null
    },

    // ========================================================
    // PASSWORD RESET
    // ========================================================
    //
    // OTP is hashed before storing in MongoDB.
    // OTP expires after 10 minutes.
    //

    passwordResetOtp: {
      type: String,
      select: false,
      default: ''
    },

    passwordResetExpires: {
      type: Date,
      select: false,
      default: null
    },

    // ========================================================
    // ACCOUNT STATUS
    // ========================================================

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,

    // ========================================================
    // HIDE SENSITIVE DATA FROM JSON RESPONSE
    // ========================================================

    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password
        delete ret.emailVerificationOtp
        delete ret.emailVerificationExpires
        delete ret.passwordResetOtp
        delete ret.passwordResetExpires

        return ret
      }
    }
  }
)

// ============================================================
// PASSWORD HASHING
// ============================================================

userSchema.pre(
  'save',
  async function hashPassword() {
    if (!this.isModified('password')) return

    this.password =
      await bcrypt.hash(
        this.password,
        12
      )
  }
)

// ============================================================
// PASSWORD COMPARISON
// ============================================================

userSchema.methods.comparePassword =
  function comparePassword(value) {
    return bcrypt.compare(
      value,
      this.password
    )
  }

// ============================================================
// EMAIL NORMALIZATION
// ============================================================

userSchema.pre(
  'validate',
  function normalizeEmail() {
    if (this.email) {
      this.email =
        this.email.trim().toLowerCase()
    }
  }
)

// ============================================================
// INDEXES
// ============================================================

// Unique email index
userSchema.index(
  { email: 1 },
  { unique: true }
)

// Role + active status
userSchema.index({
  role: 1,
  isActive: 1
})

// Email verification + active status
userSchema.index({
  emailVerified: 1,
  isActive: 1
})

// ============================================================
// MODEL
// ============================================================

export default mongoose.model(
  'User',
  userSchema
)