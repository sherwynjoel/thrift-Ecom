// Code 128 symbol widths (bar, space, bar, space, bar, space) for values 0..105.
export const CODE128_PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
export const CODE128_STOP = "2331112";
const START_B = 104;

export function code128BValues(text: string): number[] {
  if (text.length === 0) throw new Error("Nothing to encode");
  const values = [START_B];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (ch.length !== 1 || c < 32 || c > 126) throw new Error(`Code 128-B cannot encode "${ch}"`);
    values.push(c - 32);
  }
  let sum = START_B;
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103);
  return values;
}

export function code128Widths(text: string): string {
  return code128BValues(text).map((v) => CODE128_PATTERNS[v]).join("") + CODE128_STOP;
}

export interface Bar { x: number; width: number }

export function code128Bars(text: string): { bars: Bar[]; modules: number } {
  const widths = code128Widths(text);
  const bars: Bar[] = [];
  let x = 0;
  for (let i = 0; i < widths.length; i++) {
    const w = Number(widths[i]);
    if (i % 2 === 0) bars.push({ x, width: w }); // every symbol has an even number of elements, so even index = bar
    x += w;
  }
  return { bars, modules: x };
}
