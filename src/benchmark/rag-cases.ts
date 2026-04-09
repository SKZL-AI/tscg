/**
 * TSCG RAG Benchmark Test Cases
 * 22 RAG tests with pre-built chunks simulating retrieval results.
 * Categories: RAG_SingleFact (6), RAG_MultiFact (6), RAG_Reasoning (5), RAG_Conflicting (5)
 */

import type { TestCase } from '../core/types.js';

// === RAG-Specific Types ===

export interface RAGChunk {
  id: string;
  text: string;
  relevance: number;
}

export interface RAGTestCase extends TestCase {
  chunks: Array<{ id: string; text: string; relevance: number }>;
}

// === Helpers ===

function buildNatural(chunks: RAGChunk[], query: string): string {
  const sorted = [...chunks].sort((a, b) => b.relevance - a.relevance);
  const body = sorted.map((c, i) => `[Document ${i + 1}]\n${c.text}`).join('\n---\n');
  return `Based on the following information, answer the question.\n\n${body}\n\nQuestion: ${query}`;
}

function buildTscg(chunks: RAGChunk[], query: string, answerType: string): string {
  const sorted = [...chunks].sort((a, b) => b.relevance - a.relevance);
  const body = sorted.map((c, i) => `<<DOC${i + 1}>> ${c.text} <<DOC${i + 1}>>`).join('\n');
  return `[ANSWER:${answerType}] Based on the provided documents:\n${body}\nQ: ${query}`;
}

// ============================================================
// RAG_SingleFact (6 tests) -- Answer in exactly one chunk
// ============================================================

const SF_TESTS: RAGTestCase[] = [
  // sf1: Project Budget -- answer in chunk 5 of 8
  {
    id: 'rag-sf1',
    category: 'RAG_SingleFact',
    name: 'Project Budget',
    expected: '$2.4 million',
    chunks: [
      { id: 'sf1-c1', relevance: 0.72, text: 'The Horizon Initiative was launched in January 2024 as part of a broader digital transformation strategy. The project team consists of 45 engineers and 12 product managers spread across three offices. Initial planning took approximately six weeks before development began in earnest.' },
      { id: 'sf1-c2', relevance: 0.68, text: 'Several competing projects were considered before Horizon was greenlit. The Catalyst project was shelved due to technical complexity, while the Meridian proposal was merged into Horizon. Stakeholders from the finance and operations departments provided input on priority features.' },
      { id: 'sf1-c3', relevance: 0.75, text: 'The Horizon Initiative uses a microservices architecture with Kubernetes orchestration. The tech stack includes TypeScript for the frontend, Go for backend services, and PostgreSQL for the primary datastore. Redis is used for caching frequently accessed data.' },
      { id: 'sf1-c4', relevance: 0.65, text: 'Project timelines have been adjusted twice since inception. The original completion date of September 2024 was pushed to December 2024 after scope expansion. A second delay moved the target to March 2025 due to integration testing challenges with legacy systems.' },
      { id: 'sf1-c5', relevance: 0.88, text: 'The total approved budget for the Horizon Initiative is $2.4 million, allocated across personnel costs, infrastructure, and third-party licensing. As of the last quarterly review, spending is at 62% of the total budget with the project approximately 70% complete.' },
      { id: 'sf1-c6', relevance: 0.60, text: 'Risk assessment for the Horizon project identified three critical risks: vendor lock-in with the cloud provider, potential regulatory changes in data handling, and key personnel dependency. Mitigation plans have been documented and reviewed by the steering committee.' },
      { id: 'sf1-c7', relevance: 0.55, text: 'The quality assurance team runs automated test suites nightly, covering approximately 87% of the codebase. Manual testing focuses on user acceptance criteria and accessibility standards. Bug reports are triaged weekly with a target resolution time of five business days.' },
      { id: 'sf1-c8', relevance: 0.50, text: 'Post-launch support will be handled by a dedicated team of eight engineers. A knowledge transfer plan is in place to transition from the development team to the support team. Documentation includes runbooks, architecture diagrams, and troubleshooting guides.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /2\.4\s*million/i.test(r.toLowerCase()) || /\$2[,.]4/i.test(r),
    tags: ['rag', 'single-fact'],
  },

  // sf2: CEO Name -- answer in chunk 7 of 10
  {
    id: 'rag-sf2',
    category: 'RAG_SingleFact',
    name: 'CEO Name',
    expected: 'Margaret Thornton',
    chunks: [
      { id: 'sf2-c1', relevance: 0.70, text: 'Pinnacle Industries was founded in 1987 in Portland, Oregon. The company started as a small manufacturing firm specializing in precision metal components. Over three decades, it has grown into a diversified industrial conglomerate with operations in 14 countries.' },
      { id: 'sf2-c2', relevance: 0.65, text: 'The board of directors at Pinnacle Industries includes representatives from major institutional investors and independent members with expertise in manufacturing, technology, and finance. Board meetings are held quarterly at the company headquarters.' },
      { id: 'sf2-c3', relevance: 0.60, text: 'Pinnacle Industries reported annual revenue of $3.8 billion in fiscal year 2024. The aerospace division was the largest contributor at $1.4 billion, followed by the automotive components division at $980 million. Operating margins improved to 14.2% from 12.8% the prior year.' },
      { id: 'sf2-c4', relevance: 0.72, text: 'The companys workforce numbers approximately 22,000 employees globally. Major facilities are located in Portland, Detroit, Stuttgart, and Shanghai. Employee satisfaction surveys indicate an 82% positive rating, above the industry average of 74%.' },
      { id: 'sf2-c5', relevance: 0.55, text: 'Pinnacle Industries recently invested $340 million in a new research and development center in Austin, Texas. The facility focuses on advanced materials science and additive manufacturing technologies. Over 200 researchers and engineers will staff the center by mid-2025.' },
      { id: 'sf2-c6', relevance: 0.62, text: 'Sustainability initiatives at Pinnacle Industries include a commitment to carbon neutrality by 2035. The company has reduced water usage by 28% since 2019 and sources 45% of its energy from renewable sources. An environmental impact report is published annually.' },
      { id: 'sf2-c7', relevance: 0.90, text: 'Margaret Thornton has served as Chief Executive Officer of Pinnacle Industries since 2019. Before joining Pinnacle, she held executive positions at Lockheed Martin and General Electric. Under her leadership, the company has expanded into aerospace composites and electric vehicle components.' },
      { id: 'sf2-c8', relevance: 0.58, text: 'The companys stock has outperformed the S&P 500 Industrials index over the past three years, delivering a total return of 67%. Analysts attribute this to disciplined capital allocation and successful entry into high-growth markets.' },
      { id: 'sf2-c9', relevance: 0.50, text: 'Pinnacle Industries maintains strategic partnerships with Boeing, Airbus, and Toyota. These long-term supply agreements provide revenue stability and facilitate joint development of next-generation components. Partnership contracts are typically structured for five to seven year terms.' },
      { id: 'sf2-c10', relevance: 0.48, text: 'Corporate social responsibility programs at Pinnacle include STEM education grants totaling $12 million annually, community development funds in factory towns, and a matching donations program for employee charitable giving.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /margaret\s*thornton/i.test(r),
    tags: ['rag', 'single-fact'],
  },

  // sf3: Chemical Formula -- answer in chunk 3 of 6
  {
    id: 'rag-sf3',
    category: 'RAG_SingleFact',
    name: 'Chemical Formula',
    expected: 'C8H10N4O2',
    chunks: [
      { id: 'sf3-c1', relevance: 0.70, text: 'Caffeine is a central nervous system stimulant that belongs to the methylxanthine class of psychoactive drugs. It is the worlds most widely consumed psychoactive substance. Unlike many other psychoactive substances, caffeine is legal and unregulated in nearly all parts of the world.' },
      { id: 'sf3-c2', relevance: 0.65, text: 'The primary dietary sources of caffeine are coffee beans, tea leaves, cocoa beans, and kola nuts. A typical 8-ounce cup of coffee contains 80 to 100 milligrams of caffeine, while a cup of green tea contains approximately 25 to 50 milligrams. Energy drinks can contain between 40 and 250 milligrams per serving.' },
      { id: 'sf3-c3', relevance: 0.92, text: 'The molecular formula of caffeine is C8H10N4O2, with a molar mass of 194.19 grams per mole. It appears as a white crystalline powder with a bitter taste. The compound has a melting point of 235 degrees Celsius and is moderately soluble in water at room temperature.' },
      { id: 'sf3-c4', relevance: 0.60, text: 'Caffeine works by blocking adenosine receptors in the brain. Adenosine normally promotes sleep and relaxation, so when caffeine blocks these receptors, it leads to increased alertness and reduced perception of fatigue. The effects typically begin within 15 to 45 minutes of consumption.' },
      { id: 'sf3-c5', relevance: 0.55, text: 'Regular caffeine consumption leads to physiological dependence. Withdrawal symptoms include headache, fatigue, irritability, and difficulty concentrating. These symptoms typically begin 12 to 24 hours after the last dose and can last for up to nine days.' },
      { id: 'sf3-c6', relevance: 0.50, text: 'The FDA recommends a maximum daily caffeine intake of 400 milligrams for healthy adults, roughly equivalent to four cups of brewed coffee. Pregnant individuals are advised to limit intake to 200 milligrams per day. Excessive consumption can cause anxiety, insomnia, and rapid heartbeat.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /C8H10N4O2/i.test(r),
    tags: ['rag', 'single-fact'],
  },

  // sf4: Population Count -- answer in chunk 6 of 8
  {
    id: 'rag-sf4',
    category: 'RAG_SingleFact',
    name: 'Population Count',
    expected: '5.9 million',
    chunks: [
      { id: 'sf4-c1', relevance: 0.68, text: 'Norway is a Nordic country in Northern Europe, occupying the western portion of the Scandinavian Peninsula. It shares borders with Sweden, Finland, and Russia. The country is known for its dramatic fjords, glaciers, and the Northern Lights visible in its Arctic regions.' },
      { id: 'sf4-c2', relevance: 0.72, text: 'The Norwegian economy is heavily influenced by its petroleum sector. Norway is the largest oil producer in Western Europe, and its Government Pension Fund Global, commonly known as the oil fund, is the worlds largest sovereign wealth fund with assets exceeding $1.4 trillion.' },
      { id: 'sf4-c3', relevance: 0.60, text: 'Oslo serves as the capital and most populous city of Norway. The city is a major center for maritime industry, banking, and technology startups. Other important cities include Bergen, Trondheim, and Stavanger, each with distinct cultural and economic identities.' },
      { id: 'sf4-c4', relevance: 0.55, text: 'Norways education system is publicly funded and offers free university tuition for both domestic and international students. The country consistently ranks highly in global education indices. The literacy rate is effectively 100 percent among adults.' },
      { id: 'sf4-c5', relevance: 0.65, text: 'The Norwegian political system is a constitutional monarchy with a parliamentary democracy. King Harald V has reigned since 1991. The parliament, known as the Storting, has 169 seats. Multi-party coalitions are typical in Norwegian governance.' },
      { id: 'sf4-c6', relevance: 0.90, text: 'As of the 2024 census, Norways total population stands at approximately 5.9 million people. The population density is about 15 people per square kilometer, making it one of the least densely populated countries in Europe. Most residents live in the southern coastal regions.' },
      { id: 'sf4-c7', relevance: 0.52, text: 'Norwegian cuisine features seafood prominently, with salmon, cod, and herring being staples. Traditional dishes include rakfisk, lutefisk, and farikal. The country also has a strong coffee culture, with Norwegians among the highest per capita coffee consumers in the world.' },
      { id: 'sf4-c8', relevance: 0.48, text: 'Norway has been a pioneer in electric vehicle adoption. In 2023, over 80% of new car sales were fully electric vehicles. The government offers significant tax incentives and infrastructure investment to promote zero-emission transportation.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /5\.9\s*million/i.test(r) || /5,900,000/.test(r),
    tags: ['rag', 'single-fact'],
  },

  // sf5: Release Date -- answer in chunk 4 of 7
  {
    id: 'rag-sf5',
    category: 'RAG_SingleFact',
    name: 'Release Date',
    expected: 'March 15, 2024',
    chunks: [
      { id: 'sf5-c1', relevance: 0.70, text: 'NovaSoft Framework is an open-source application platform designed for building enterprise-grade web applications. It supports multiple programming languages including Java, Python, and TypeScript. The framework emphasizes developer productivity and application security.' },
      { id: 'sf5-c2', relevance: 0.65, text: 'The architecture of NovaSoft Framework follows a modular plugin system. Developers can extend functionality through officially maintained plugins or community-contributed extensions. The plugin registry contains over 2,400 available packages covering authentication, data persistence, and messaging.' },
      { id: 'sf5-c3', relevance: 0.72, text: 'Performance benchmarks show NovaSoft Framework handling 12,000 requests per second on standard hardware configurations. Memory usage averages 180 megabytes for a typical application instance. The framework includes built-in connection pooling and request caching for optimal throughput.' },
      { id: 'sf5-c4', relevance: 0.92, text: 'NovaSoft Framework version 4.0, codenamed Phoenix, was officially released on March 15, 2024. This major release introduced native WebAssembly support, a redesigned configuration system, and improved hot-reload capabilities. The release followed an eight-month beta testing period with over 500 community contributors.' },
      { id: 'sf5-c5', relevance: 0.58, text: 'Migration from NovaSoft 3.x to 4.0 requires updating the dependency manifest and adjusting deprecated API calls. The team provides an automated migration tool that handles approximately 90% of required changes. A comprehensive migration guide is available in the official documentation.' },
      { id: 'sf5-c6', relevance: 0.55, text: 'The NovaSoft community includes over 85,000 developers worldwide. An annual conference, NovaCon, attracts approximately 3,000 attendees. Regional meetup groups are active in 40 countries. The framework is used by companies including Shopify, Stripe, and Deutsche Bank.' },
      { id: 'sf5-c7', relevance: 0.50, text: 'Long-term support for NovaSoft 3.x will continue until December 2025. Security patches will be provided during this period, but no new features will be added. Organizations are encouraged to plan their migration to version 4.0 within the support window.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /march\s*15/i.test(r) && /2024/.test(r),
    tags: ['rag', 'single-fact'],
  },

  // sf6: Temperature Record -- answer in chunk 8 of 9
  {
    id: 'rag-sf6',
    category: 'RAG_SingleFact',
    name: 'Temperature Record',
    expected: '48.8 degrees Celsius',
    chunks: [
      { id: 'sf6-c1', relevance: 0.68, text: 'Death Valley, located in eastern California, is the hottest and driest area in North America. The valley is a long, narrow basin stretching 225 kilometers in length. It sits below sea level, with Badwater Basin at minus 86 meters being the lowest point in North America.' },
      { id: 'sf6-c2', relevance: 0.62, text: 'The extreme temperatures in Death Valley are caused by a combination of factors including its below-sea-level elevation, narrow north-south orientation, and surrounding mountain ranges that trap hot air. Solar radiation heats the valley floor, and the mountain walls reflect heat back downward.' },
      { id: 'sf6-c3', relevance: 0.70, text: 'The World Meteorological Organization maintains official records of global weather extremes. Temperature records must be verified through calibrated instruments, standardized measurement protocols, and independent review. Several historical claims have been invalidated due to measurement errors.' },
      { id: 'sf6-c4', relevance: 0.55, text: 'Climate monitoring stations in desert regions face unique challenges. Sand and dust can affect sensor accuracy. Solar shields are required to prevent direct radiation from influencing air temperature readings. Stations are typically positioned 1.5 meters above ground level per WMO standards.' },
      { id: 'sf6-c5', relevance: 0.65, text: 'Heat waves have become more frequent and intense globally due to climate change. Urban heat island effects can amplify temperatures in cities by 2 to 5 degrees Celsius compared to surrounding rural areas. Public health responses have adapted to include cooling centers and heat advisories.' },
      { id: 'sf6-c6', relevance: 0.72, text: 'The highest verified temperature ever recorded on Earth was 56.7 degrees Celsius at Furnace Creek Ranch in Death Valley on July 10, 1913. However, some meteorologists have questioned the accuracy of this reading due to the measurement technology available at that time.' },
      { id: 'sf6-c7', relevance: 0.58, text: 'Australia, India, and the Middle East regularly experience extreme heat events. Kuwait recorded 53.9 degrees Celsius in 2016. Parts of Pakistan and Iran have seen wet-bulb temperatures approaching the limits of human survivability during recent heat waves.' },
      { id: 'sf6-c8', relevance: 0.91, text: 'Europe set its all-time verified temperature record on August 11, 2021, when a station in Syracuse, Sicily, recorded 48.8 degrees Celsius. The reading was confirmed by the Italian meteorological agency and submitted to the WMO for official recognition. The previous European record was 48.0 degrees in Athens in 1977.' },
      { id: 'sf6-c9', relevance: 0.50, text: 'Adaptation strategies for extreme heat include white roof coatings, urban tree canopy expansion, and redesigned building codes. Some cities in the Middle East have experimented with outdoor air conditioning systems in public spaces. Research continues into heat-resistant crop varieties for agricultural resilience.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /48\.8/i.test(r),
    tags: ['rag', 'single-fact'],
  },
];

// ============================================================
// RAG_MultiFact (6 tests) -- Answer requires 2-3 chunks
// ============================================================

const MF_TESTS: RAGTestCase[] = [
  // mf1: Total Revenue -- need to add Q1+Q2+Q3+Q4 from different chunks
  {
    id: 'rag-mf1',
    category: 'RAG_MultiFact',
    name: 'Total Revenue',
    expected: '$218.1 million',
    chunks: [
      { id: 'mf1-c1', relevance: 0.85, text: 'Veritas Corp Q1 2024 financial results: Revenue reached $48.3 million for the first quarter, driven by strong demand in the enterprise software segment. Operating expenses were $31.2 million, resulting in an operating margin of 35.4%. The customer acquisition cost decreased by 8% compared to Q1 2023.' },
      { id: 'mf1-c2', relevance: 0.70, text: 'Veritas Corp announced a strategic partnership with CloudScale Inc. to co-develop integrated analytics solutions. The partnership is expected to generate additional revenue streams beginning in 2025. Both companies will share development costs equally.' },
      { id: 'mf1-c3', relevance: 0.83, text: 'For the second quarter of 2024, Veritas Corp reported revenue of $52.7 million, an increase of 9.1% over Q1. The growth was attributed to the launch of the AnalyticsPlus product line. Subscription revenue accounted for 78% of total Q2 revenue.' },
      { id: 'mf1-c4', relevance: 0.65, text: 'The company expanded its workforce by 120 employees during 2024, bringing the total headcount to 1,450. Most new hires were in engineering and customer success roles. Employee retention rate remained above 92% for the year.' },
      { id: 'mf1-c5', relevance: 0.82, text: 'Third quarter 2024 revenue for Veritas Corp was $57.9 million. This represented the strongest quarter in company history, exceeding analyst estimates by $3.2 million. The Asia-Pacific region showed particularly strong growth at 42% year-over-year.' },
      { id: 'mf1-c6', relevance: 0.60, text: 'Veritas Corp invested $18.5 million in research and development during 2024. Key focus areas included machine learning model optimization, real-time data streaming, and multi-cloud deployment capabilities. Three new patents were filed during the year.' },
      { id: 'mf1-c7', relevance: 0.80, text: 'Q4 2024 revenue for Veritas Corp came in at $59.2 million, closing out a year of consistent growth. December was the single strongest month, boosted by annual enterprise license renewals. Full-year subscription renewal rate was 94.3%.' },
      { id: 'mf1-c8', relevance: 0.55, text: 'Looking ahead to 2025, Veritas Corp management provided guidance of $240 to $260 million in total revenue. The company plans to enter the Latin American market and launch two new product lines. Capital expenditure is budgeted at $25 million for infrastructure expansion.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /218\.1/i.test(r),
    tags: ['rag', 'multi-fact'],
  },

  // mf2: Meeting Attendees -- names spread across 3 chunks
  {
    id: 'rag-mf2',
    category: 'RAG_MultiFact',
    name: 'Meeting Attendees',
    expected: 'Sarah Chen, David Park, Lisa Novak, James Wilson, Maria Santos, Tom Bradley',
    chunks: [
      { id: 'mf2-c1', relevance: 0.85, text: 'Product roadmap meeting held on November 12, 2024 at 10:00 AM in Conference Room B. Sarah Chen (VP Engineering) opened the meeting with an overview of Q4 priorities. David Park (Lead Architect) presented the technical feasibility assessment for the proposed API redesign.' },
      { id: 'mf2-c2', relevance: 0.70, text: 'The proposed API redesign would affect 14 existing endpoints and introduce 6 new ones. Backward compatibility will be maintained through versioned endpoints. The estimated development effort is 8 to 12 weeks for the core team.' },
      { id: 'mf2-c3', relevance: 0.82, text: 'Lisa Novak (Product Manager) presented customer feedback data showing 73% of enterprise clients requesting improved batch processing capabilities. James Wilson (QA Lead) raised concerns about the testing timeline and requested an additional two weeks for comprehensive integration testing.' },
      { id: 'mf2-c4', relevance: 0.60, text: 'The budget allocation for the API redesign project was discussed. Engineering resources will be partially redirected from the maintenance backlog. The team agreed to deprioritize three low-impact feature requests to free up capacity.' },
      { id: 'mf2-c5', relevance: 0.80, text: 'Maria Santos (UX Designer) demonstrated updated wireframes for the developer portal, incorporating the new endpoints. Tom Bradley (DevOps Lead) confirmed that the deployment pipeline could support the phased rollout plan with zero-downtime releases.' },
      { id: 'mf2-c6', relevance: 0.55, text: 'Action items from the meeting include: finalize API specification by November 22, begin sprint planning by November 25, and schedule a follow-up review for December 6. Meeting notes were distributed to all stakeholders via the internal wiki.' },
      { id: 'mf2-c7', relevance: 0.50, text: 'Related meetings are scheduled for the security review on November 15 and the infrastructure capacity planning session on November 18. The API working group will meet bi-weekly starting November 19.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => {
      const lower = r.toLowerCase();
      const names = ['sarah chen', 'david park', 'lisa novak', 'james wilson', 'maria santos', 'tom bradley'];
      return names.filter(n => lower.includes(n)).length >= 5;
    },
    tags: ['rag', 'multi-fact'],
  },

  // mf3: Recipe Ingredients -- full list split across 2 chunks
  {
    id: 'rag-mf3',
    category: 'RAG_MultiFact',
    name: 'Recipe Ingredients',
    expected: 'flour, sugar, butter, eggs, vanilla, baking powder, milk, salt',
    chunks: [
      { id: 'mf3-c1', relevance: 0.60, text: 'Classic Victoria sponge cake has been a staple of British baking since the 19th century, named after Queen Victoria who enjoyed a slice with her afternoon tea. The cake consists of two layers of sponge filled with jam and cream.' },
      { id: 'mf3-c2', relevance: 0.88, text: 'Victoria Sponge Cake - Dry Ingredients: You will need 225 grams of self-raising flour, 200 grams of caster sugar, one teaspoon of baking powder, and a quarter teaspoon of fine salt. Sift the flour and baking powder together into a large mixing bowl before combining with other dry ingredients.' },
      { id: 'mf3-c3', relevance: 0.65, text: 'Preheat your oven to 180 degrees Celsius or 350 degrees Fahrenheit. Grease and line two 20-centimeter round cake tins with baking parchment. The tins should be identical in size for even layers.' },
      { id: 'mf3-c4', relevance: 0.86, text: 'Victoria Sponge Cake - Wet Ingredients: Cream together 200 grams of unsalted butter with the sugar until light and fluffy. Beat in 4 large eggs one at a time, adding a tablespoon of flour with each egg to prevent curdling. Stir in 2 teaspoons of vanilla extract and 3 tablespoons of whole milk.' },
      { id: 'mf3-c5', relevance: 0.55, text: 'Bake for 22 to 25 minutes until golden and a skewer inserted into the center comes out clean. Allow cakes to cool in the tins for 10 minutes before turning out onto a wire rack. Cool completely before assembling.' },
      { id: 'mf3-c6', relevance: 0.50, text: 'For the filling, spread one layer with raspberry jam and top with freshly whipped cream. Place the second layer on top and dust with icing sugar. The cake is best served on the day it is made but will keep in an airtight container for two days.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => {
      const lower = r.toLowerCase();
      const ingredients = ['flour', 'sugar', 'butter', 'egg', 'vanilla', 'baking powder', 'milk', 'salt'];
      return ingredients.filter(i => lower.includes(i)).length >= 6;
    },
    tags: ['rag', 'multi-fact'],
  },

  // mf4: Flight Route -- departure in one chunk, arrival in another
  {
    id: 'rag-mf4',
    category: 'RAG_MultiFact',
    name: 'Flight Route',
    expected: 'Frankfurt to Tokyo',
    chunks: [
      { id: 'mf4-c1', relevance: 0.85, text: 'Lufthansa flight LH716 departs from Frankfurt International Airport Terminal 1. Boarding begins 45 minutes before departure. Passengers should arrive at the terminal at least 3 hours before the scheduled departure time for international flights. The departure gate is typically in the B concourse.' },
      { id: 'mf4-c2', relevance: 0.70, text: 'The aircraft assigned to this route is a Boeing 747-8 Intercontinental in a three-class configuration. Business class features lie-flat seats with direct aisle access. Economy class has a 3-4-3 seating arrangement with 31-inch seat pitch.' },
      { id: 'mf4-c3', relevance: 0.60, text: 'In-flight services include a full meal service with two hot meals and a snack basket available throughout the flight. The entertainment system offers over 150 movies, 200 television episodes, and live flight tracking. Wi-Fi connectivity is available for purchase.' },
      { id: 'mf4-c4', relevance: 0.83, text: 'Flight LH716 arrives at Tokyo Narita International Airport Terminal 1. The scheduled flight duration is approximately 11 hours and 30 minutes. Immigration and customs processing at Narita typically takes 30 to 60 minutes. Airport limousine buses and the Narita Express train connect to central Tokyo.' },
      { id: 'mf4-c5', relevance: 0.55, text: 'Baggage allowance for this route includes two checked bags up to 23 kilograms each in economy class and two bags up to 32 kilograms each in business class. Carry-on luggage is limited to one bag plus one personal item, with a combined weight not exceeding 8 kilograms.' },
      { id: 'mf4-c6', relevance: 0.50, text: 'Connecting flights from Narita to domestic Japanese destinations are available through All Nippon Airways and Japan Airlines. Popular onward destinations include Osaka, Sapporo, and Fukuoka. A minimum connection time of 90 minutes is recommended for international to domestic transfers.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('frankfurt') && lower.includes('tokyo');
    },
    tags: ['rag', 'multi-fact'],
  },

  // mf5: Full Address -- street in one chunk, city/zip in another
  {
    id: 'rag-mf5',
    category: 'RAG_MultiFact',
    name: 'Full Address',
    expected: '742 Evergreen Terrace, Springfield, IL 62704',
    chunks: [
      { id: 'mf5-c1', relevance: 0.72, text: 'The new regional distribution center for MegaRetail Corp is located in the Springfield industrial zone. The facility covers 85,000 square feet and includes automated sorting systems capable of processing 15,000 packages per hour.' },
      { id: 'mf5-c2', relevance: 0.86, text: 'The street address of the MegaRetail Corp Springfield distribution center is 742 Evergreen Terrace. The facility entrance for delivery trucks is on the north side of the building, while the employee entrance faces south on Maple Drive. Visitor parking accommodates 40 vehicles.' },
      { id: 'mf5-c3', relevance: 0.65, text: 'Operating hours for the distribution center are Monday through Saturday, 6:00 AM to 10:00 PM. Sunday operations are limited to essential order processing from 8:00 AM to 4:00 PM. Peak season extended hours run from November 15 through January 5.' },
      { id: 'mf5-c4', relevance: 0.84, text: 'The mailing address for all correspondence to the Springfield distribution center should include the city designation Springfield, Illinois, with the ZIP code 62704. Overnight deliveries should be sent via FedEx or UPS to ensure next-day arrival.' },
      { id: 'mf5-c5', relevance: 0.58, text: 'The distribution center employs 340 full-time and 180 part-time workers. During peak holiday season, an additional 200 temporary staff are hired through local staffing agencies. Employee benefits include health insurance, paid time off, and a 401k matching program.' },
      { id: 'mf5-c6', relevance: 0.52, text: 'Regional manager Karen Mitchell oversees operations at the Springfield facility. She reports to the VP of Logistics based at corporate headquarters in Chicago. Monthly performance reviews are conducted via video conference with the executive team.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('742') && lower.includes('evergreen') && lower.includes('springfield') && /62704/.test(r);
    },
    tags: ['rag', 'multi-fact'],
  },

  // mf6: Comparison -- Product A specs in one chunk, Product B in another
  {
    id: 'rag-mf6',
    category: 'RAG_MultiFact',
    name: 'Laptop Comparison',
    expected: 'TechPro X1 has more RAM (32GB vs 16GB)',
    chunks: [
      { id: 'mf6-c1', relevance: 0.60, text: 'The laptop market in 2024 has seen significant innovation in processor efficiency and display technology. Apple, Dell, Lenovo, and HP continue to dominate market share, while newer entrants like Framework offer modular repair-friendly alternatives.' },
      { id: 'mf6-c2', relevance: 0.87, text: 'TechPro X1 Specifications: The TechPro X1 features an Intel Core i7-14700H processor with 14 cores and a boost clock of 5.0 GHz. It comes equipped with 32 GB of DDR5 RAM at 4800 MHz. Storage is a 1 TB NVMe Gen4 SSD. The 15.6-inch display runs at 2560x1440 resolution with 120 Hz refresh rate. Battery capacity is 72 Wh. Weight is 1.8 kg. Price: $1,499.' },
      { id: 'mf6-c3', relevance: 0.55, text: 'Industry analysts predict that by 2025, most premium laptops will ship with a minimum of 32 GB RAM as memory-intensive applications and AI workloads become mainstream. DDR5 adoption continues to accelerate across all price segments.' },
      { id: 'mf6-c4', relevance: 0.85, text: 'DataBook Pro Specifications: The DataBook Pro is powered by an AMD Ryzen 9 7940HS processor with 8 cores and a boost clock of 5.2 GHz. It includes 16 GB of DDR5 RAM at 5600 MHz. Storage is a 512 GB NVMe Gen4 SSD. The 14-inch OLED display runs at 2880x1800 resolution with 90 Hz refresh rate. Battery capacity is 84 Wh. Weight is 1.5 kg. Price: $1,399.' },
      { id: 'mf6-c5', relevance: 0.65, text: 'Both laptops include Thunderbolt 4 ports, Wi-Fi 6E connectivity, and backlit keyboards. Warranty terms are similar at two years for both manufacturers. Customer satisfaction ratings are 4.5 out of 5 for TechPro X1 and 4.3 out of 5 for DataBook Pro based on verified reviews.' },
      { id: 'mf6-c6', relevance: 0.50, text: 'For creative professionals, display color accuracy is a critical factor. Both laptops offer 100% sRGB coverage. The DataBook Pro OLED panel additionally covers 95% of the DCI-P3 color gamut, making it more suitable for video editing and color-critical design work.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('techpro') && /32/i.test(r) && /16/i.test(r);
    },
    tags: ['rag', 'multi-fact'],
  },
];

// ============================================================
// RAG_Reasoning (5 tests) -- Need to reason over chunks
// ============================================================

const RR_TESTS: RAGTestCase[] = [
  // rr1: Best Employee -- performance metrics in different chunks
  {
    id: 'rag-rr1',
    category: 'RAG_Reasoning',
    name: 'Best Employee',
    expected: 'Priya Sharma',
    chunks: [
      { id: 'rr1-c1', relevance: 0.82, text: 'Annual performance review for Marcus Johnson (Sales Team): Total sales closed: $1.2 million. Client retention rate: 88%. New accounts acquired: 14. Customer satisfaction score: 4.1 out of 5. Projects completed on time: 90%. Overall performance rating: Exceeds Expectations.' },
      { id: 'rr1-c2', relevance: 0.80, text: 'Annual performance review for Elena Rodriguez (Sales Team): Total sales closed: $980,000. Client retention rate: 95%. New accounts acquired: 8. Customer satisfaction score: 4.7 out of 5. Projects completed on time: 100%. Overall performance rating: Exceeds Expectations.' },
      { id: 'rr1-c3', relevance: 0.85, text: 'Annual performance review for Priya Sharma (Sales Team): Total sales closed: $1.5 million. Client retention rate: 92%. New accounts acquired: 19. Customer satisfaction score: 4.5 out of 5. Projects completed on time: 95%. Overall performance rating: Outstanding.' },
      { id: 'rr1-c4', relevance: 0.78, text: 'Annual performance review for Thomas Weber (Sales Team): Total sales closed: $870,000. Client retention rate: 91%. New accounts acquired: 11. Customer satisfaction score: 4.3 out of 5. Projects completed on time: 85%. Overall performance rating: Meets Expectations.' },
      { id: 'rr1-c5', relevance: 0.65, text: 'The sales team performance criteria for 2024 were: Total sales (weight 30%), client retention (weight 20%), new accounts (weight 20%), customer satisfaction (weight 15%), and on-time delivery (weight 15%). Outstanding rating requires exceeding targets in at least four of five categories.' },
      { id: 'rr1-c6', relevance: 0.55, text: 'Quarterly team meetings reviewed pipeline health and forecast accuracy. The sales team collectively achieved 112% of its annual target. The company plans to expand the team by three positions in Q1 2025 to support growth in the healthcare vertical.' },
      { id: 'rr1-c7', relevance: 0.50, text: 'Compensation adjustments for the sales team will be announced in January. Performance bonuses are calculated as a percentage of base salary multiplied by the performance rating multiplier. Outstanding ratings receive a 1.5x multiplier.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /priya\s*sharma/i.test(r),
    tags: ['rag', 'reasoning'],
  },

  // rr2: Cheapest Option -- prices in different chunks
  {
    id: 'rag-rr2',
    category: 'RAG_Reasoning',
    name: 'Cheapest Option',
    expected: 'GreenHost Basic',
    chunks: [
      { id: 'rr2-c1', relevance: 0.82, text: 'CloudKing Standard plan: $29.99 per month. Includes 50 GB SSD storage, 2 GB RAM, 2 vCPUs, unlimited bandwidth, free SSL certificate, and daily backups. Ideal for small business websites and WordPress installations. 99.9% uptime guarantee.' },
      { id: 'rr2-c2', relevance: 0.85, text: 'HostPrime Starter plan: $19.99 per month. Includes 30 GB SSD storage, 1 GB RAM, 1 vCPU, 1 TB monthly bandwidth, free SSL certificate, and weekly backups. Suitable for personal websites and blogs. 99.5% uptime guarantee.' },
      { id: 'rr2-c3', relevance: 0.80, text: 'NetForge Essential plan: $24.99 per month. Includes 40 GB NVMe storage, 2 GB RAM, 2 vCPUs, 2 TB monthly bandwidth, free SSL certificate, and daily backups. Designed for growing businesses and e-commerce sites. 99.9% uptime guarantee.' },
      { id: 'rr2-c4', relevance: 0.88, text: 'GreenHost Basic plan: $12.99 per month. Includes 20 GB SSD storage, 512 MB RAM, 1 vCPU, 500 GB monthly bandwidth, free SSL certificate, and weekly backups. Best for static websites and landing pages. 99.0% uptime guarantee. Powered by 100% renewable energy.' },
      { id: 'rr2-c5', relevance: 0.78, text: 'DataVault Pro plan: $34.99 per month. Includes 100 GB NVMe storage, 4 GB RAM, 4 vCPUs, unlimited bandwidth, free SSL certificate, daily backups with 30-day retention, and DDoS protection. Enterprise-grade hosting for high-traffic applications.' },
      { id: 'rr2-c6', relevance: 0.60, text: 'When selecting a hosting provider, consider factors beyond price including server location, customer support availability, scalability options, and migration assistance. Most providers offer a 30-day money-back guarantee for new customers.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /greenhost/i.test(r),
    tags: ['rag', 'reasoning'],
  },

  // rr3: Timeline Order -- events in different chunks, need to order chronologically
  {
    id: 'rag-rr3',
    category: 'RAG_Reasoning',
    name: 'Timeline Order',
    expected: 'Prototype Demo, Beta Launch, Security Audit, Public Release',
    chunks: [
      { id: 'rr3-c1', relevance: 0.82, text: 'The public release of CloudVault was scheduled for September 20, 2024. Marketing campaigns began two weeks prior, and the launch event was held at the San Francisco Convention Center. Over 2,000 users signed up within the first 24 hours.' },
      { id: 'rr3-c2', relevance: 0.78, text: 'CloudVault underwent a comprehensive security audit conducted by CyberSafe Inc. from July 8 to August 2, 2024. The audit covered penetration testing, code review, and compliance verification. Three medium-severity vulnerabilities were identified and patched before the public release.' },
      { id: 'rr3-c3', relevance: 0.65, text: 'The CloudVault development team consisted of 12 engineers, 3 designers, and 2 product managers. Development was conducted using two-week sprint cycles. The project used a monorepo approach with automated CI/CD pipelines.' },
      { id: 'rr3-c4', relevance: 0.80, text: 'The CloudVault beta was launched on May 15, 2024, with invitations sent to 500 early adopters. Beta testers provided feedback through an in-app survey system. Over 340 bug reports were submitted during the beta period, of which 89% were resolved.' },
      { id: 'rr3-c5', relevance: 0.85, text: 'An early prototype of CloudVault was demonstrated to stakeholders on February 28, 2024. The demo showcased core file synchronization and sharing capabilities. Stakeholder feedback led to the addition of end-to-end encryption as a mandatory feature before public release.' },
      { id: 'rr3-c6', relevance: 0.55, text: 'CloudVault uses AES-256 encryption for data at rest and TLS 1.3 for data in transit. The key management system is based on a zero-knowledge architecture, meaning the company cannot access user data. Recovery keys are generated during initial account setup.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => {
      const lower = r.toLowerCase();
      const proto = lower.indexOf('prototype') !== -1 ? lower.indexOf('prototype') : lower.indexOf('february');
      const beta = lower.indexOf('beta') !== -1 ? lower.indexOf('beta') : lower.indexOf('may');
      const audit = lower.indexOf('audit') !== -1 ? lower.indexOf('audit') : lower.indexOf('security');
      const release = lower.indexOf('public') !== -1 ? lower.indexOf('public') : lower.indexOf('september');
      return proto < beta && beta < audit && audit < release;
    },
    tags: ['rag', 'reasoning'],
  },

  // rr4: Eligibility Check -- criteria in one chunk, applicant in another
  {
    id: 'rag-rr4',
    category: 'RAG_Reasoning',
    name: 'Eligibility Check',
    expected: 'Not eligible',
    chunks: [
      { id: 'rr4-c1', relevance: 0.90, text: 'TechGrant Program Eligibility Criteria: Applicants must meet ALL of the following requirements: (1) Company must be incorporated for at least 2 years, (2) Annual revenue must be between $100,000 and $5 million, (3) Must have fewer than 50 full-time employees, (4) Must be headquartered in the United States, (5) Must demonstrate a technical innovation in their core product.' },
      { id: 'rr4-c2', relevance: 0.85, text: 'NovaTech Solutions application details: Founded in March 2021. Incorporated in Delaware. Annual revenue for fiscal year 2024: $2.3 million. Current employee count: 28 full-time, 12 contractors. Headquarters: Toronto, Canada with a satellite office in Austin, Texas. Primary product: AI-powered supply chain optimization platform.' },
      { id: 'rr4-c3', relevance: 0.65, text: 'The TechGrant Program has awarded $45 million across 120 companies since its inception in 2018. Average grant size is $375,000 per recipient. The program prioritizes companies working in artificial intelligence, clean energy, and healthcare technology.' },
      { id: 'rr4-c4', relevance: 0.60, text: 'Previous TechGrant recipients include DataFlow (2020, $400K for real-time analytics), MedScan (2021, $350K for diagnostic imaging), and SolarGrid (2022, $500K for smart grid optimization). All recipients are required to submit quarterly progress reports.' },
      { id: 'rr4-c5', relevance: 0.55, text: 'The application process involves three stages: initial screening, technical review by an expert panel, and a final interview with the grant committee. The complete cycle from application to decision takes approximately 90 days.' },
      { id: 'rr4-c6', relevance: 0.50, text: 'Grant funds may be used for personnel costs, equipment purchases, cloud computing infrastructure, and intellectual property protection. Funds may not be used for marketing, office space, or general administrative expenses.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('not eligible') || lower.includes('ineligible') || lower.includes('does not qualify') || lower.includes('not qualify') || lower.includes('disqualified') || (lower.includes('no') && lower.includes('headquartered'));
    },
    tags: ['rag', 'reasoning'],
  },

  // rr5: Cause and Effect -- event in one chunk, consequence in another
  {
    id: 'rag-rr5',
    category: 'RAG_Reasoning',
    name: 'Cause and Effect',
    expected: 'Supply chain disruption caused 3-week production delay',
    chunks: [
      { id: 'rr5-c1', relevance: 0.85, text: 'On October 3, 2024, Typhoon Hailong made landfall in southern Taiwan, causing widespread flooding and infrastructure damage. The Hsinchu Science Park, home to several major semiconductor fabrication plants, reported power outages lasting 36 hours. TSMCs Fab 14 and Fab 15 temporarily halted production.' },
      { id: 'rr5-c2', relevance: 0.70, text: 'Global semiconductor supply chains rely heavily on Taiwanese foundries for advanced chip production. TSMC alone accounts for approximately 54% of global semiconductor foundry revenue. Any disruption to Taiwanese production has cascading effects across multiple industries.' },
      { id: 'rr5-c3', relevance: 0.82, text: 'AutoDrive Corp, a US-based electric vehicle manufacturer, announced on October 21, 2024, that production at its Michigan assembly plant would be delayed by approximately three weeks. The company attributed the delay to a shortage of power management chips that are exclusively sourced from a Taiwanese foundry affected by recent severe weather.' },
      { id: 'rr5-c4', relevance: 0.60, text: 'AutoDrive Corp had planned to produce 8,500 vehicles in November 2024. The revised production estimate was lowered to 6,200 units. The company stated that it does not expect the delay to affect full-year delivery targets, as production would be accelerated in December and January.' },
      { id: 'rr5-c5', relevance: 0.55, text: 'Industry analysts have long warned about the concentration of semiconductor manufacturing in Taiwan. Diversification efforts include new fabrication plants being built in Arizona, Japan, and Germany. However, these facilities are not expected to reach full production capacity until 2027.' },
      { id: 'rr5-c6', relevance: 0.50, text: 'AutoDrive Corp stock declined 4.2% following the production delay announcement. Analysts maintained their buy rating on the stock, citing strong demand fundamentals and the temporary nature of the disruption. The company reaffirmed its full-year revenue guidance of $12 billion.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => {
      const lower = r.toLowerCase();
      return (lower.includes('typhoon') || lower.includes('taiwan') || lower.includes('supply chain') || lower.includes('semiconductor') || lower.includes('chip shortage'))
        && (lower.includes('delay') || lower.includes('production'));
    },
    tags: ['rag', 'reasoning'],
  },
];

// ============================================================
// RAG_Conflicting (5 tests) -- Chunks have contradictory info
// ============================================================

const RC_TESTS: RAGTestCase[] = [
  // rc1: Product Price -- two chunks give different prices
  {
    id: 'rag-rc1',
    category: 'RAG_Conflicting',
    name: 'Product Price',
    expected: '$349',
    chunks: [
      { id: 'rc1-c1', relevance: 0.65, text: 'The SoundMax Pro 3 wireless headphones were first announced at CES 2024 in January. Early pricing was set at $399 based on pre-production cost estimates. Pre-orders opened on the SoundMax website with a $50 deposit. The headphones feature active noise cancellation and 40-hour battery life.' },
      { id: 'rc1-c2', relevance: 0.55, text: 'Competitor products in the premium wireless headphone market include the Sony WH-1000XM5 at $348, Apple AirPods Max at $549, and Bose QuietComfort Ultra at $429. The segment has seen strong growth driven by remote work and commuting demand.' },
      { id: 'rc1-c3', relevance: 0.92, text: 'UPDATED PRICING (March 2024): SoundMax has revised the retail price of the SoundMax Pro 3 to $349, a reduction from the originally announced $399. The price adjustment reflects finalized manufacturing costs and competitive positioning. All pre-order customers will be charged the new lower price.' },
      { id: 'rc1-c4', relevance: 0.70, text: 'SoundMax Pro 3 technical specifications: Driver size 40mm, frequency response 20Hz-40kHz, Bluetooth 5.3, LDAC and aptX Adaptive codec support, weight 254 grams, USB-C charging with 5-hour playback from 15 minutes charge.' },
      { id: 'rc1-c5', relevance: 0.60, text: 'Reviews from professional audio publications have praised the SoundMax Pro 3 for its sound signature and comfort. What HiFi rated it 4.5 out of 5 stars. CNET called it the best value in premium noise-cancelling headphones for 2024.' },
      { id: 'rc1-c6', relevance: 0.50, text: 'SoundMax offers a 30-day return policy and a 2-year limited warranty on all headphone products. Extended warranty coverage for an additional year can be purchased for $39.99 at the time of sale.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /349/.test(r),
    tags: ['rag', 'conflicting'],
  },

  // rc2: Event Date -- old info vs new info
  {
    id: 'rag-rc2',
    category: 'RAG_Conflicting',
    name: 'Event Date',
    expected: 'October 18-20, 2024',
    chunks: [
      { id: 'rc2-c1', relevance: 0.60, text: 'The Global Innovation Summit has been held annually since 2015. The event brings together technology leaders, researchers, and policymakers from over 80 countries. Past keynote speakers include Satya Nadella, Fei-Fei Li, and Demis Hassabis.' },
      { id: 'rc2-c2', relevance: 0.68, text: 'Originally scheduled for September 5-7, 2024, the Global Innovation Summit at the Berlin Convention Center was expected to draw approximately 12,000 attendees. Early registration opened on April 1, 2024, with an early bird rate of 450 EUR.' },
      { id: 'rc2-c3', relevance: 0.55, text: 'The Summit program typically spans three days with a main stage for keynotes, 12 parallel tracks covering topics from quantum computing to sustainable energy, and a startup showcase area featuring 200 exhibitors. Networking events are held each evening.' },
      { id: 'rc2-c4', relevance: 0.90, text: 'SCHEDULE CHANGE NOTICE (July 2024): The Global Innovation Summit has been rescheduled to October 18-20, 2024. The venue remains the Berlin Convention Center. The change was necessitated by a major infrastructure renovation at the venue that will be completed by early October. All existing registrations remain valid.' },
      { id: 'rc2-c5', relevance: 0.62, text: 'Travel information for the Berlin Convention Center: Nearest airport is Berlin Brandenburg (BER), approximately 30 minutes by taxi. The S-Bahn station Messe Sued provides direct public transit access. Partner hotels offer discounted rates for registered attendees.' },
      { id: 'rc2-c6', relevance: 0.50, text: 'Virtual attendance options are available for those unable to travel. Livestream access covers all main stage presentations and selected breakout sessions. Virtual networking rooms use spatial audio technology. Virtual tickets are priced at 150 EUR.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /october\s*18/i.test(r),
    tags: ['rag', 'conflicting'],
  },

  // rc3: Population -- outdated census vs current estimate
  {
    id: 'rag-rc3',
    category: 'RAG_Conflicting',
    name: 'City Population',
    expected: '4.1 million',
    chunks: [
      { id: 'rc3-c1', relevance: 0.62, text: 'Riverton is the capital and largest city of the Republic of Eastland. The city was founded in 1742 and has served as the national capital since independence in 1821. It is a major financial and cultural center in the region, known for its universities and technology sector.' },
      { id: 'rc3-c2', relevance: 0.70, text: 'According to the 2015 national census, the population of Riverton was recorded at 3.2 million inhabitants. The city has experienced consistent growth over the past decades, with the 2005 census recording 2.8 million. Urban planners have struggled to keep infrastructure investment pace with population growth.' },
      { id: 'rc3-c3', relevance: 0.55, text: 'Riverton is divided into 18 administrative districts. The central business district and the tech hub district in the north have seen the most commercial development. Residential growth is concentrated in the eastern and southern suburbs where new housing developments are underway.' },
      { id: 'rc3-c4', relevance: 0.91, text: 'The 2024 population estimate for Riverton, released by the National Statistics Bureau in March 2024, places the current population at 4.1 million. This represents a 28% increase from the 2015 census figure. The growth is attributed to rural-to-urban migration and expansion of the technology sector which has attracted international talent.' },
      { id: 'rc3-c5', relevance: 0.58, text: 'Transportation in Riverton includes a metro system with 4 lines covering 85 kilometers, a bus rapid transit network, and a commuter rail system connecting to surrounding suburbs. A fifth metro line is under construction with completion expected in 2026.' },
      { id: 'rc3-c6', relevance: 0.50, text: 'Major landmarks in Riverton include the National Assembly building, the Founders Bridge spanning the Eastland River, the Museum of Modern Art, and the Riverton Botanical Gardens. The historic old town district is a UNESCO World Heritage site.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /4\.1\s*million/i.test(r) || /4,100,000/.test(r),
    tags: ['rag', 'conflicting'],
  },

  // rc4: Company Location -- old HQ vs new HQ
  {
    id: 'rag-rc4',
    category: 'RAG_Conflicting',
    name: 'Company Location',
    expected: 'Austin, Texas',
    chunks: [
      { id: 'rc4-c1', relevance: 0.65, text: 'QuantumLeap Technologies was founded in 2012 in San Jose, California. The company initially operated from a small office in downtown San Jose before moving to a larger campus in 2015. The San Jose headquarters housed engineering, marketing, and executive leadership.' },
      { id: 'rc4-c2', relevance: 0.72, text: 'QuantumLeap Technologies maintains offices in San Jose, California, where the company was originally headquartered. The San Jose office continues to serve as a major engineering hub with approximately 400 employees. The campus includes three buildings totaling 180,000 square feet.' },
      { id: 'rc4-c3', relevance: 0.55, text: 'The company has expanded internationally with offices in London, Singapore, and Bangalore. Each international office focuses on regional sales and customer support. Total global headcount reached 2,800 employees in 2024.' },
      { id: 'rc4-c4', relevance: 0.93, text: 'Effective January 2024, QuantumLeap Technologies officially relocated its corporate headquarters to Austin, Texas. The new headquarters is located in the Domain district and spans 250,000 square feet. CEO Ryan Mitchell cited lower operating costs, a growing tech talent pool, and favorable business conditions as primary reasons for the relocation.' },
      { id: 'rc4-c5', relevance: 0.60, text: 'The Austin campus includes an innovation lab, employee wellness center, and a 500-seat auditorium for company events. The building was designed to achieve LEED Platinum certification. Approximately 600 employees are based at the new headquarters.' },
      { id: 'rc4-c6', relevance: 0.50, text: 'QuantumLeap Technologies reported 2024 revenue of $890 million. The companys primary products include quantum-resistant encryption software and zero-trust network access solutions. Its customer base spans financial services, healthcare, and government sectors.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /austin/i.test(r),
    tags: ['rag', 'conflicting'],
  },

  // rc5: Software Version -- deprecated docs vs current release
  {
    id: 'rag-rc5',
    category: 'RAG_Conflicting',
    name: 'Software Version',
    expected: '3.2.1',
    chunks: [
      { id: 'rc5-c1', relevance: 0.60, text: 'FlowEngine is an open-source workflow automation platform used by over 15,000 organizations worldwide. The platform enables users to create automated workflows connecting various applications and services without writing code. It supports over 300 integrations.' },
      { id: 'rc5-c2', relevance: 0.68, text: 'FlowEngine Documentation (v2.8): The current stable version of FlowEngine is 2.8.4. This version includes the new visual workflow designer, improved error handling, and support for webhooks. Users running version 2.7 or earlier should upgrade to take advantage of performance improvements.' },
      { id: 'rc5-c3', relevance: 0.55, text: 'System requirements for FlowEngine: Node.js 18 or later, PostgreSQL 14 or later, minimum 2 GB RAM, and 10 GB disk space. Docker-based installation is recommended for production deployments. The platform runs on Linux, macOS, and Windows.' },
      { id: 'rc5-c4', relevance: 0.92, text: 'FlowEngine Release Notes (December 2024): Version 3.2.1 is now the current stable release. This release includes critical security patches, a new AI-assisted workflow builder, native Kubernetes operator support, and improved OAuth2 handling. Users on version 2.x should follow the migration guide to upgrade, as version 2.x reaches end of life on March 31, 2025.' },
      { id: 'rc5-c5', relevance: 0.62, text: 'The FlowEngine community maintains an active forum with over 50,000 members. Monthly community calls are held on the first Wednesday of each month. Contributing to FlowEngine is guided by the CONTRIBUTING.md file in the repository.' },
      { id: 'rc5-c6', relevance: 0.50, text: 'Enterprise support for FlowEngine is available through FlowEngine Inc. Support tiers include Standard (email, 48-hour response), Premium (email and phone, 4-hour response), and Critical (dedicated support engineer, 1-hour response). Pricing starts at $5,000 per year.' },
    ],
    natural: '',
    tscg: '',
    check: (r) => /3\.2\.1/.test(r),
    tags: ['rag', 'conflicting'],
  },
];

// ============================================================
// Build final test arrays — populate natural/tscg fields
// ============================================================

function populatePrompts(tests: RAGTestCase[], answerType: string): RAGTestCase[] {
  return tests.map(t => ({
    ...t,
    natural: buildNatural(t.chunks, buildQuery(t)),
    tscg: buildTscg(t.chunks, buildQuery(t), answerType),
  }));
}

function buildQuery(t: RAGTestCase): string {
  switch (t.id) {
    case 'rag-sf1': return 'What is the total approved budget for the Horizon Initiative?';
    case 'rag-sf2': return 'Who is the current CEO of Pinnacle Industries?';
    case 'rag-sf3': return 'What is the molecular formula of caffeine?';
    case 'rag-sf4': return 'What is the total population of Norway as of the 2024 census?';
    case 'rag-sf5': return 'When was NovaSoft Framework version 4.0 released?';
    case 'rag-sf6': return 'What is the highest verified temperature ever recorded in Europe?';
    case 'rag-mf1': return 'What was Veritas Corp total revenue for all four quarters of 2024 combined?';
    case 'rag-mf2': return 'Who were all the attendees at the product roadmap meeting on November 12?';
    case 'rag-mf3': return 'What are all the ingredients needed for the Victoria Sponge Cake?';
    case 'rag-mf4': return 'What are the departure and arrival cities for Lufthansa flight LH716?';
    case 'rag-mf5': return 'What is the complete mailing address of the MegaRetail Corp Springfield distribution center?';
    case 'rag-mf6': return 'Which laptop has more RAM, the TechPro X1 or the DataBook Pro, and how much does each have?';
    case 'rag-rr1': return 'Based on the performance reviews, which sales team member had the best overall performance?';
    case 'rag-rr2': return 'Which hosting plan is the cheapest?';
    case 'rag-rr3': return 'List the CloudVault project milestones in chronological order.';
    case 'rag-rr4': return 'Is NovaTech Solutions eligible for the TechGrant Program? Why or why not?';
    case 'rag-rr5': return 'What caused the production delay at AutoDrive Corp?';
    case 'rag-rc1': return 'What is the current retail price of the SoundMax Pro 3?';
    case 'rag-rc2': return 'When is the Global Innovation Summit being held?';
    case 'rag-rc3': return 'What is the current population of Riverton?';
    case 'rag-rc4': return 'Where is the headquarters of QuantumLeap Technologies?';
    case 'rag-rc5': return 'What is the current stable version of FlowEngine?';
    default: return '';
  }
}

// Build answer type mapping
function answerTypeFor(id: string): string {
  if (id.startsWith('rag-sf')) return 'concise';
  if (id.startsWith('rag-mf')) return 'detailed';
  if (id.startsWith('rag-rr')) return 'reasoned';
  if (id.startsWith('rag-rc')) return 'concise';
  return 'concise';
}

// Populate all tests
function buildAllRAGTests(): RAGTestCase[] {
  const allTests = [...SF_TESTS, ...MF_TESTS, ...RR_TESTS, ...RC_TESTS];
  return allTests.map(t => ({
    ...t,
    natural: buildNatural(t.chunks, buildQuery(t)),
    tscg: buildTscg(t.chunks, buildQuery(t), answerTypeFor(t.id)),
  }));
}

/** All 22 RAG test cases */
export const RAG_TESTS: RAGTestCase[] = buildAllRAGTests();

/** Get RAG tests by category */
export function getRAGTestsByCategory(category: string): RAGTestCase[] {
  return RAG_TESTS.filter(t => t.category === category);
}
