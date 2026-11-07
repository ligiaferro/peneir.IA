const brasiliaTimeZone = "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: brasiliaTimeZone,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: brasiliaTimeZone,
  hour: "2-digit",
  minute: "2-digit",
});

/** Data (ISO 8601) no horário de Brasília, ex.: "09/11/2026". */
export function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

/** Prazo no horário de Brasília; omite o horário quando é fim do dia. */
export function formatDeadline(value: string) {
  const date = new Date(value);
  const time = timeFormatter.format(date);
  return time === "23:59"
    ? dateFormatter.format(date)
    : `${dateFormatter.format(date)} às ${time}`;
}
