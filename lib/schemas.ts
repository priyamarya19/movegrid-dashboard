const isUAT = process.env.RDS_ENV === "uat";

export const schemas = {
  auth: isUAT ? "uat_auth" : "auth",
  leads: isUAT ? "uat_leads" : "leads",
  ops: isUAT ? "mg_data_uat" : "mg_data",
  logs: isUAT ? "uat_logs" : "logs",
};
