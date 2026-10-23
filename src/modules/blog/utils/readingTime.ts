export function calculateReadingTime(content: string): number {
  if (!content) return 1;
  const wordsPerMinute = 200;
  // Clean markdown syntax or html tags to get plain words
  const cleanText = content
    .replace(/<\/?[^>]+(>|$)/g, "") // strip html
    .replace(/[#*`_\[\]()\-+]/g, " "); // strip basic md characters
  const words = cleanText.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.ceil(words / wordsPerMinute);
  return Math.max(1, minutes);
}
