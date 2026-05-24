const prefix = process.env.RDS_ENV === "uat" ? "uat_" : "";

export const schemas = {
  auth: `${prefix}auth`,
  leads: `${prefix}leads`,
  ops: `${prefix}ops`,
  logs: `${prefix}logs`,
};
