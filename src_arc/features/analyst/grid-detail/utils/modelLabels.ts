export function toModelLabel(value: string): string {
  return value
    .split("_")
    .map((part) => {
      const lowered = part.toLowerCase();
      if (lowered === "srkw") return "SRKW";
      if (lowered === "kw") return "KW";
      if (lowered === "idw") return "IDW";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}
