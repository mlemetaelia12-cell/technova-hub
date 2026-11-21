export function tanzaniaDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00+03:00`);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
