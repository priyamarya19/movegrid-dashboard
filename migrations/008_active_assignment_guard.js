// DB backstop: at most one active assignment per vehicle (prevents double
// allotment even if some path skips the SELECT ... FOR UPDATE lock).
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_assignment_per_vehicle
    ON ${S}.rider_vehicle_assignments (vehicle_id) WHERE status = 'active'`);
};
