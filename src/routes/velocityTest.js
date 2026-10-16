import { Router } from 'express'
import { getVelocityToken } from '../services/velocity.js'

const router = Router()

router.get('/test', async (req, res) => {
  try {
    const token = await getVelocityToken()

    res.json({
      success: true,
      message: 'Velocity API connected successfully',
      tokenReceived: Boolean(token)
    })
  } catch (error) {
    console.error(
      'Velocity test failed:',
      error?.response?.data || error?.message
    )

    res.status(500).json({
      success: false,
      message: 'Velocity API connection failed',
      error:
        error?.response?.data ||
        error?.message ||
        'Unknown error'
    })
  }
})

export default router