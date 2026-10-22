# Rep milestones — new in v0.5.12

Every three Rep levels — **3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33** — your character receives an extra reward **on top** of the normal level-up reward.

The ordinary level-up sequence is unchanged:
- **Every level:** a stat die step on odd levels, a new perk on even levels.
- **Every third level:** Health and Guard Growth roll based on Grit and Moves.
- **New tiers:** the existing tier-specific Hustle increase.
- **Additionally at Rep 3, 6, 9, ... 33:** choose one milestone reward.

## Extra milestone choices

| Choice | Bonus | Limit |
| --- | --- | --- |
| **Still Standing** | +3 maximum Health and heal 3 | May be chosen repeatedly. |
| **Hard to Touch** | +1 permanent base Guard | At most three times across milestones. |
| **Never Stop** | +1 maximum Hustle, gain 1 now | At most twice across milestones. |
| **Paid Proper** | Cash payout of £75 + £25 × the milestone Rep level | May be chosen repeatedly. |

For example, at **Rep 3** a player chooses a stat to raise, rolls their usual Growth for Health and Guard, and selects one bonus above. Choosing **Still Standing** adds three extra Health in addition to whatever the Growth roll granted. At **Rep 6**, the player chooses a perk, rolls Growth, and receives another milestone pick.

The wizard displays milestone choices and disables an option once its cap is reached. Rewards are recorded on the character and protected against repeated claims. The UI confirms the exact reward in the Rep chat card.

## Existing character recovery

A character already at Rep 9 when v0.5.12 is installed gets outstanding milestone claims for Rep 3, 6 and 9. Open the **Rep** tab, choose **Claim milestone bonus**, select a reward, and repeat for any remaining milestones. No XP, ordinary rewards, or Rep progression are reset. A record of each claimed reward persists on the Actor document.

## GM notes

Milestone history is stored as JSON text in `system.creation.milestoneRewards` (schema default `'[]'`). The app constructs ordinary Growth and milestone changes into one `Actor.update` call so increments cannot overwrite each other. The system does not retrospectively change past Health or Guard Growth rolls.
