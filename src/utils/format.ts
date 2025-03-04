/**
 * Formats a number as currency using the user's locale and currency settings
 * @param amount The amount to format
 * @param locale The locale to use for formatting (defaults to 'en-US')
 * @param currency The currency code to use (defaults to 'USD')
 * @returns The formatted currency string
 */
export function formatCurrency(
  amount: number,
  locale: string = 'en-US',
  currency: string = 'USD'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Formats a date using the user's locale
 * @param date The date to format
 * @param locale The locale to use for formatting (defaults to 'en-US')
 * @returns The formatted date string
 */
export function formatDate(
  date: Date | string,
  locale: string = 'en-US'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
} 