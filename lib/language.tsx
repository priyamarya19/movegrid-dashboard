"use client";

import { createContext, useContext, useState, useEffect } from "react";

type Lang = "en" | "hi";

const t = {
  en: {
    nav: {
      dashboard: "Dashboard",
      leads: "Leads",
      riders: "Riders",
      vehicles: "Vehicles",
      hubs: "Hubs",
      investors: "Investors",
      portfolio: "My Portfolio",
      forms: "Forms",
      logs: "Audit Logs",
      settings: "Settings",
    },
    roles: {
      admin: "Admin",
      ops_manager: "Ops Manager",
      hub_incharge: "Hub Incharge",
      investor: "Investor",
    },
    signOut: "Sign out",
    addRider: "Add Rider",
    addVehicle: "Add Vehicle",
    addHub: "Add Hub",
    allotVehicle: "Allot Vehicle",
    vehicleReturn: "Vehicle Return",
    viewRiders: "View Riders",
    activeRiders: "Active Riders",
    pendingKyc: "Pending KYC",
    vehiclesDeployed: "Vehicles Deployed",
    availableVehicles: "Available Vehicles",
    quickActions: "Quick Actions",
    recentRiders: "Recent Riders",
    viewAll: "View all →",
    name: "Name",
    mobile: "Mobile",
    vehicle: "Vehicle",
    status: "Status",
    joined: "Joined",
    hub: "Hub",
    noRidersYet: "No riders yet",
    fleetUtilisation: "Fleet Utilisation",
    assigned: "Assigned",
    available: "Available",
    maintenance: "Maintenance",
    hubOverview: "Here's your hub overview for today",
    fleetOverview: "Fleet and rider overview",
    operationsDashboard: "Operations Dashboard",
  },
  hi: {
    nav: {
      dashboard: "डैशबोर्ड",
      leads: "लीड्स",
      riders: "राइडर्स",
      vehicles: "वाहन",
      hubs: "हब",
      investors: "निवेशक",
      portfolio: "मेरा पोर्टफोलियो",
      forms: "फॉर्म्स",
      logs: "ऑडिट लॉग्स",
      settings: "सेटिंग्स",
    },
    roles: {
      admin: "एडमिन",
      ops_manager: "ऑप्स मैनेजर",
      hub_incharge: "हब इंचार्ज",
      investor: "निवेशक",
    },
    signOut: "साइन आउट",
    addRider: "राइडर जोड़ें",
    addVehicle: "वाहन जोड़ें",
    addHub: "हब जोड़ें",
    allotVehicle: "वाहन आवंटित करें",
    vehicleReturn: "वाहन वापसी",
    viewRiders: "राइडर्स देखें",
    activeRiders: "सक्रिय राइडर्स",
    pendingKyc: "KYC लंबित",
    vehiclesDeployed: "तैनात वाहन",
    availableVehicles: "उपलब्ध वाहन",
    quickActions: "त्वरित कार्य",
    recentRiders: "हाल के राइडर्स",
    viewAll: "सभी देखें →",
    name: "नाम",
    mobile: "मोबाइल",
    vehicle: "वाहन",
    status: "स्थिति",
    joined: "जुड़े",
    hub: "हब",
    noRidersYet: "अभी कोई राइडर नहीं",
    fleetUtilisation: "फ्लीट उपयोग",
    assigned: "आवंटित",
    available: "उपलब्ध",
    maintenance: "रखरखाव",
    hubOverview: "आज का हब अवलोकन",
    fleetOverview: "फ्लीट और राइडर अवलोकन",
    operationsDashboard: "संचालन डैशबोर्ड",
  },
} as const;

const LanguageContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  tr: typeof t.en;
}>({ lang: "en", setLang: () => {}, tr: t.en });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem("mg_lang") as Lang | null;
    if (saved === "en" || saved === "hi") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("mg_lang", l);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, tr: t[lang] as typeof t.en }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
