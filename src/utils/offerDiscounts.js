
const isOfferActive = (offer, now) => {
  if (!offer || offer.enabled !== true) return false
  if (offer.startDate && new Date(offer.startDate) > now) return false
  if (offer.endDate && new Date(offer.endDate) < now) return false
  return true
}

const discountFor = (offer, eligibleSubtotal) => {
  const value = Math.max(0, Number(offer.discountValue || 0))

  const raw = offer.discountType === 'percentage'
    ? eligibleSubtotal * value / 100
    : value

  return Math.min(
    eligibleSubtotal,
    Math.max(0, Math.round(raw))
  )
}

export const calculateAutomaticOfferDiscount = (
  items,
  offers,
  now = new Date()
) => {
  const normalizedItems = (items || []).map(item => ({
    id: String(item.product?._id || item.product || ''),
    quantity: Math.max(1, Number(item.quantity || 1)),
    price: Math.max(0, Number(item.price || 0))
  }))

  const subtotal = normalizedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  const activeOffers = (offers || []).filter(offer =>
    offer.type !== 'coupon' &&
    isOfferActive(offer, now) &&
    subtotal >= Number(offer.minimumPurchase || 0)
  )

  const candidates = []

  for (const offer of activeOffers) {
    let eligibleSubtotal = 0

    if (offer.type === 'site-wide') {
      eligibleSubtotal = subtotal
    } else if (offer.type === 'product-wise') {
      const selectedIds = new Set(
        (offer.productIds || []).map(id => String(id._id || id))
      )

      eligibleSubtotal = normalizedItems
        .filter(item => selectedIds.has(item.id))
        .reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        )
    } else if (offer.type === 'bundle') {
      const bundleIds = [
        ...new Set(
          (offer.bundleProductIds || []).map(id => String(id._id || id))
        )
      ]

      if (bundleIds.length < 2) continue

      const cartIds = new Set(normalizedItems.map(item => item.id))

      // All configured bundle products must be present in the cart.
      if (!bundleIds.every(id => cartIds.has(id))) continue

      const bundleQuantity = normalizedItems
        .filter(item => bundleIds.includes(item.id))
        .reduce((sum, item) => sum + item.quantity, 0)

      if (
        bundleQuantity <
        Math.max(1, Number(offer.minimumQuantity || 0))
      ) continue

      eligibleSubtotal = normalizedItems
        .filter(item => bundleIds.includes(item.id))
        .reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        )
    }

    if (eligibleSubtotal <= 0) continue

    const discount = discountFor(offer, eligibleSubtotal)

    if (discount > 0) {
      candidates.push({ offer, discount })
    }
  }

  // Apply the eligible offer with the largest discount.
  // Automatic offers are not stacked.
  candidates.sort((a, b) => b.discount - a.discount)

  const best = candidates[0]

  return {
    discount: best ? Math.min(subtotal, best.discount) : 0,

    appliedOffer: best
      ? {
          offerId: best.offer._id,
          type: best.offer.type,
          title: best.offer.title,
          discount: Math.min(subtotal, best.discount)
        }
      : null
  }
}
