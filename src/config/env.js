import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

// ============================================================
// LOAD ENVIRONMENT VARIABLES
// ============================================================

dotenv.config({
  path:
    process.env.DOTENV_CONFIG_PATH ||
    fileURLToPath(
      new URL('../../.env', import.meta.url)
    )
})

// ============================================================
// ENVIRONMENT CONFIGURATION
// ============================================================

export const env = {
  // ----------------------------------------------------------
  // Server
  // ----------------------------------------------------------

  port: Number(process.env.PORT || 5000),

  nodeEnv: process.env.NODE_ENV || 'development',

  // ----------------------------------------------------------
  // MongoDB
  // ----------------------------------------------------------

  mongoUri: process.env.MONGODB_URI || '',

  // ----------------------------------------------------------
  // JWT
  // ----------------------------------------------------------

  jwtSecret:
    process.env.JWT_SECRET || 'change-me-in-production',

  // ----------------------------------------------------------
  // Frontend URL
  // ----------------------------------------------------------

  clientUrl: (
    process.env.CLIENT_URL || 'http://localhost:5173'
  ).replace(/\/+$/, ''),

  // ----------------------------------------------------------
  // Cookie
  // ----------------------------------------------------------

  cookieSecret:
    process.env.COOKIE_SECRET || 'change-me-in-production',

  // ----------------------------------------------------------
  // Admin
  // ----------------------------------------------------------

  adminEmail:
    process.env.ADMIN_EMAIL || 'admin@xaaj.com',

  adminPassword:
    process.env.ADMIN_PASSWORD || 'change-me'
}

// ============================================================
// PRODUCTION CONFIGURATION CHECK
// ============================================================

export function assertProductionConfig() {
  if (env.nodeEnv !== 'production') {
    return
  }

  const requiredVariables = [
    'MONGODB_URI',
    'JWT_SECRET',
    'COOKIE_SECRET',
    'CLIENT_URL'
  ]

  const missing = requiredVariables.filter(
    variable => !process.env[variable]
  )

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(', ')}`
    )
  }
}