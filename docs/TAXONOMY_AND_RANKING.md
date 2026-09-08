# Service taxonomy and ranking v1

Terms "category" in this document classify the evaluated service. They are separate from evaluation-matrix categories such as privacy, payments, and disputes.

## Classification model

Use several orthogonal fields instead of forcing every service into one ambiguous hierarchy.

### Offering type (one primary, optional secondary)

- `saas` — browser/API-hosted software, normally account-based
- `downloaded_software` — installed desktop/mobile/server software
- `physical_product` — goods whose primary value is physical
- `marketplace_platform` — connects third-party buyers/sellers/providers
- `content_service` — streaming, publishing, news, games, or creator content
- `professional_service` — human-delivered consulting, legal, logistics, travel, etc.
- `connected_device` — physical product materially dependent on software/cloud processing
- `hybrid` — no single form dominates
- `other`

A connected fitness device could therefore be primary `connected_device`, secondary `saas`, rather than being misleadingly compared only with ordinary physical goods.

### Sector and subcategory

Versioned IDs form a two-level tree. Initial sectors:

- `business_software`: productivity, collaboration, developer_tools, hosting_cloud, cybersecurity, crm_sales, finance_accounting, hr
- `ai_services`: general_assistant, generative_media, coding_assistant, model_api, ai_search, vertical_ai
- `internet_services`: web_search, email, browser, maps_navigation, identity, service_ecosystem
- `commerce`: retailer, marketplace, payments, subscriptions_memberships, delivery
- `finance`: banking, lending, investing, insurance, crypto
- `social_communication`: social_network, messaging, dating, community_forum
- `media_entertainment`: video, music_audio, gaming, news_publishing, creator_platform
- `health_wellness`: healthcare, mental_health, fitness, reproductive_health, health_device
- `education`: school_platform, online_course, tutoring, learning_tool
- `travel_mobility`: travel_booking, accommodation, ride_hailing, navigation, vehicle_service
- `consumer_utilities`: smart_home, smart_tv, telecom, storage, identity, personal_productivity
- `professional_services`: legal, consulting, recruiting, real_estate, logistics
- `government_nonprofit`: government, nonprofit, public_utility
- `other`

A site has one primary sector/subcategory and may have secondary subcategories. IDs and labels are published by `GET /v1/categories`; changing meaning requires a taxonomy version bump.

### Facets (multi-select)

- Monetization: `free`, `freemium`, `subscription`, `one_time_purchase`, `advertising`, `transaction_fee`, `data_monetization_disclosed`, `enterprise_contract`, `donation`.
- Audience: `consumer`, `business`, `developer`, `education`, `healthcare`, `government`, `children`, `teen`, `creator`, `seller`.
- Data sensitivity: `ordinary`, `financial`, `health`, `precise_location`, `biometric`, `communications`, `children_data`, `user_content`.
- Relationship: `account_required`, `paid`, `user_generated_content`, `third_party_sellers`, `physical_fulfilment`, `automated_decisions`, `generative_ai`.

## Classification evidence and consensus

Each model returns offering type, sector/subcategory, facets, confidence, short reasoning, and citations to the root/service description or policy bundle. The service aggregates categorical values by distinct-model majority and exposes disagreements. A curated maintainer override is permitted but must retain the model result, reason, author, and timestamp in history.

Low-confidence or tied classification is labelled `unclassified` for ranking rather than forced into a cohort.

## Ranking rules

There is no undifferentiated global "best terms" leaderboard. Rank only comparable services selected by offering type, sector/subcategory, and optional facets.

A report is rank-eligible when:

- it is the current policy revision and matrix major version;
- verdict is not `insufficient_evidence`;
- weighted evidence coverage is at least 70%;
- service classification is resolved with medium/high confidence;
- source documents are not stale (default 90 days); and
- at least one service-processed model exists; model count is always displayed.

Default ordering is aggregate score descending. Ties use higher coverage, lower disagreement, newer source date, then normalized service name. Users may instead sort by an evaluation category (for example, AI/content rights or payments), coverage, freshness, or disagreement.

Every ranking row shows aggregate score/verdict, model count, score range, coverage, disagreement status, source date, and classification. Filters and ranking methodology remain in the URL so results are reproducible and shareable.

Do not blend matrix versions, stale/current policy revisions, or jurisdiction contexts in one ranking. Never sell placement or let sponsorship affect order.
