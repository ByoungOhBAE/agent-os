/**
 * Org chart page layout: which departments sit under the chief of staff and which sit
 * beside the chief card as CEO-direct departments. Pure (no React) so it can be unit tested.
 */
export type ReportsTo = "ceo" | "chief";

export type DepartmentSplit<T> = {
  /** Departments that report to the chief of staff — shown in the group below the chief card. */
  chief: T[];
  /** Departments that report to the CEO — shown on the chief's row, to the right of the chief card. */
  ceo: T[];
};

/** Splits departments by reporting line, keeping the saved order inside each side. */
export function splitDepartments<T extends { reportsTo: ReportsTo }>(departments: readonly T[]): DepartmentSplit<T> {
  const chief: T[] = [];
  const ceo: T[] = [];
  for (const d of departments) (d.reportsTo === "ceo" ? ceo : chief).push(d);
  return { chief, ceo };
}
