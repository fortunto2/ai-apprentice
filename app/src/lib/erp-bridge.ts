// postMessage protocol between the sandbox ERP (iframe) and the apprentice/tutor panel (parent).

export type ErpState = {
  invoice: string;
  amount: number;
  supplier: string;
  cost_center: string;
  asset_number: string;
  approval: string;
  status: string;
  note: string;
};

export type ErpMessage =
  | { type: "erp:activity"; kind: "key" | "mouse" | "scroll" } // expert is working, stay quiet
  | { type: "erp:event"; kind: "open" | "change" | "save" | "hold" | "navigate"; summary: string; invoice: string; field?: string; from?: string; to?: string; state: ErpState }
  | { type: "erp:save-attempt"; state: ErpState } // new-hire mode: the tutor gets a chance to step in
  | { type: "erp:ready" };

export type ParentMessage =
  | { type: "tutor:block-save"; reason: string } // tutor stepped in before the save
  | { type: "tutor:allow-save" }
  | { type: "privacy:mask"; on: boolean }; // blur PII on screen

export function postToParent(msg: ErpMessage) {
  if (typeof window !== "undefined" && window.parent !== window) {
    window.parent.postMessage(msg, "*");
  }
}
