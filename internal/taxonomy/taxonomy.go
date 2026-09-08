package taxonomy

type Option struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type Sector struct {
	ID            string   `json:"id"`
	Label         string   `json:"label"`
	Subcategories []string `json:"subcategories"`
}

type Catalog struct {
	Version       string   `json:"version"`
	OfferingTypes []Option `json:"offering_types"`
	Sectors       []Sector `json:"sectors"`
	Monetization  []string `json:"monetization"`
	Audiences     []string `json:"audiences"`
}

func Current() Catalog {
	return Catalog{
		Version: "1.0.0",
		OfferingTypes: []Option{
			{ID: "saas", Label: "Software as a service"},
			{ID: "physical_product", Label: "Physical product"},
			{ID: "downloaded_software", Label: "Downloaded software"},
			{ID: "marketplace_platform", Label: "Marketplace or platform"},
			{ID: "content_service", Label: "Content service"},
			{ID: "professional_service", Label: "Professional service"},
			{ID: "connected_device", Label: "Connected device"},
			{ID: "hybrid", Label: "Hybrid"},
			{ID: "other", Label: "Other"},
		},
		Sectors: []Sector{
			{ID: "business_software", Label: "Business software", Subcategories: []string{"productivity", "collaboration", "developer_tools", "hosting_cloud", "cybersecurity", "crm_sales", "finance_accounting", "hr"}},
			{ID: "ai_services", Label: "AI services", Subcategories: []string{"general_assistant", "generative_media", "coding_assistant", "model_api", "ai_search", "vertical_ai"}},
			{ID: "internet_services", Label: "Internet services", Subcategories: []string{"web_search", "email", "browser", "maps_navigation", "identity", "service_ecosystem"}},
			{ID: "commerce", Label: "Commerce", Subcategories: []string{"retailer", "marketplace", "payments", "subscriptions_memberships", "delivery"}},
			{ID: "finance", Label: "Finance", Subcategories: []string{"banking", "lending", "investing", "insurance", "crypto"}},
			{ID: "social_communication", Label: "Social and communication", Subcategories: []string{"social_network", "messaging", "dating", "community_forum"}},
			{ID: "media_entertainment", Label: "Media and entertainment", Subcategories: []string{"video", "music_audio", "gaming", "news_publishing", "creator_platform"}},
			{ID: "health_wellness", Label: "Health and wellness", Subcategories: []string{"healthcare", "mental_health", "fitness", "reproductive_health", "health_device"}},
			{ID: "education", Label: "Education", Subcategories: []string{"school_platform", "online_course", "tutoring", "learning_tool"}},
			{ID: "travel_mobility", Label: "Travel and mobility", Subcategories: []string{"travel_booking", "accommodation", "ride_hailing", "navigation", "vehicle_service"}},
			{ID: "consumer_utilities", Label: "Consumer utilities", Subcategories: []string{"smart_home", "smart_tv", "telecom", "storage", "identity", "personal_productivity"}},
			{ID: "professional_services", Label: "Professional services", Subcategories: []string{"legal", "consulting", "recruiting", "real_estate", "logistics"}},
			{ID: "government_nonprofit", Label: "Government and nonprofit", Subcategories: []string{"government", "nonprofit", "public_utility"}},
			{ID: "other", Label: "Other", Subcategories: []string{"other"}},
		},
		Monetization: []string{"free", "freemium", "subscription", "one_time_purchase", "advertising", "transaction_fee", "data_monetization_disclosed", "enterprise_contract", "donation"},
		Audiences:    []string{"consumer", "business", "developer", "education", "healthcare", "government", "children", "teen", "creator", "seller"},
	}
}
