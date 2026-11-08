/** Só os 14 dígitos do CNPJ, ou "" se houver outra quantidade. */
export function normalizeCnpj(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

/** "00.000.000/0001-91" a partir dos 14 dígitos. */
export function formatCnpj(digits: string) {
  const d = normalizeCnpj(digits);
  if (!d) return digits;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function checkDigit(digits: string, length: number) {
  const weights =
    length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Confere tamanho, dígitos repetidos e os dois dígitos verificadores. */
export function isValidCnpj(value: string) {
  const digits = normalizeCnpj(value);
  if (!digits || /^(\d)\1{13}$/.test(digits)) return false;
  return (
    checkDigit(digits, 12) === Number(digits[12]) &&
    checkDigit(digits, 13) === Number(digits[13])
  );
}
