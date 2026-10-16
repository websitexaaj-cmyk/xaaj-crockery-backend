import '../src/config/env.js'
import { connectDatabase, disconnectDatabase } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import User from '../src/models/User.js'

await connectDatabase()
if (!env.mongoUri) throw new Error('MONGODB_URI is required to seed an admin')
const existing = await User.findOne({ email: env.adminEmail })
if (existing) { existing.role = 'admin'; existing.password = env.adminPassword; await existing.save(); console.log(`Updated admin ${env.adminEmail}`) }
else { await User.create({ name: 'XAAJ Admin', email: env.adminEmail, password: env.adminPassword, role: 'admin' }); console.log(`Created admin ${env.adminEmail}`) }
await disconnectDatabase()
