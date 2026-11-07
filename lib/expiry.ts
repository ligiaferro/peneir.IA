export function getExpiryWarnings(
  expiryDate: string | null,
  currentDate = new Date(),
): string[] {
  if (!expiryDate) return [];
  const expiry = new Date(`${expiryDate}T00:00:00.000Z`);
  if (
    Number.isNaN(expiry.getTime()) ||
    expiry.toISOString().slice(0, 10) !== expiryDate
  ) {
    return ["A validade não pôde ser interpretada; confira o documento."];
  }

  const today = new Date(currentDate);
  today.setUTCHours(0, 0, 0, 0);
  const daysUntilExpiry = Math.ceil(
    (expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (daysUntilExpiry < 0) {
    return [`A validade informada (${expiryDate}) já passou. Confirme a data no documento.`];
  }
  if (daysUntilExpiry <= 30) {
    const dayLabel = daysUntilExpiry === 1 ? "dia" : "dias";
    return [
      `A validade informada termina em ${daysUntilExpiry} ${dayLabel} (${expiryDate}).`,
    ];
  }
  return [];
}
