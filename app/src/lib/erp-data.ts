// Fake accounts-payable sandbox. All data is invented.

export type CostCenter = "4711" | "0400" | "4720" | "6100";

export const COST_CENTERS: Record<CostCenter, string> = {
  "4711": "4711 · Opex · Production",
  "0400": "0400 · Capex · Equipment",
  "4720": "4720 · Opex · Logistics",
  "6100": "6100 · Opex · External services",
};

export type Approval = "standard" | "second";
export type Status = "open" | "held" | "approved";

export interface Invoice {
  id: string;
  supplier: string;
  country: string;
  contact: string; // PII on screen, for the privacy demo
  iban: string; // PII on screen, for the privacy demo
  date: string;
  dueDate: string;
  amount: number;
  description: string;
  lines: { text: string; amount: number }[];
  costCenter: CostCenter;
  assetNumber: string;
  approval: Approval;
  status: Status;
  note: string;
  history: string[];
  tag?: string;
}

export const EXPERT_INVOICES: Invoice[] = [
  {
    id: "INV-4471",
    supplier: "Müller Maschinenbau GmbH",
    country: "DE",
    contact: "Jürgen Hoffmann · j.hoffmann@mueller-mb.example",
    iban: "DE89 3704 0044 0532 0130 00",
    date: "2026-12-14",
    dueDate: "2027-01-13",
    amount: 7850,
    description: "Hydraulic press unit HP-220, delivered and installed",
    lines: [
      { text: "Hydraulic press unit HP-220", amount: 7200 },
      { text: "Installation and commissioning", amount: 650 },
    ],
    costCenter: "4711",
    assetNumber: "",
    approval: "standard",
    status: "open",
    note: "",
    history: ["Received 2026-12-15 via e-invoice", "Pre-coded by OCR: 4711"],
  },
  {
    id: "INV-4472",
    supplier: "Schwarz Logistik KG",
    country: "DE",
    contact: "Petra Schwarz · buchhaltung@schwarz-log.example",
    iban: "DE02 1203 0000 0000 2020 51",
    date: "2026-12-10",
    dueDate: "2026-12-31",
    amount: 1240,
    description: "Monthly freight, December",
    lines: [{ text: "Freight services December 2026", amount: 1240 }],
    costCenter: "4720",
    assetNumber: "",
    approval: "standard",
    status: "open",
    note: "",
    history: ["Received 2026-12-11", "Nov invoice INV-4402 paid 2026-12-02 (€1,240)"],
  },
  {
    id: "INV-4473",
    supplier: "Novák Strojírna s.r.o.",
    country: "CZ",
    contact: "Tomáš Novák · fakturace@novak-str.example",
    iban: "CZ65 0800 0000 1920 0014 5399",
    date: "2026-12-12",
    dueDate: "2027-01-11",
    amount: 3900,
    description: "Engineering support, intercompany",
    lines: [{ text: "Engineering support Q4, 30 h", amount: 3900 }],
    costCenter: "6100",
    assetNumber: "",
    approval: "standard",
    status: "open",
    note: "",
    history: ["Received 2026-12-13", "Supplier flagged: group subsidiary (CZ)"],
  },
];

// The case the expert never showed. The new hire works this one.
export const NEWHIRE_INVOICES: Invoice[] = [
  {
    id: "INV-4480",
    supplier: "Bauer Technik AG",
    country: "DE",
    contact: "Sabrina Keller · ap@bauer-technik.example",
    iban: "DE44 5001 0517 5407 3249 31",
    date: "2026-12-18",
    dueDate: "2027-01-17",
    amount: 7200,
    description: "CNC spindle motor, replacement",
    lines: [{ text: "CNC spindle motor SM-900", amount: 7200 }],
    costCenter: "4711",
    assetNumber: "",
    approval: "standard",
    status: "open",
    note: "",
    history: ["Received 2026-12-19 via e-invoice", "Pre-coded by OCR: 4711"],
  },
  {
    id: "INV-4481",
    supplier: "Schwarz Logistik KG",
    country: "DE",
    contact: "Petra Schwarz · buchhaltung@schwarz-log.example",
    iban: "DE02 1203 0000 0000 2020 51",
    date: "2026-12-19",
    dueDate: "2027-01-08",
    amount: 1240,
    description: "Freight, December (supplementary)",
    lines: [{ text: "Freight services December 2026", amount: 1240 }],
    costCenter: "4720",
    assetNumber: "",
    approval: "standard",
    status: "open",
    note: "",
    history: ["Received 2026-12-19", "INV-4472 from same supplier currently on hold"],
  },
];

// The routine queue an agent works through after the Work Map exists. One of them has no rule yet.
export const AGENT_INVOICES: Invoice[] = [
  {
    id: "INV-4490",
    supplier: "Müller Maschinenbau GmbH",
    country: "DE",
    contact: "Jürgen Hoffmann · j.hoffmann@mueller-mb.example",
    iban: "DE89 3704 0044 0532 0130 00",
    date: "2026-12-20",
    dueDate: "2027-01-19",
    amount: 6400,
    description: "Spindle drive unit SD-40, asset AN-2026-0203",
    lines: [{ text: "Spindle drive unit SD-40 (asset AN-2026-0203)", amount: 6400 }],
    costCenter: "4711",
    assetNumber: "",
    approval: "standard",
    status: "open",
    note: "",
    history: ["Received 2026-12-21 via e-invoice", "Pre-coded by OCR: 4711"],
  },
  {
    id: "INV-4491",
    supplier: "Schwarz Logistik KG",
    country: "DE",
    contact: "Petra Schwarz · buchhaltung@schwarz-log.example",
    iban: "DE02 1203 0000 0000 2020 51",
    date: "2026-12-22",
    dueDate: "2027-01-12",
    amount: 1240,
    description: "Freight services December 2026",
    lines: [{ text: "Freight services December 2026", amount: 1240 }],
    costCenter: "4720",
    assetNumber: "",
    approval: "standard",
    status: "open",
    note: "",
    history: ["Received 2026-12-22", "INV-4472 from the same supplier was held this month"],
  },
  {
    id: "INV-4492",
    supplier: "Novák Strojírna s.r.o.",
    country: "CZ",
    contact: "Tomáš Novák · fakturace@novak-str.example",
    iban: "CZ65 0800 0000 1920 0014 5399",
    date: "2026-12-22",
    dueDate: "2027-01-21",
    amount: 2100,
    description: "Engineering support, intercompany, December",
    lines: [{ text: "Engineering support, 16 h", amount: 2100 }],
    costCenter: "6100",
    assetNumber: "",
    approval: "standard",
    status: "open",
    note: "",
    history: ["Received 2026-12-23", "Supplier flagged: group subsidiary (CZ)"],
  },
  {
    id: "INV-4493",
    supplier: "Bürobedarf Klein e.K.",
    country: "DE",
    contact: "Anna Klein · rechnung@klein-buero.example",
    iban: "DE12 5005 0201 0200 4567 89",
    date: "2026-12-23",
    dueDate: "2027-01-22",
    amount: 318,
    description: "Office supplies December",
    lines: [{ text: "Paper, toner, folders", amount: 318 }],
    costCenter: "4711",
    assetNumber: "",
    approval: "standard",
    status: "open",
    note: "",
    history: ["Received 2026-12-23", "Supplier since 2019"],
  },
  {
    id: "INV-4494",
    supplier: "Kowalski Metal sp. z o.o.",
    country: "PL",
    contact: "Marek Kowalski · faktury@kowalski-metal.example",
    iban: "PL61 1090 1014 0000 0712 1981 2874",
    date: "2026-12-23",
    dueDate: "2027-01-22",
    amount: 4850,
    description: "Steel brackets, first delivery",
    lines: [{ text: "Steel brackets, 200 pcs", amount: 4850 }],
    costCenter: "4711",
    assetNumber: "",
    approval: "standard",
    status: "open",
    note: "",
    history: ["Received 2026-12-23", "New supplier: no previous invoices"],
  },
];

export const CAPEX_LIMIT = 5000;
