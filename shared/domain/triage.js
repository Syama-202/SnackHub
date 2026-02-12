/**
 * Complaint triage (doc 10.7) as a pure function over evidence the system
 * already holds. Returns fault, shares and a confidence score.
 */
export function triage({ subtype, evidence, rideLimitMin = 12 }) {
  const e = evidence;
  const packedToPickedMin = e.packedToPickedMin ?? 0;
  const rideMin = e.rideMin ?? 0;
  const share = () => {
    const total = (e.riderLateMin || 0) + (e.sellerDelayMin || 0);
    if (!total) return { rider: 0, seller: 0 };
    const rider = Math.round((100 * (e.riderLateMin || 0)) / total);
    return { rider, seller: 100 - rider };
  };

  switch (subtype) {
    case 'LATE': {
      const s = share();
      const fault = s.rider && s.seller ? 'BOTH' : s.rider ? 'DELIVERY' : s.seller ? 'FOOD_QUALITY' : 'UNCLEAR';
      return { classification: fault, riderSharePct: s.rider, sellerSharePct: s.seller, confidence: fault === 'UNCLEAR' ? 0.4 : 0.85 };
    }
    case 'NOT_HOT':
      if (packedToPickedMin > 10) return { classification: 'FOOD_QUALITY', sellerSharePct: 100, riderSharePct: 0, confidence: 0.8 };
      if (rideMin > rideLimitMin) return { classification: 'DELIVERY', riderSharePct: 100, sellerSharePct: 0, confidence: 0.8 };
      return { classification: 'UNCLEAR', riderSharePct: 0, sellerSharePct: 0, confidence: 0.35 };
    case 'WRONG_ITEM':
    case 'MISSING_ITEM':
    case 'STALE':
      return { classification: 'FOOD_QUALITY', sellerSharePct: 100, riderSharePct: 0, confidence: e.hasPhoto ? 0.9 : 0.5 };
    case 'DAMAGED':
      return e.pickupSealed
        ? { classification: 'DELIVERY', riderSharePct: 100, sellerSharePct: 0, confidence: 0.75 }
        : { classification: 'FOOD_QUALITY', sellerSharePct: 100, riderSharePct: 0, confidence: 0.75 };
    case 'NOT_RECEIVED':
      return e.otpVerified && e.geofencePassed
        ? { classification: 'INVALID', riderSharePct: 0, sellerSharePct: 0, confidence: 0.7 }
        : { classification: 'DELIVERY', riderSharePct: 100, sellerSharePct: 0, confidence: 0.7 };
    case 'RIDER_RUDE':
      return { classification: 'DELIVERY', riderSharePct: 100, sellerSharePct: 0, confidence: 0.3 };
    case 'UNSAFE':
      return { classification: 'FOOD_QUALITY', sellerSharePct: 100, riderSharePct: 0, confidence: 0, safety: true };
    default:
      return { classification: 'UNCLEAR', riderSharePct: 0, sellerSharePct: 0, confidence: 0.2 };
  }
}

/** Auto-resolve only when confident, cheap and safe (doc 10.7). */
export const canAutoResolve = (t, valuePaise, limitPaise = 30000) => !t.safety && t.confidence >= 0.8 && valuePaise <= limitPaise;

export const COMPLAINT_TYPES = {
  FOOD_QUALITY: { label: 'Food quality', window: '2 hours after delivery', photos: true, subtypes: { STALE: 'Stale', NOT_HOT: 'Not hot', WRONG_ITEM: 'Wrong item', MISSING_ITEM: 'Missing item', DAMAGED: 'Damaged or spilled', UNSAFE: 'Unsafe to eat' } },
  DELIVERY: { label: 'Delivery', window: '24 hours', photos: false, subtypes: { LATE: 'Late', RIDER_RUDE: 'Rider was rude', NOT_RECEIVED: 'Marked delivered but not received', WRONG_DROP: 'Wrong drop point' } },
  OTHER: { label: 'Other', window: '24 hours', photos: false, subtypes: { APP: 'App problem' } },
};
