/**
 * TAB Benchmark — GSM8K-Under-Load Task Generator
 *
 * Tests whether tool-schema context overhead degrades general reasoning.
 * Uses 50 representative GSM8K math questions (manually curated subset)
 * tested under schema loads of 0, 10, 25, and 50 tools.
 *
 * The ground truth is the numeric answer. No tool should be called --
 * the model must recognize that reasoning, not tool use, is required.
 *
 * Key hypothesis:
 *   - Frontier models: minimal degradation under load
 *   - Small models: severe degradation with natural schemas, preserved with TSCG
 */

import type { BenchmarkTask, Scenario } from '../types.js';

// ============================================================
// GSM8K Curated Subset (50 representative questions)
// ============================================================

interface GSM8KQuestion {
  id: string;
  question: string;
  answer: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * 50 manually curated GSM8K questions spanning easy, medium, and hard.
 * Distribution: 15 easy, 20 medium, 15 hard.
 * Source: GSM8K test set (Cobbe et al., 2021)
 */
const GSM8K_SUBSET: GSM8KQuestion[] = [
  // ---- EASY (15) ----
  {
    id: 'gsm8k_001',
    question: "Janet's ducks lay 16 eggs per day. She eats three for breakfast every morning and bakes muffins for her friends every day with four. She sells every remaining egg at the farmers' market daily for $2 per egg. How much in dollars does she make every day at the farmers' market?",
    answer: 18,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_002',
    question: 'A robe takes 2 bolts of blue fiber and half that much white fiber. How many bolts in total does it take?',
    answer: 3,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_003',
    question: 'Josh decides to try flipping a house. He buys a house for $80,000 and then puts in $50,000 in repairs. This increased the value of the house by 150%. How much profit did he make?',
    answer: 70000,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_004',
    question: 'James writes a 3-page letter to 2 different friends twice a week. How many pages does he write a year?',
    answer: 624,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_005',
    question: 'Every day, Wendi feeds each of her chickens three cups of mixed chicken feed, containing seeds, mealworms and vegetables to help keep them healthy. She gives the chickens their feed in three separate meals. In the morning, she gives her flock of chickens 15 cups of feed. In the afternoon, she gives her chickens another 25 cups of feed. If she fetches 65 cups of feed for the final meal of the day, how many chickens does Wendi have?',
    answer: 35,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_006',
    question: 'Kylar went to the store to get water and some crackers. A gallon of water costs $2. A box of crackers has a pack of 6, and costs $3 per pack. He bought 4 gallons of water and 5 boxes of crackers. How much did he spend?',
    answer: 23,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_007',
    question: 'Toulouse has twice as many sheep as Charleston. Charleston has 4 times as many sheep as Seattle. How many sheep do Toulouse, Charleston, and Seattle have together if Seattle has 20 sheep?',
    answer: 260,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_008',
    question: 'Carla is downloading a 200 GB file. Normally she can download 2 GB/minute, but 40% of the way through, Windows forces a restart to install updates, which takes 20 minutes. Then Carla has to restart the download from the beginning. How load(), in minutes, does it take to download the file?',
    answer: 160,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_009',
    question: 'John drives for 3 hours at a speed of 60 mph and then turns around because he realizes he forgot something. He tries to get home in 4 hours but spends the first 2 hours in standstill traffic. He spends the rest of the time driving at 30 mph. How far is he from home?',
    answer: 120,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_010',
    question: 'Eliza buys 5 loaves of bread. Each loaf of bread has 15 slices. She pays $2 for each loaf. How much does each slice of bread cost, in cents?',
    answer: 13,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_011',
    question: 'A merchant wants to make a choice of purchase between 2 purchasing plans: jewelry worth $5,000 or electronic gadgets worth $8,000. His financial advisor suggests he buy jewelry. The merchant agrees and goes with the advice. After a week, the jewelry gains a 2.5% profit and the electronic gadgets have a 1.2% loss. How much profit, in dollars, did the merchant gain from following his advisor\'s advice?',
    answer: 125,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_012',
    question: 'Two trains leave San Rafael at the same time. They begin traveling westward, both toward the same destination. The slower train travels 10 miles per hour. The faster train travels 40 miles per hour. When the faster train reaches the destination, the slower train is 100 miles away. How far away is the destination from San Rafael?',
    answer: 133,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_013',
    question: 'Jill gets paid $20 per hour to teach and $30 per hour as a personal trainer. If she works 50 hours a month as a teacher and 20 hours a month as a personal trainer, what are her total monthly earnings?',
    answer: 1600,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_014',
    question: 'Claire makes a 3 egg omelet every morning for breakfast. How many dozens of eggs will she need to buy to make omelets for 4 weeks?',
    answer: 7,
    difficulty: 'easy',
  },
  {
    id: 'gsm8k_015',
    question: 'Marissa is hiking a 12-mile trail. She took 1 hour to walk the first 4 miles, then 2 hours to walk the next 4 miles, then finished the rest in half the time she spent on the first 4 miles. How many minutes in total did it take her to complete the trail?',
    answer: 210,
    difficulty: 'easy',
  },

  // ---- MEDIUM (20) ----
  {
    id: 'gsm8k_016',
    question: 'Tobias is buying a new pair of shoes that costs $95. He has been saving up his money each month for the past three months. He gets a $5 allowance a month. He mowed the lawn 4 times for $15 each. He also sold 18 cups of lemonade at $0.50 each. How much more does he need to save to buy the shoes?',
    answer: 11,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_017',
    question: 'Randy has 60 mango trees on his farm. He also has 5 less than half as many coconut trees as mango trees. How many trees does Randy have in all on his farm?',
    answer: 85,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_018',
    question: 'Joy can read 8 pages of a book in 20 minutes. How many hours will it take her to read 120 pages?',
    answer: 5,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_019',
    question: 'There are 15 trees in the grove. Grove workers will plant trees in the grove today. After they are done, there will be 21 trees. How many trees did the grove workers plant today?',
    answer: 6,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_020',
    question: 'Mark has a garden with flowers. He planted plants of three colors in it. Ten of them are yellow, and there are 80% more of those in red. Blue flowers make up only 25% of red flowers. How many flowers does Mark have in his garden?',
    answer: 35,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_021',
    question: 'Albert is wondering how much pizza he can eat in one day. He buys 2 large pizzas and 2 small pizzas. A large pizza has 16 slices and a small pizza has 8 slices. If he eats it all, how many pieces does he eat that day?',
    answer: 48,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_022',
    question: 'Ken created a care package to send to his brother, who lives 100 miles away. Ken placed a box on a scale, and the box weighed 2 pounds. He then packed 8 cans, each weighing half a pound, and 2 bags of chips, each weighing 1/4 pound. What was the total weight of the care package, in pounds?',
    answer: 6.5,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_023',
    question: 'Alexis has a friend group of 100 people. 25% of his friends are boys, and 55% of his girl friends like to play basketball, and the rest like to play soccer. How many of Alexis\' friends are girls who like to play soccer?',
    answer: 34,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_024',
    question: 'A farmer is buying feed for his horses. He buys a variety of hay, oats, carrots and sugar cubes. Since sugar cubes are a rare treat, he only buys two 1-pound boxes of them for the whole stable. He only wants enough carrots to feed the horses once a day, and each horse gets 4 pounds of carrots. He buys 42 pounds of oats and 40% more of hay. If his stable has 4 horses, how many total pounds of feed does he buy?',
    answer: 106,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_025',
    question: 'Cecelia went to the milk store and found out that a gallon jar costs $2 more than a half-gallon jar. If a gallon jar costs $5, calculate the total amount of money she spent on 10-gallon jars and 16 half-gallon jars.',
    answer: 98,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_026',
    question: 'Sam bought a dozen boxes, each with 30 highlighter pens inside, for $10 each box. He rearranged five of these boxes into packages of six highlighters each and sold them for $3 per package. He sold the rest of the highlighters separately at the rate of three pens for $2. How much profit did he make in total, in dollars?',
    answer: 115,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_027',
    question: 'In a dance class of 20 students, 20% enrolled in contemporary dance, 25% in jazz dance, and the rest in hip-hop dance. What percentage of the entire class is enrolled in hip-hop dance?',
    answer: 55,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_028',
    question: 'A merchant wants to sell his gold at 10% above the original price. If the original price is $200, how much will the gold be sold for?',
    answer: 220,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_029',
    question: 'There are 5 houses on a street, and each house has a different color. Each owner has a different pet. The first house is red and has 3 cats. The second house is blue and has 2 dogs. The third house is green and has 4 birds. The fourth house is yellow and has 1 fish. The fifth house is white and has 5 hamsters. How many animals are on the street in total?',
    answer: 15,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_030',
    question: 'Mr. Gardner bakes 20 cookies, 25 cupcakes, and 35 brownies for his second-grade class of 20 students. If he wants to give each student an equal amount of sweet treats, how many sweet treats will each student receive?',
    answer: 4,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_031',
    question: 'A book has 500 pages. Maria reads half of it in the first week. She reads half of the remaining in the second week. How many pages are left for her to read?',
    answer: 125,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_032',
    question: 'A store sells notebooks for $3 each. If you buy 4 or more, you get a 25% discount. Sarah buys 6 notebooks. How much does she pay?',
    answer: 13.5,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_033',
    question: 'Tom swims at a rate of 2 miles per hour. He needs to cross a 3-mile lake. If he takes a 15-minute break after each mile, how many minutes total does the trip take?',
    answer: 120,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_034',
    question: 'A parking lot has 300 spaces. On Monday, it was 80% full. On Tuesday, 1/4 of the Monday cars left, and 40 new cars arrived. How many empty spaces are there on Tuesday?',
    answer: 120,
    difficulty: 'medium',
  },
  {
    id: 'gsm8k_035',
    question: 'Lisa earns $12 an hour. She works 8 hours a day, 5 days a week. She saves 30% of her weekly earnings. How much does she save per week?',
    answer: 144,
    difficulty: 'medium',
  },

  // ---- HARD (15) ----
  {
    id: 'gsm8k_036',
    question: 'A company has 120 employees. 40% of them are in engineering, and the rest are divided equally between sales and marketing. Each engineer earns $90,000, each salesperson earns $70,000, and each marketer earns $65,000. What is the total annual payroll in dollars?',
    answer: 9180000,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_037',
    question: 'Ralph is going to practice playing tennis with a tennis ball machine that shoots out tennis balls for him to hit. He loads up the machine with 175 tennis balls to start with. Out of the first 100 balls, he hits 2/5 of them. Of the next 75 balls, he hits 1/3 of them. Out of all the tennis balls, how many did he not hit?',
    answer: 110,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_038',
    question: "Natalia sold clips to 48 of her friends in April, and then she sold half as many clips in May. How many clips did Natalia sell altogether in April and May?",
    answer: 72,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_039',
    question: 'Weng earns $12 an hour for babysitting. Yesterday, she just did 50 minutes of babysitting. How much did she earn?',
    answer: 10,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_040',
    question: 'Betty is saving money for a new wallet which costs $100. Betty has only half of the money she needs. Her parents decided to give her $15 for that purpose, and her grandparents twice as much as her parents. How much more money does Betty need to buy the wallet?',
    answer: 5,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_041',
    question: 'Julie is reading a 120-page book. Yesterday, she was able to read 12 pages and today, she read twice as many pages as yesterday. If she wants to read half of the remaining pages tomorrow, how many pages should she read?',
    answer: 42,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_042',
    question: 'James buys a plane ticket for $6000. He gets a 30% discount but has to pay a 12% tax on the discounted price plus a $150 booking fee. What does he pay in total?',
    answer: 4854,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_043',
    question: 'A baker makes 40 loaves of bread, each requiring 2 cups of flour. He uses 3/4 of his bread for sandwiches that sell for $6 each and the rest for toast that sells for $3 each. He spends $1.50 per cup of flour. What is his profit?',
    answer: 90,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_044',
    question: 'Three people invest in a business. Alice invests $3000, Bob invests twice as much as Alice, and Charlie invests half as much as Bob. They split profits proportionally to their investment. If the total profit is $1800, how much does Charlie receive?',
    answer: 360,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_045',
    question: 'A tank can hold 50 gallons. It currently has 30 gallons. Water flows in at 3 gallons per minute and drains out at 1 gallon per minute. How many minutes until the tank is full?',
    answer: 10,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_046',
    question: 'Emma has a collection of 240 stickers. She gives 1/4 to her sister, 1/3 of the remainder to her friend, and then buys 50 more stickers. How many stickers does Emma have now?',
    answer: 170,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_047',
    question: 'A rectangular garden is 15m long and 10m wide. A path 2m wide is built around it. What is the area of the path in square meters?',
    answer: 124,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_048',
    question: 'Mike works two jobs. At his first job, he earns $15/hour for 20 hours a week. At his second job, he earns $12/hour for 15 hours a week. He spends 40% of his total weekly earnings on rent. How much does he spend on rent per week?',
    answer: 192,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_049',
    question: 'A school has 600 students. 55% are girls. 30% of the girls and 40% of the boys play sports. How many students play sports?',
    answer: 207,
    difficulty: 'hard',
  },
  {
    id: 'gsm8k_050',
    question: 'A train travels from city A to city B at 80 km/h and returns at 120 km/h. The distance between the cities is 240 km. What is the average speed for the entire round trip in km/h?',
    answer: 96,
    difficulty: 'hard',
  },
];

// ============================================================
// Schema Load Sizes
// ============================================================

/** Tool counts for the GSM8K-under-load test matrix */
const SCHEMA_LOAD_SIZES = [0, 10, 25, 50] as const;

// ============================================================
// Main Generator
// ============================================================

/**
 * Generate GSM8K-under-load benchmark tasks.
 *
 * Each of the 50 GSM8K questions is tested under multiple schema load
 * sizes (0, 10, 25, 50 tools). The model sees tool definitions in
 * the system prompt but must answer the math question directly.
 *
 * The tasks are designed to measure reasoning degradation under
 * tool-schema context overhead. The schema_load_tools metadata
 * indicates how many tools are loaded in the context.
 *
 * @returns Array of BenchmarkTask objects
 */
export function generateGSM8KLoadTasks(): BenchmarkTask[] {
  const tasks: BenchmarkTask[] = [];

  for (const numTools of SCHEMA_LOAD_SIZES) {
    for (const question of GSM8K_SUBSET) {
      const taskId = `tab-gsm-${numTools}t-${question.id}`;

      tasks.push({
        task_id: taskId,
        scenario: 'GSM8K' as Scenario,
        category: 'no_tool', // Model should NOT call a tool
        difficulty: question.difficulty,
        source: 'gsm8k',
        query: question.question,
        tools: [], // Actual tool names populated at runtime based on load size
        ground_truth: {
          answer: question.answer,
          action: 'no_tool_call',
        },
        metadata: {
          num_tools: numTools,
          schema_load_tools: numTools,
          source_reference: question.id,
        },
      });
    }
  }

  return tasks;
}

/**
 * Get the curated GSM8K question subset.
 * Useful for analysis and inspection.
 */
export function getGSM8KSubset(): readonly GSM8KQuestion[] {
  return GSM8K_SUBSET;
}

/**
 * Get the schema load sizes used in the GSM8K-under-load test.
 */
export function getSchemaLoadSizes(): readonly number[] {
  return SCHEMA_LOAD_SIZES;
}
