/** Resolve a spoken or typed choice without treating an unrelated question as an answer. */
export function choiceIndexFromInput(text: string, options: readonly string[]): number | null {
  const answer = text.trim().toLocaleLowerCase();
  if (!answer || options.length === 0) return null;

  const letter = answer.match(/^(?:选项\s*)?([a-z])(?:[.、)）])?$/i);
  if (letter) {
    const index = letter[1].toLowerCase().charCodeAt(0) - 97;
    return index < options.length ? index : null;
  }
  const number = answer.match(/^(?:第\s*)?([1-9])(?:\s*项)?$/);
  if (number) {
    const index = Number(number[1]) - 1;
    return index < options.length ? index : null;
  }
  const exact = options.findIndex((option) => option.trim().toLocaleLowerCase() === answer);
  return exact >= 0 ? exact : null;
}
