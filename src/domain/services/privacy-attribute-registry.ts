export type PrivacyDimension =
  | 'data'
  | 'collection'
  | 'purpose'
  | 'sharing'
  | 'tracking'
  | 'retention'
  | 'control'
  | 'transparency';

export interface PrivacyAttributeDefinition {
  readonly id: string;
  readonly dimension: PrivacyDimension;
  readonly weight: number;
  readonly critical: boolean;
  readonly definition: string;
  readonly state0Anchor: string;
  readonly state4Anchor: string;
}

function attribute(
  id: string,
  dimension: PrivacyDimension,
  weight: number,
  critical: boolean,
  definition: string,
  state0Anchor: string,
  state4Anchor: string,
): PrivacyAttributeDefinition {
  return { id, dimension, weight, critical, definition, state0Anchor, state4Anchor };
}

export const PRIVACY_ATTRIBUTES = [
  attribute('data.basic_identifiers', 'data', 1, false, 'Collection and linkage of basic identity and contact data.', 'Not collected or processed only transiently.', 'Extensive identity linkage across services or identities.'),
  attribute('data.device_and_activity', 'data', 2, false, 'Collection of device identifiers, logs, browsing, and usage history.', 'No persistent device or activity history.', 'Detailed persistent behavioural or device history.'),
  attribute('data.financial', 'data', 2, true, 'Collection and reuse of financial or transaction data.', 'Limited to necessary payment processing.', 'Detailed financial data reused beyond the transaction.'),
  attribute('data.precise_location', 'data', 3, true, 'Collection of precise or continuous physical location.', 'Not collected or coarse user-requested location only.', 'Precise or continuous location collection.'),
  attribute('data.communications_and_content', 'data', 2, true, 'Processing of private communications and user-provided content.', 'Private content is processed only as requested.', 'Private content is analysed or reused for unrelated purposes.'),
  attribute('data.sensitive_traits', 'data', 3, true, 'Collection or inference of health, biometric, belief, sexuality, or similar sensitive traits.', 'No sensitive traits or biometrics are processed.', 'Sensitive traits or biometrics are collected, inferred, or exploited.'),
  attribute('data.children', 'data', 2, true, 'Collection or use of data relating to children.', 'Children are excluded and not knowingly processed.', 'Children are profiled, targeted, or broadly monitored.'),

  attribute('collection.passive_observation', 'collection', 2, false, 'Passive collection rather than deliberate user submission.', 'Data is supplied deliberately by the user.', 'Extensive passive observation unrelated to the immediate request.'),
  attribute('collection.background_or_continuous', 'collection', 2, true, 'Background, always-on, or continuous collection.', 'Collection occurs only during an explicit interaction.', 'Always-on collection without functional necessity.'),
  attribute('collection.third_party_sources', 'collection', 2, false, 'Enrichment from brokers, affiliates, public sources, or other third parties.', 'No enrichment from outside sources.', 'Outside data is broadly combined into user profiles.'),
  attribute('collection.non_users', 'collection', 2, true, 'Collection of information about contacts, visitors, or other non-users.', 'No data about non-users is collected.', 'Users expose substantial information about non-users.'),
  attribute('collection.inferred_data', 'collection', 2, true, 'Creation of inferred interests, traits, predictions, or classifications.', 'No material traits or interests are inferred.', 'Sensitive or consequential traits are inferred at scale.'),

  attribute('purpose.core_necessity', 'purpose', 3, false, 'Whether processing is necessary to deliver the requested service.', 'Processing is limited to the requested feature.', 'Unrelated processing is mandatory for the core service.'),
  attribute('purpose.specificity', 'purpose', 3, false, 'Specificity and boundedness of disclosed processing purposes.', 'Purposes are explicit, narrow, and mapped to data.', 'Purposes are vague, unlimited, or circular.'),
  attribute('purpose.product_analytics', 'purpose', 2, false, 'Use of personal data for analytics, experimentation, or product improvement.', 'Only aggregate or minimal analytics are used.', 'User-level behaviour is retained for broad experimentation.'),
  attribute('purpose.advertising', 'purpose', 3, true, 'Use of personal data for advertising or commercial targeting.', 'No advertising use or contextual advertising only.', 'Personal data drives behavioural or sensitive advertising.'),
  attribute('purpose.ai_training', 'purpose', 2, true, 'Use of personal data or content for general AI or model training.', 'User content is excluded from model training.', 'Private or sensitive content trains general models.'),
  attribute('purpose.open_ended_future_use', 'purpose', 2, true, 'Permission for new, broad, or unspecified future uses.', 'Incompatible purposes require fresh agreement.', 'Data may be used for any lawful, commercial, or future purpose.'),

  attribute('sharing.service_processors', 'sharing', 2, false, 'Disclosure to processors used to operate the service.', 'Narrow processors act only to provide the service.', 'Processors may independently reuse data or are unrestricted.'),
  attribute('sharing.affiliates', 'sharing', 3, true, 'Disclosure to corporate affiliates for their own or shared purposes.', 'No affiliate sharing beyond necessary operations.', 'Broad affiliate ecosystem sharing for independent purposes.'),
  attribute('sharing.adtech_and_analytics', 'sharing', 4, true, 'Disclosure to advertising technology or cross-service analytics recipients.', 'No third-party adtech or cross-service analytics.', 'Data is widely disclosed to advertising or tracking recipients.'),
  attribute('sharing.sale_or_commercial_transfer', 'sharing', 5, true, 'Sale, licensing, or exchange of personal data for commercial value.', 'No sale or equivalent commercial disclosure.', 'Personal or sensitive data is sold, licensed, or exchanged for value.'),
  attribute('sharing.public_or_user_directed', 'sharing', 3, true, 'Public exposure and the quality of audience controls.', 'Private by default with clear audience controls.', 'Public exposure is default, broad, or difficult to reverse.'),
  attribute('sharing.onward_transfer_control', 'sharing', 3, true, 'Restrictions on recipients reusing or redisclosing data.', 'Recipients are identified and contractually limited.', 'Recipients may make unrestricted onward disclosures or uses.'),

  attribute('tracking.cross_context', 'tracking', 4, true, 'Tracking and linkage across sites, apps, services, or devices.', 'No cross-context tracking.', 'Persistent cross-context surveillance and linkage.'),
  attribute('tracking.profiling_and_inferences', 'tracking', 3, true, 'Profiling used to predict interests, traits, behaviour, or vulnerabilities.', 'No material profiling.', 'Detailed profiles predict traits, interests, or vulnerabilities.'),
  attribute('tracking.sensitive_targeting', 'tracking', 3, true, 'Targeting based on sensitive traits or vulnerability.', 'No sensitive or vulnerability-based targeting.', 'Sensitive traits or vulnerabilities drive targeting.'),
  attribute('tracking.consequential_automation', 'tracking', 3, true, 'Automated processing with material effects on access, eligibility, or price.', 'No solely automated consequential use.', 'Automation materially affects eligibility, pricing, work, housing, credit, or access.'),
  attribute('tracking.personalization_control', 'tracking', 2, false, 'User control over profiling and personalization.', 'Personalization is minimal, local, or fully controllable.', 'Extensive personalization cannot be disabled meaningfully.'),

  attribute('retention.period_specificity', 'retention', 3, true, 'Specificity and length of retention periods.', 'Short concrete periods are stated by purpose.', 'Retention is indefinite, unspecified, or effectively unlimited.'),
  attribute('retention.necessity', 'retention', 2, true, 'Whether retention ends when the stated purpose ends.', 'Data is deleted promptly when its purpose ends.', 'Data is kept for speculative future value.'),
  attribute('retention.account_deletion', 'retention', 3, true, 'Effectiveness of account and associated-data deletion.', 'Account deletion promptly removes associated data.', 'No meaningful deletion or core personal data is excluded.'),
  attribute('retention.backups_and_residuals', 'retention', 2, false, 'Treatment of backups, archives, derived data, and residual copies.', 'Residual copies have bounded deletion schedules.', 'Backups, derived data, or archives may persist indefinitely.'),

  attribute('control.consent_and_defaults', 'control', 3, true, 'Whether optional processing requires clear opt-in and is off by default.', 'Optional processing is off by default and opt-in.', 'Intrusive processing is compulsory, bundled, or default-on.'),
  attribute('control.withdrawal_and_refusal', 'control', 2, true, 'Ease and consequences of refusing or withdrawing permission.', 'Refusal and withdrawal are as easy as acceptance.', 'Withdrawal is obstructed, delayed, or punitive.'),
  attribute('control.access_correction_deletion', 'control', 2, false, 'Usability of access, correction, and deletion workflows.', 'Workflows are clear, usable, and proportionate.', 'No usable mechanism or unreasonable obstacles.'),
  attribute('control.core_service_choice', 'control', 2, true, 'Ability to use the core service without unrelated processing.', 'Core service works without unrelated tracking or sharing.', 'Unrelated processing is required to use the service.'),
  attribute('control.dark_patterns', 'control', 1, false, 'Manipulative, asymmetric, or confusing privacy choices.', 'Choices are neutral, symmetric, and understandable.', 'Choices steer, confuse, shame, or exhaust users into disclosure.'),

  attribute('transparency.recipient_specificity', 'transparency', 1, false, 'Specificity of recipient identities and functions.', 'Recipients are named or precisely described by function.', 'Catch-all categories conceal material sharing.'),
  attribute('transparency.data_purpose_mapping', 'transparency', 1, false, 'Clarity linking data categories to purposes and recipients.', 'Data, purposes, and recipients are connected clearly.', 'Users cannot determine which data supports which use.'),
  attribute('transparency.policy_changes', 'transparency', 1, false, 'Control and notice for materially expanded policy terms.', 'Material expansion requires notice and meaningful choice.', 'Continued use silently accepts broader processing.'),
  attribute('transparency.vagueness_and_conflicts', 'transparency', 1, false, 'Material ambiguity, contradiction, and undefined discretion.', 'Clauses are specific and internally consistent.', 'Material contradictions or pervasive ambiguity remain.'),
  attribute('transparency.accountability_contact', 'transparency', 1, false, 'Clarity of the responsible entity and privacy contact.', 'Responsible entity and usable contact are clear.', 'Controller identity or privacy contact is unavailable.'),
] as const satisfies readonly PrivacyAttributeDefinition[];

export type PrivacyAttributeId = typeof PRIVACY_ATTRIBUTES[number]['id'];

export const PRIVACY_ATTRIBUTE_IDS = PRIVACY_ATTRIBUTES.map((item) => item.id) as readonly PrivacyAttributeId[];

export const PRIVACY_ATTRIBUTE_BY_ID = new Map<PrivacyAttributeId, PrivacyAttributeDefinition>(
  PRIVACY_ATTRIBUTES.map((item) => [item.id, item]),
);

export function isPrivacyAttributeId(value: string): value is PrivacyAttributeId {
  return PRIVACY_ATTRIBUTE_BY_ID.has(value as PrivacyAttributeId);
}

export function promptAttributeCatalog(): readonly Omit<PrivacyAttributeDefinition, 'weight' | 'dimension'>[] {
  return PRIVACY_ATTRIBUTES.map(({ id, critical, definition, state0Anchor, state4Anchor }) => ({
    id,
    critical,
    definition,
    state0Anchor,
    state4Anchor,
  }));
}
