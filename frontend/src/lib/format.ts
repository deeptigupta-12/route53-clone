/** "example.com." -> "example.com" (the console hides the trailing dot). */
export function displayZoneName(name: string): string {
  return name.endsWith(".") ? name.slice(0, -1) : name;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
