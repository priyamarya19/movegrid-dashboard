// The cut-off, in one place both the TypeScript app and the plain-node scripts
// can read. lib/rentStart.ts imports it so there is exactly one number: a
// script correcting stored dates must use the same boundary the app applies
// when writing new ones, or it will "fix" rows into disagreement.
module.exports.RENT_START_CUTOFF_HOUR = 14;
