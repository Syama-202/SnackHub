// dispatch.rider_vehicles: how the rider delivers. A bicycle has no registration number, and
// the documents asked for follow the mode (dispatch.document_requirements).
const TABLE = 'rider_vehicles';

const view = (r) => r && { mode: r.mode, registrationNo: r.registration_no, makeModel: r.make_model, ownedByRider: Boolean(r.owned_by_rider) };

export const riderVehicleModel = {
  find: (db, userId) => db(TABLE).where({ user_id: userId }).first().then(view),
  save: (db, userId, { mode, registrationNo = null, makeModel = null, ownedByRider = true }) =>
    db(TABLE)
      .insert({ user_id: userId, mode, registration_no: mode === 'bicycle' ? null : registrationNo, make_model: makeModel, owned_by_rider: ownedByRider })
      .onConflict('user_id')
      .merge(),
};
