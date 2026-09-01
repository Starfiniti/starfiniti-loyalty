import {
  type ProgrammeDefinitionV2,
  programmeRewardDefinitionV2,
  type ProgrammeRewardDefinitionV2,
} from "@starfiniti/contracts";

export type ExpandedRewardEditorRow = Readonly<{
  editorKey: string;
  reward: ProgrammeDefinitionV2["rewards"][number];
}>;

export function initialExpandedRewardEditorRows(
  rewards: ProgrammeDefinitionV2["rewards"],
): ExpandedRewardEditorRow[] {
  return rewards.map((reward, index) => ({
    editorKey: `initial:${index}`,
    reward,
  }));
}

export function replaceExpandedRewardEditorRow(
  rows: readonly ExpandedRewardEditorRow[],
  index: number,
  reward: ProgrammeDefinitionV2["rewards"][number],
): ExpandedRewardEditorRow[] {
  return rows.map((row, rowIndex) =>
    rowIndex === index ? { ...row, reward } : row,
  );
}

export function removeExpandedRewardEditorRow(
  rows: readonly ExpandedRewardEditorRow[],
  index: number,
): ExpandedRewardEditorRow[] {
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

export type ExpandedRewardValidationIssue = Readonly<{
  message: string;
  path: ReadonlyArray<PropertyKey>;
}>;

export function isVersionedRewardCandidate(
  value: unknown,
): value is ProgrammeRewardDefinitionV2 {
  if (typeof value !== "object" || value === null) return false;
  const configuration = Reflect.get(value, "configuration");
  return (
    typeof configuration === "object" &&
    configuration !== null &&
    Reflect.get(configuration, "version") === "2"
  );
}

export function expandedRewardValidationIssues(
  rewards: readonly unknown[],
): ExpandedRewardValidationIssue[] {
  return rewards.flatMap((reward, index) => {
    if (!isVersionedRewardCandidate(reward)) return [];
    const result = programmeRewardDefinitionV2.safeParse(reward);
    return result.success
      ? []
      : result.error.issues.map((issue) => ({
          message: issue.message,
          path: [
            "rewards",
            index,
            ...issue.path.map((segment) => String(segment)),
          ],
        }));
  });
}

export function validationPathHasIssue(
  issues: ReadonlyArray<Readonly<{ path: ReadonlyArray<PropertyKey> }>>,
  path: string,
): boolean {
  return issues.some((issue) => {
    const issuePath = issue.path.map((segment) => String(segment)).join(".");
    return issuePath === path || issuePath.startsWith(`${path}.`);
  });
}

export function replaceCollapsedRewardIssues(
  programmeIssues: readonly ExpandedRewardValidationIssue[],
  rewardIssues: readonly ExpandedRewardValidationIssue[],
): ExpandedRewardValidationIssue[] {
  const expandedIndexes = new Set(
    rewardIssues.map((issue) => String(issue.path[1])),
  );
  return [
    ...programmeIssues.filter(
      (issue) =>
        !(
          issue.path[0] === "rewards" &&
          issue.path.length === 2 &&
          expandedIndexes.has(String(issue.path[1]))
        ),
    ),
    ...rewardIssues,
  ];
}
