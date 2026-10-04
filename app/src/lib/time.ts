// mm:ss from milliseconds. One definition for the UI, the prompts and the eval, floored so a
// 1.6 s event reads 00:01 everywhere.
export const fmtT = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
