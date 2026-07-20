export const GRADES = ['A', 'B', 'C', 'D', 'F'] as const;
export type Grade = typeof GRADES[number];
export function isGrade(value: unknown): value is Grade { return typeof value === 'string' && (GRADES as readonly string[]).includes(value); }
export function worseGrade(a: Grade, b: Grade): Grade { return GRADES.indexOf(a) >= GRADES.indexOf(b) ? a : b; }
