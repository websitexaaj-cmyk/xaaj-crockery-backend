import mongoose from 'mongoose'
import dns from 'node:dns'
import { env } from './env.js'

export async function connectDatabase() {
  if (!env.mongoUri) {
    console.warn(
      '[XAAJ] MONGODB_URI is not configured; API will start without a database connection.'
    )
    return null
  }

  mongoose.set('strictQuery', true)

  // Use an explicit DNS resolver for MongoDB SRV lookups.
  // The current local resolver (127.0.0.1) is refusing Node.js SRV queries.
  // This can be removed if the system DNS resolver is fixed.
  dns.setServers(['8.8.8.8', '8.8.4.4'])

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000
    })

    console.log('[XAAJ] MongoDB connected')

    return mongoose.connection
  } catch (error) {
    console.error('[XAAJ] MongoDB connection failed:', error.message)
    throw error
  }
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
    console.log('[XAAJ] MongoDB disconnected')
  }
}
