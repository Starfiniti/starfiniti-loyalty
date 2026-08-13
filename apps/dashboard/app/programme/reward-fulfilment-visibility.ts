export function shouldShowRewardFulfilmentQueue(
  expandedRewardsEnabled: boolean,
  acceptedCaseCount: number,
) {
  return expandedRewardsEnabled || acceptedCaseCount > 0;
}
