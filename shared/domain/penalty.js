/**
 * Rider pay and the lateness cut (doc 8.4, 8.4a). Money is integer paise.
 *
 * rider_late_min = max(0, late - seller_delay - customer_delay - exceptional - grace)
 * penalty        = min(rate x rider_late_min, cap, delivery fee)
 * net            = max(0, base + distance + bonus - penalty)
 */
export function riderLateMin({ lateMin, sellerDelayMin = 0, customerDelayMin = 0, exceptionalMin = 0, graceMin = 0 }) {
  return Math.max(0, lateMin - sellerDelayMin - customerDelayMin - exceptionalMin - graceMin);
}

export function computeEarning({ km, lateMin, sellerDelayMin = 0, customerDelayMin = 0, exceptionalMin = 0 }, policy) {
  const riderLate = riderLateMin({ lateMin, sellerDelayMin, customerDelayMin, exceptionalMin, graceMin: policy.graceMin });
  const base = policy.baseFeePaise;
  const distance = Math.round(policy.distanceFeePaisePerKm * km);
  const bonus = lateMin <= 0 ? policy.onTimeBonusPaise : 0;
  const penalty = Math.round(Math.min(policy.lateRatePaisePerMin * riderLate, policy.penaltyCapPaise, policy.deliveryFeePaise));
  const net = Math.max(0, base + distance + bonus - penalty);
  return {
    basePaise: base,
    distancePaise: distance,
    bonusPaise: bonus,
    penaltyPaise: penalty,
    netPaise: net,
    inputs: { lateMin, sellerDelayMin, customerDelayMin, exceptionalMin, graceMin: policy.graceMin, riderLateMin: riderLate, ratePaisePerMin: policy.lateRatePaisePerMin, capPaise: policy.penaltyCapPaise, policyVersion: policy.version },
  };
}
