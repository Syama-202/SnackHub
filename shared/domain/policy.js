/**
 * Default delivery_policy config (doc 8.2, 8.4, 10.2, 10.3).
 * Starting values the admin can change, not facts.
 */
export const DEFAULT_POLICY = {
  version: 1,
  speedKmph: 20,
  roadFactor: 1.3,
  handoverMin: 2,
  acceptMin: 2,
  maxPromiseMin: 30,
  hot: { prepMin: [8, 12], maxKm: 3, maxRideMin: 12, riderCap: 1 },
  ambient: { prepMin: [3, 5], maxKm: 5, maxRideMin: 20, riderCap: 2 },
  offerTimeoutSec: 20,
  sellerAcceptTimeoutSec: 120,
  otpRevealM: 500,
  arrivalGeofenceM: 150,
  otpMaxAttempts: 3,
  graceMin: 2,
  lateRatePaisePerMin: 200,
  penaltyCapPaise: 2000,
  baseFeePaise: 2500,
  distanceFeePaisePerKm: 800,
  onTimeBonusPaise: 500,
  deliveryFeePaise: 2900,
  codEnabled: true,
};

export const tempRules = (policy, temp) => (temp === 'HOT' ? policy.hot : policy.ambient);
