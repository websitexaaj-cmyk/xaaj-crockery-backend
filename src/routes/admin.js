import { Router } from 'express'
import User from '../models/User.js'
import Product from '../models/Product.js'
import Order from '../models/Order.js'
import { asyncHandler, adminOnly, protect } from '../middleware/index.js'

const router = Router()
router.use(protect, adminOnly)
router.get('/dashboard', asyncHandler(async (_req, res) => {
  const [customers, products, orders, sales, statuses, lowStock] = await Promise.all([
    User.countDocuments({ role: 'customer' }),
    Product.countDocuments({ isActive: true }),
    Order.countDocuments(),
    Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Product.countDocuments({ isActive: true, stock: { $lte: 5 } })
  ])
  res.json({ success: true, data: { customers, products, orders, sales: sales[0]?.total || 0, statuses, lowStock } })
}))
router.get('/customers', asyncHandler(async (_req, res) => res.json({ success: true, data: await User.find({ role: 'customer' }).select('-password').sort({ createdAt: -1 }) })))
router.get('/products', asyncHandler(async (_req, res) => res.json({ success: true, data: await Product.find().sort({ createdAt: -1 }) })))
router.get('/orders', asyncHandler(async (_req, res) => res.json({ success: true, data: await Order.find().populate('user', 'name email').sort({ createdAt: -1 }) })))
export default router
