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

export type AgentPatch = { cost_center?: string; asset_number?: string; approval?: string; note?: string };

export type ParentMessage =
  | { type: "tutor:block-save"; reason: string } // tutor stepped in before the save
  | { type: "tutor:allow-save" }
  | { type: "privacy:mask"; on: boolean } // blur PII on screen
  | { type: "agent:open"; invoice: string } // agent mode: the apprentice agent works the queue
  | { type: "agent:apply"; invoice: string; patch: AgentPatch; action: "save" | "hold" | "none" };

export function postToParent(msg: ErpMessage) {
  if (typeof window !== "undefined" && window.parent !== window) {
    window.parent.postMessage(msg, "*");
  }
}
