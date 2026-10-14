# Meno documentation map

You do not need to read every document to get started. [README](../README.md) contains the current product, local setup and verification commands.

## Start here

| Need | Read |
|---|---|
| Understand the learner, problem and product boundaries | [Product strategy](PRODUCT_STRATEGY.md) |
| Understand module boundaries, data authority and implementation decisions | [Technical design](TECHNICAL_DESIGN.md) |
| Pick the next work package or assess the production path | [Implementation plan](IMPLEMENTATION_PLAN.md) |
| Configure hosted development and understand its limits | [Hosted development](operations/HOSTED_DEVELOPMENT.md) |

The strategy is the product baseline. The technical design includes both the original blueprint and an adoption log; its proposed entities/actions are not a substitute for the implemented contracts and migrations. Dated roadmap entries record earlier milestones. Use the README and relevant contract for current capability.

## Feature contracts

Read the contract for the feature you are changing, rather than loading every one. These retain API bounds, evidence scope, authorization, retry and failure rules that would otherwise be rediscovered from code.

| Feature | Contract | Source |
|---|---|---|
| Course drafts, confirmation and checkpoints | [Course context](contracts/COURSE_CONTEXT.md) | [resources](../src/features/resources/) |
| Reviewed AI outline suggestions | [Outline extraction](contracts/OUTLINE_EXTRACTION.md) | [AI adapters](../src/lib/ai/) |
| Resumable JavaScript checks and scoped findings | [Diagnostic](contracts/DIAGNOSTIC.md) | [assessment](../src/features/assessment/) |
| Proposed, edited, accepted and declined next steps | [Recovery proposals](contracts/RECOVERY_PROPOSALS.md) | [learning paths](../src/features/learning-paths/) |
| Private, course-aware mentor explanations | [Mentor workspace](contracts/MENTOR_WORKSPACE.md) | [mentor services](../src/features/momentum/) |
| Guided drafts, submissions and rubric feedback | [Practical work](contracts/PRACTICAL_WORK.md) | [assessment](../src/features/assessment/) |
| Explicit evidence recording and follow-ups | [Practical progress](contracts/PRACTICAL_PROGRESS.md) | [assessment](../src/features/assessment/) |
| Fictional opportunities, saved baselines and comparisons | [Opportunity Radar](contracts/OPPORTUNITY_RADAR.md) | [opportunities](../src/features/opportunities/) |
| Learner-reported obstacles and confirmed recovery changes | [Recovery check-ins](contracts/RECOVERY_CHECKINS.md) | [momentum](../src/features/momentum/) |

## Codex across the workflow

- **Plan:** [AGENTS.md](../AGENTS.md) defines project constraints; the strategy, architecture and roadmap distinguish confirmed decisions from proposals.
- **Build:** Feature branches contain the implementation, additive migrations, fixtures and tests. One application owns the learner-state transitions.
- **Review:** [meno-feature-review](../.agents/skills/meno-feature-review/SKILL.md) collects relevant contracts/tests and guides code inspection for evidence, identity, retries and learner confirmation. Its helper is read-only; review conclusions require source inspection.
- **Document:** Update the relevant contract when behavior changes. `npm run check:docs` checks local links and `npm run test:tooling` validates the reusable helpers; CI runs both.

Try `Use $meno-feature-review to review the current branch against origin/main` in Codex. Repository-local discovery follows [official OpenAI skill guidance](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills). Use an explicit invocation if the skill is not yet visible in your session.

## Reference and history

[The initial source audit](archive/PROJECT_REVIEW.md) records the documentation handoff and early findings; it is historical, not a setup guide. [The original Word strategy](reference/Meno_Product_Strategy.docx) preserves the founder's source. [Diagrams](assets/) illustrate the product and editable Mermaid flows remain in the core documents.

Production readiness is separate from prototype completeness. Start with the roadmap's pilot gate: account lifecycle, learner data controls, separate environments, monitoring/restore, maintained sources, supported assessment and learner evaluation. No production or learning-outcome guarantee is implied by passing a demonstration.
