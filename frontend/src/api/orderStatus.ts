export function mapOrderStatus(raw?: string | null) {
  if (!raw) return "";
  const sRaw = String(raw);
  const s = sRaw.trim().toLowerCase();
  const sNoSpace = s.replace(/\s/g, "");

  if (s === "pending") return "상품 준비중";

  // cover variations like '배송완료', '배송 완료', 'delivered', different casing/whitespace
  if (
    s === "배송완료".toLowerCase() ||
    sNoSpace === "배송완료".toLowerCase() ||
    s === "delivered" ||
    sNoSpace === "delivered"
  )
    return "배송완료";

  // default: preserve original string (keep casing from backend)
  return sRaw;
}

export default mapOrderStatus;

export function arrivalLabel(dateInput?: string | Date | null) {
  if (!dateInput) return "";
  const d = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(String(dateInput));
  if (isNaN(d.getTime())) return "";

  // add one day (24h)
  const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);

  const parts = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).formatToParts(next);

  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  let weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  // normalize weekday to single char like '화'
  weekday = weekday.replace("요일", "");

  return `${month}/${day}(${weekday}) 도착`;
}
