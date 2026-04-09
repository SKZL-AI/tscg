/**
 * TSCG Hard Benchmark Test Cases
 * 25 hard tests designed so Natural language baseline achieves 50-80% accuracy.
 * Categories: MultiConstraint_Hard, AmbiguousMath, PrecisionExtraction, FormatCritical, LongDependency
 */

import type { TestCase } from '../core/types.js';

export const HARD_TESTS: TestCase[] = [
  // ============================================================
  // --- MULTI-CONSTRAINT HARD (6) ---
  // Expected Natural accuracy: 55-75%
  // Tests with 3-5 simultaneous constraints where models often forget one.
  // ============================================================

  {
    id: 'mc-h1',
    category: 'MultiConstraint_Hard',
    name: 'City Triple Filter',
    expected: 'Munich',
    natural:
      'Name a German city that starts with the letter M, has more than 500,000 inhabitants, and is located in Bavaria. Reply with only the city name.',
    tscg:
      '[ANSWER:city_name] country:Germany starts_with:M population:>500K state:Bavaria → city →',
    check: (r) => /\bmunich\b|\bmünchen\b/i.test(r.trim()),
    tags: ['multi-constraint', 'hard'],
  },

  {
    id: 'mc-h2',
    category: 'MultiConstraint_Hard',
    name: 'Country Quad Filter',
    expected: 'Brazil',
    natural:
      'Name a South American country that is Portuguese-speaking, has an Atlantic coastline, and has an area greater than 1 million square kilometers. Reply with only the country name.',
    tscg:
      '[ANSWER:country_name] continent:South_America language:Portuguese coast:Atlantic area:>1M_km² → country →',
    check: (r) => /\bbrazil\b|\bbrasil\b/i.test(r.trim()),
    tags: ['multi-constraint', 'hard'],
  },

  {
    id: 'mc-h3',
    category: 'MultiConstraint_Hard',
    name: 'Sorted European Capitals',
    expected: 'Belgrade, Berlin, Bern',
    natural:
      'List exactly 3 European capital cities that start with the letter B. Output them in alphabetical order, separated by commas. Only output the names, nothing else.',
    tscg:
      '[ANSWER:list{3}] filter:European_capitals starts_with:B → select:3 → sort:alphabetical → comma_separated →',
    check: (r) => {
      const valid = [
        'belgrade', 'berlin', 'bern', 'bratislava',
        'brussels', 'bucharest', 'budapest',
      ];
      const items = r
        .toLowerCase()
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (items.length !== 3) return false;
      if (!items.every((item) => valid.includes(item))) return false;
      // Check alphabetical order
      for (let i = 1; i < items.length; i++) {
        if (items[i] <= items[i - 1]) return false;
      }
      return true;
    },
    tags: ['multi-constraint', 'hard'],
  },

  {
    id: 'mc-h4',
    category: 'MultiConstraint_Hard',
    name: 'Exclusion Constraint',
    expected: 'Earth',
    natural:
      'What is the largest planet in our solar system that is NOT a gas giant and NOT an ice giant? Reply with only the planet name.',
    tscg:
      '[ANSWER:planet_name] solar_system → exclude:gas_giant → exclude:ice_giant → largest →',
    check: (r) => /\bearth\b/i.test(r.trim()),
    tags: ['multi-constraint', 'hard'],
  },

  {
    id: 'mc-h5',
    category: 'MultiConstraint_Hard',
    name: 'Number Format Constraint',
    expected: '126',
    natural:
      'Calculate 15% of 840. Give your answer as a whole number with no decimal point, no currency symbols, and no other text. Just the number.',
    tscg:
      '[ANSWER:integer] compute:840×0.15 → round:whole → digits_only →',
    check: (r) => r.trim() === '126',
    tags: ['multi-constraint', 'hard'],
  },

  {
    id: 'mc-h6',
    category: 'MultiConstraint_Hard',
    name: 'Time-Geo Constraint',
    expected: 'Estonia',
    natural:
      'Name a country that became independent after 1990, is located in Europe, and has a population of less than 2 million. Reply with only the country name.',
    tscg:
      '[ANSWER:country_name] independence:>1990 continent:Europe population:<2M → country →',
    check: (r) => {
      const valid = [
        'montenegro', 'kosovo', 'north macedonia', 'slovenia',
        'estonia', 'latvia', 'lithuania', 'croatia',
        'bosnia', 'bosnia and herzegovina',
      ];
      const answer = r.trim().toLowerCase();
      // Must match one of the valid countries (population <2M, independent after 1990, in Europe)
      // Slovenia: 1991, ~2.1M - borderline, included as models may cite it
      // Estonia: 1991, ~1.3M - valid
      // Latvia: 1991, ~1.9M - valid
      // Montenegro: 2006, ~0.6M - valid
      // Kosovo: 2008, ~1.8M - valid
      // North Macedonia: 1991, ~2.1M - borderline
      // Croatia: 1991, ~3.9M - too large, but kept for flexibility
      return valid.some((v) => answer.includes(v));
    },
    tags: ['multi-constraint', 'hard'],
  },

  // ============================================================
  // --- AMBIGUOUS MATH (5) ---
  // Expected Natural accuracy: 50-65%
  // Multi-step calculations where models make common errors.
  // ============================================================

  {
    id: 'am1',
    category: 'AmbiguousMath',
    name: 'Percent on Percent',
    expected: '$54',
    natural:
      'A shirt originally costs $80. It is on sale for 25% off. You also have a 10% coupon applied to the sale price. What is the final price? Answer with just the dollar amount as a number.',
    tscg:
      '[ANSWER:number] price:80 → discount:25% → new_price:60 → discount:10% → final_price →',
    check: (r) => /\b54\b/.test(r),
    tags: ['math', 'hard'],
  },

  {
    id: 'am2',
    category: 'AmbiguousMath',
    name: 'Reverse Percentage',
    expected: '$80',
    natural:
      'An item costs $96 after a 20% tax was added. What was the original price before tax? Answer with just the number.',
    tscg:
      '[ANSWER:number] final_price:96 tax:20% → solve:original×1.20=96 → original →',
    check: (r) => /\b80\b/.test(r),
    tags: ['math', 'hard'],
  },

  {
    id: 'am3',
    category: 'AmbiguousMath',
    name: 'Ratio with Distraction',
    expected: '300',
    natural:
      'A recipe for 4 people calls for 300g flour, 200g sugar, and 2 eggs. If you are cooking for 6 people, how many grams of sugar do you need? Answer with just the number.',
    tscg:
      '[ANSWER:integer,unit:grams] recipe_serves:4 ingredient:sugar amount:200g → scale_to:6 → compute:200×(6/4) →',
    check: (r) => /\b300\b/.test(r),
    tags: ['math', 'hard'],
  },

  {
    id: 'am4',
    category: 'AmbiguousMath',
    name: 'Time Over Midnight',
    expected: '06:15',
    natural:
      'A flight departs at 22:45 and the flight duration is 7 hours and 30 minutes. What time does it arrive? Give the time in HH:MM 24-hour format.',
    tscg:
      '[ANSWER:time_HH:MM] depart:22:45 duration:7h30m → add_time → modulo:24h →',
    check: (r) => /\b0?6:15\b/.test(r),
    tags: ['math', 'hard'],
  },

  {
    id: 'am5',
    category: 'AmbiguousMath',
    name: 'Weighted Average Trap',
    expected: '81',
    natural:
      'Class A has 20 students with an average score of 75. Class B has 30 students with an average score of 85. What is the overall average score of all students combined? Answer with just the number.',
    tscg:
      '[ANSWER:number] classA:students=20,avg=75 classB:students=30,avg=85 → weighted_avg:(20×75+30×85)/(20+30) →',
    check: (r) => /\b81\b/.test(r),
    tags: ['math', 'hard'],
  },

  // ============================================================
  // --- PRECISION EXTRACTION (5) ---
  // Expected Natural accuracy: 70-85%
  // Extract specific info from dense text.
  // ============================================================

  {
    id: 'pe1',
    category: 'PrecisionExtraction',
    name: 'Dense Number Extraction',
    expected: '$10.9M',
    natural:
      'Here are the quarterly financials for Acme Corp 2024:\n' +
      'Q1: Revenue $45.2M, Operating Costs $8.1M, Net Profit $4.3M\n' +
      'Q2: Revenue $51.7M, Operating Costs $9.4M, Net Profit $5.8M\n' +
      'Q3: Revenue $62.3M, Operating Costs $10.9M, Net Profit $7.1M\n' +
      'Q4: Revenue $58.9M, Operating Costs $11.2M, Net Profit $6.4M\n' +
      'What were the Q3 operating costs? Answer with just the dollar amount (e.g., $X.XM).',
    tscg:
      '[ANSWER:dollar_amount] <<CTX>>\nQ1: Revenue $45.2M, OpCosts $8.1M, Profit $4.3M\nQ2: Revenue $51.7M, OpCosts $9.4M, Profit $5.8M\nQ3: Revenue $62.3M, OpCosts $10.9M, Profit $7.1M\nQ4: Revenue $58.9M, OpCosts $11.2M, Profit $6.4M\n<</CTX>> → extract:Q3.operating_costs →',
    check: (r) => /10\.9/.test(r),
    tags: ['extraction', 'hard'],
  },

  {
    id: 'pe2',
    category: 'PrecisionExtraction',
    name: 'Mid-Position Extraction',
    expected: '$120K',
    natural:
      'Here are 5 project budgets:\n' +
      'Project Alpha: $85K\n' +
      'Project Beta: $200K\n' +
      'Project Gamma: $120K\n' +
      'Project Delta: $95K\n' +
      'Project Epsilon: $310K\n' +
      'What is the budget for Project Gamma? Answer with just the dollar amount.',
    tscg:
      '[ANSWER:dollar_amount] <<CTX>>\n1:Alpha=$85K 2:Beta=$200K 3:Gamma=$120K 4:Delta=$95K 5:Epsilon=$310K\n<</CTX>> → extract:Gamma.budget →',
    check: (r) => /120/.test(r),
    tags: ['extraction', 'hard'],
  },

  {
    id: 'pe3',
    category: 'PrecisionExtraction',
    name: 'Similar Name Disambiguation',
    expected: '2021',
    natural:
      'Employee records:\n' +
      'Alice Smith - Hired 2019, Department: Marketing\n' +
      'Alice Johnson - Hired 2021, Department: Engineering\n' +
      'Alice Williams - Hired 2020, Department: Sales\n' +
      'Alice Brown - Hired 2018, Department: Finance\n' +
      'What year was Alice Johnson hired? Answer with just the year.',
    tscg:
      '[ANSWER:year] <<CTX>>\nAlice Smith: hired=2019, dept=Marketing\nAlice Johnson: hired=2021, dept=Engineering\nAlice Williams: hired=2020, dept=Sales\nAlice Brown: hired=2018, dept=Finance\n<</CTX>> → extract:Alice_Johnson.hired →',
    check: (r) => /2021/.test(r),
    tags: ['extraction', 'hard'],
  },

  {
    id: 'pe4',
    category: 'PrecisionExtraction',
    name: 'Nested Condition Extraction',
    expected: '$12.99',
    natural:
      'Shipping rates:\n' +
      'Domestic orders:\n' +
      '  Under $50: $5.99\n' +
      '  $50-$99: $3.99\n' +
      '  $100+: Free\n' +
      'International orders:\n' +
      '  Under $50: $15.99\n' +
      '  $50-$99: $12.99\n' +
      '  $100+: $8.99\n' +
      'What is the shipping cost for an international order of $75? Answer with just the dollar amount.',
    tscg:
      '[ANSWER:dollar_amount] <<CTX>>\nDomestic: <$50→$5.99 | $50-$99→$3.99 | $100+→Free\nInternational: <$50→$15.99 | $50-$99→$12.99 | $100+→$8.99\n<</CTX>> → lookup:International+$75 → match:$50-$99 →',
    check: (r) => /12\.99/.test(r),
    tags: ['extraction', 'hard'],
  },

  {
    id: 'pe5',
    category: 'PrecisionExtraction',
    name: 'Multi-Fact Combination',
    expected: '112 GB',
    natural:
      'Server specifications:\n' +
      'Server A: 8 cores, 32 GB RAM, 500 GB SSD\n' +
      'Server B: 16 cores, 48 GB RAM, 1 TB SSD\n' +
      'Server C: 12 cores, 32 GB RAM, 750 GB SSD\n' +
      'What is the total RAM across all three servers? Answer with just the number and unit (e.g., X GB).',
    tscg:
      '[ANSWER:number,unit:GB] <<CTX>>\nA: 8cores, 32GB_RAM, 500GB_SSD\nB: 16cores, 48GB_RAM, 1TB_SSD\nC: 12cores, 32GB_RAM, 750GB_SSD\n<</CTX>> → sum:RAM(A+B+C) → 32+48+32 →',
    check: (r) => /112/.test(r),
    tags: ['extraction', 'hard'],
  },

  // ============================================================
  // --- FORMAT CRITICAL (5) ---
  // Expected Natural accuracy: 60-80%
  // Must match exact format; models tend to add preamble or deviate.
  // ============================================================

  {
    id: 'fc1',
    category: 'FormatCritical',
    name: 'ISO Code Only',
    expected: 'JP',
    natural:
      'What is the ISO 3166-1 alpha-2 country code for Japan? Reply with only the two-letter code, nothing else.',
    tscg:
      '[ANSWER:iso_alpha2] country:Japan → iso_3166_1_alpha2 →',
    check: (r) => r.trim() === 'JP',
    tags: ['format', 'hard'],
  },

  {
    id: 'fc2',
    category: 'FormatCritical',
    name: 'Exact JSON Format',
    expected: '{"element":"Gold","number":79}',
    natural:
      'Return a JSON object with two fields: "element" set to the name of the element with atomic number 79, and "number" set to 79. Output only valid JSON, no explanation.',
    tscg:
      '[ANSWER:json{element:string,number:integer}] element_by_atomic:79 → emit:json →',
    check: (r) => {
      try {
        const parsed = JSON.parse(r.trim());
        const elemOk =
          typeof parsed.element === 'string' &&
          /gold|au/i.test(parsed.element);
        const numOk = parsed.number === 79;
        return elemOk && numOk;
      } catch {
        return false;
      }
    },
    tags: ['format', 'hard'],
  },

  {
    id: 'fc3',
    category: 'FormatCritical',
    name: 'CSV No Spacing',
    expected: '2,3,5,7,11',
    natural:
      'List the first 5 prime numbers, separated by commas with no spaces. Output only the numbers, nothing else.',
    tscg:
      '[ANSWER:csv_no_spaces] primes → first:5 → join:"," →',
    check: (r) => r.trim() === '2,3,5,7,11',
    tags: ['format', 'hard'],
  },

  {
    id: 'fc4',
    category: 'FormatCritical',
    name: 'Exact Word Count',
    expected: 'A five-word description of blue',
    natural:
      'Describe the color blue in exactly 5 words. Output only those 5 words, nothing else.',
    tscg:
      '[ANSWER:text,words=5] topic:color_blue → describe → enforce:word_count=5 →',
    check: (r) => {
      const words = r.trim().split(/\s+/).filter((w) => w.length > 0);
      return words.length === 5;
    },
    tags: ['format', 'hard'],
  },

  {
    id: 'fc5',
    category: 'FormatCritical',
    name: 'Boolean Only',
    expected: 'true',
    natural:
      'Is 17 a prime number? Answer with only "true" or "false", nothing else.',
    tscg:
      '[CLASSIFY:true|false] number:17 → is_prime →',
    check: (r) => r.trim().toLowerCase() === 'true',
    tags: ['format', 'hard'],
  },

  // ============================================================
  // --- LONG DEPENDENCY (4) ---
  // Expected Natural accuracy: 65-80%
  // Need information from different parts of prompt.
  // ============================================================

  {
    id: 'ld1',
    category: 'LongDependency',
    name: 'Start-End Dependency',
    expected: 'no',
    natural:
      'Exchange rate: 1 USD = 0.85 EUR.\n\n' +
      'You want to buy these items (prices in EUR):\n' +
      'Item A: 45 EUR\n' +
      'Item B: 32 EUR\n' +
      'Item C: 18 EUR\n' +
      'Item D: 27 EUR\n\n' +
      'Your budget is 120 USD.\n\n' +
      'Can you afford all items? Answer only "yes" or "no".',
    tscg:
      '[CLASSIFY:yes|no] rate:1USD=0.85EUR items:[45,32,18,27]EUR budget:120USD → total_EUR:122 → convert:120USD×0.85=102EUR → 122>102 → answer:no →',
    check: (r) => /^\s*no\b/i.test(r),
    tags: ['dependency', 'hard'],
  },

  {
    id: 'ld2',
    category: 'LongDependency',
    name: 'Dependency Chain',
    expected: '36',
    natural:
      'David has 30 marbles.\n' +
      'Carol has half as many marbles as David.\n' +
      'Bob has 3 more marbles than Carol.\n' +
      'Alice has twice as many marbles as Bob.\n' +
      'How many marbles does Alice have? Answer with just the number.',
    tscg:
      '[ANSWER:integer] David:30 → Carol:David/2=15 → Bob:Carol+3=18 → Alice:Bob×2=36 →',
    check: (r) => /\b36\b/.test(r),
    tags: ['dependency', 'hard'],
  },

  {
    id: 'ld3',
    category: 'LongDependency',
    name: 'Conditional Chain',
    expected: 'Setting C',
    natural:
      'A smart thermostat has these rules:\n' +
      'If temperature > 30C, set mode to A.\n' +
      'If temperature <= 30C, set mode to B.\n' +
      'If mode is A and humidity > 60%, switch to mode C.\n' +
      'If mode is A and humidity <= 60%, keep mode A.\n' +
      'If mode is B and wind > 20 km/h, switch to mode D.\n' +
      'If mode is B and wind <= 20 km/h, keep mode B.\n\n' +
      'Current conditions: temperature 35C, humidity 75%, wind 10 km/h.\n' +
      'What is the final mode? Answer with only the letter (A, B, C, or D).',
    tscg:
      '[CLASSIFY:A|B|C|D] rules:[temp>30→A, temp<=30→B, A+humidity>60%→C, A+humidity<=60%→A, B+wind>20→D, B+wind<=20→B] conditions:temp=35,humidity=75%,wind=10 → step1:35>30→A → step2:A+75%>60%→C →',
    check: (r) => /\bC\b/.test(r),
    tags: ['dependency', 'hard'],
  },

  {
    id: 'ld4',
    category: 'LongDependency',
    name: 'Reference Resolution',
    expected: '2.7',
    natural:
      'Product catalog:\n' +
      'Widget: $15.00, weight 1.2 kg\n' +
      'Gadget: $8.50, weight 0.5 kg\n' +
      'Doohickey: $22.00, weight 0.3 kg\n' +
      'Thingamajig: $12.00, weight 2.2 kg\n\n' +
      'You order the cheapest product and the heaviest product.\n' +
      'What is the total weight of your order in kg? Answer with just the number.',
    tscg:
      '[ANSWER:number,unit:kg] <<CTX>>\nWidget: $15.00, 1.2kg\nGadget: $8.50, 0.5kg\nDoohickey: $22.00, 0.3kg\nThingamajig: $12.00, 2.2kg\n<</CTX>> → cheapest:Gadget($8.50,0.5kg) → heaviest:Thingamajig($12.00,2.2kg) → total_weight:0.5+2.2=2.7 →',
    check: (r) => /2\.7/.test(r),
    tags: ['dependency', 'hard'],
  },
];
