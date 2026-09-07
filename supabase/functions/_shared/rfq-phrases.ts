import type { Lang } from "./rfq-intake.ts";

// Fixed assistant phrases for the RFQ drafting agent, translated so the buyer
// hears the assistant in their own language even on the deterministic path where
// no model reply is available. The English column is authoritative; the model
// path (broker-rfq-agent) produces its own localized prose and only falls back
// to these when the provider is slow or unavailable.
//
// Interpolations are passed as args, never concatenated into the table, so each
// language keeps natural word order.

type Phrases = {
  defaultRefine: string;
  previousStillHandled: string;
  messageSaveFailed: string;
  undoDone: string;
  undoConflict: string;
  staleRevision: string;
  referenceConflict: (labels: string) => string;
  referenceConflictOptions: [string, string];
  referenceNoted: (details: string) => string;
  referenceIntakeAdded: string;
  savedFirstFollowUp: (details: string) => string;
  savedMore: (withReference: boolean) => string;
};

const EN_SUBMIT_TAIL = "Is there anything else we need to know? When you’re ready, you can click Submit RFQ.";

const TABLE: Record<Lang, Phrases> = {
  en: {
    defaultRefine: "I’m here to help refine this RFQ. Could you share one more detail?",
    previousStillHandled: "Your previous message is still being handled. Please wait a moment before trying again.",
    messageSaveFailed: "I couldn’t save that message safely. Please try again.",
    undoDone: "I restored the previous RFQ details. You can keep refining the draft whenever you’re ready.",
    undoConflict: "I can’t safely undo that change because the RFQ has changed since then. Your latest saved details are still intact.",
    staleRevision: "Your RFQ draft moved on while I was saving that. I’ve reloaded the latest version — please send your last message again.",
    referenceConflict: (labels) => `Your reference and typed brief differ on ${labels}. Which should I keep?`,
    referenceConflictOptions: ["Keep my typed brief", "Use the reference details"],
    referenceNoted: (details) => `Noted on ${details} from your attached reference. ${EN_SUBMIT_TAIL}`,
    referenceIntakeAdded: `I added the clearly stated reference details to this draft. ${EN_SUBMIT_TAIL}`,
    savedFirstFollowUp: (details) => `Noted — ${details}. ${EN_SUBMIT_TAIL}`,
    savedMore: (withReference) =>
      `${withReference ? "I also captured the clearly stated details from your attached reference. Please review them before submitting. " : ""}I’ve recorded the details you shared. Add any other requirements whenever you’re ready.`,
  },
  ja: {
    defaultRefine: "このRFQの内容を一緒に詰めていきます。もう1点、詳細を教えていただけますか？",
    previousStillHandled: "先ほどのメッセージをまだ処理中です。少し待ってから再度お試しください。",
    messageSaveFailed: "メッセージを安全に保存できませんでした。もう一度お試しください。",
    undoDone: "直前のRFQ内容に戻しました。準備ができ次第、ドラフトの調整を続けられます。",
    undoConflict: "その後にRFQが変更されたため、この変更を安全に取り消せません。最新の保存内容はそのまま残っています。",
    staleRevision: "保存中にRFQのドラフトが更新されました。最新版を読み込み直しましたので、直前のメッセージをもう一度送信してください。",
    referenceConflict: (labels) => `参考資料と入力内容が「${labels}」で異なります。どちらを採用しますか？`,
    referenceConflictOptions: ["入力した内容を使う", "参考資料の内容を使う"],
    referenceNoted: (details) => `添付の参考資料から「${details}」を記録しました。ほかに共有すべき点はありますか？ 準備ができたら「Submit RFQ」を押してください。`,
    referenceIntakeAdded: "参考資料に明記されていた項目をこのドラフトに追加しました。ほかに共有すべき点はありますか？ 準備ができたら「Submit RFQ」を押してください。",
    savedFirstFollowUp: (details) => `承知しました — ${details}。ほかに共有すべき点はありますか？ 準備ができたら「Submit RFQ」を押してください。`,
    savedMore: (withReference) =>
      `${withReference ? "添付の参考資料に明記されていた項目も記録しました。送信前にご確認ください。" : ""}いただいた内容を記録しました。ほかの要件があれば、いつでも追加してください。`,
  },
  zh: {
    defaultRefine: "我来协助完善这份询价单。可以再补充一个细节吗？",
    previousStillHandled: "您上一条消息还在处理中，请稍候再试。",
    messageSaveFailed: "无法安全保存该消息，请重试。",
    undoDone: "已恢复到上一版询价单内容。准备好后可以继续完善草稿。",
    undoConflict: "由于此后询价单已被修改，无法安全撤销该更改。您最近保存的内容仍然完整。",
    staleRevision: "保存时这份询价单草稿已有更新。我已重新载入最新版本，请重新发送您上一条消息。",
    referenceConflict: (labels) => `参考资料与您填写的内容在“${labels}”上不一致，应以哪一个为准？`,
    referenceConflictOptions: ["以我填写的内容为准", "采用参考资料内容"],
    referenceNoted: (details) => `已根据您上传的参考资料记录：${details}。还有其他需要告知的吗？准备好后可以点击 Submit RFQ。`,
    referenceIntakeAdded: "已将参考资料中明确说明的内容添加到本草稿。还有其他需要告知的吗？准备好后可以点击 Submit RFQ。",
    savedFirstFollowUp: (details) => `已记录 — ${details}。还有其他需要告知的吗？准备好后可以点击 Submit RFQ。`,
    savedMore: (withReference) =>
      `${withReference ? "我也记录了您上传的参考资料中明确说明的内容，提交前请先核对。" : ""}已记录您提供的信息。如有其他要求，随时补充即可。`,
  },
  id: {
    defaultRefine: "Saya bantu melengkapi RFQ ini. Boleh bagikan satu detail lagi?",
    previousStillHandled: "Pesan Anda sebelumnya masih diproses. Mohon tunggu sebentar lalu coba lagi.",
    messageSaveFailed: "Pesan tidak dapat disimpan dengan aman. Silakan coba lagi.",
    undoDone: "Detail RFQ sebelumnya sudah dipulihkan. Anda bisa lanjut menyempurnakan draf kapan saja.",
    undoConflict: "Perubahan itu tidak bisa dibatalkan dengan aman karena RFQ sudah berubah sejak saat itu. Detail terakhir yang tersimpan tetap utuh.",
    staleRevision: "Draf RFQ ini berubah saat sedang saya simpan. Versi terbaru sudah dimuat ulang — silakan kirim ulang pesan terakhir Anda.",
    referenceConflict: (labels) => `Referensi dan brief yang Anda ketik berbeda pada ${labels}. Mana yang harus dipakai?`,
    referenceConflictOptions: ["Pakai brief yang saya ketik", "Pakai detail dari referensi"],
    referenceNoted: (details) => `Dicatat dari referensi yang Anda lampirkan: ${details}. Ada lagi yang perlu kami ketahui? Jika sudah siap, klik Submit RFQ.`,
    referenceIntakeAdded: "Detail yang tercantum jelas pada referensi sudah ditambahkan ke draf ini. Ada lagi yang perlu kami ketahui? Jika sudah siap, klik Submit RFQ.",
    savedFirstFollowUp: (details) => `Dicatat — ${details}. Ada lagi yang perlu kami ketahui? Jika sudah siap, klik Submit RFQ.`,
    savedMore: (withReference) =>
      `${withReference ? "Saya juga mencatat detail yang tercantum jelas pada referensi Anda. Mohon diperiksa sebelum mengirim. " : ""}Detail yang Anda bagikan sudah dicatat. Tambahkan persyaratan lain kapan saja.`,
  },
};

export function phrases(lang: Lang): Phrases {
  return TABLE[lang] || TABLE.en;
}
