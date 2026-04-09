/**
 * TSCG Needle-in-a-Haystack Generator
 *
 * Generates deterministic haystack text (scientific/astronomy domain) with an
 * embedded "needle" fact at a specified position. Used to benchmark long-context
 * retrieval accuracy across different prompt-engineering strategies.
 *
 * Key properties:
 * - FULLY DETERMINISTIC: same inputs always produce identical output
 * - No external dependencies or API calls
 * - Padding text is plausible scientific prose (astronomy, geology, marine biology)
 * - Needle is embedded seamlessly within paragraph boundaries
 */

// ============================================================================
// Public Interfaces
// ============================================================================

export interface HaystackConfig {
  /** Index 0-9 selecting which needle fact to embed */
  needleIdx: number;
  /** Target word count for the full context (e.g. 3750 for ~5K tokens) */
  targetWords: number;
  /** Position of needle within text: 0.0 = start, 0.5 = middle, 1.0 = end */
  needlePosition: number;
}

export interface HaystackResult {
  /** Full text with needle embedded among padding paragraphs */
  context: string;
  /** Question about the needle fact */
  question: string;
  /** Expected answer */
  answer: string;
  /** The needle sentence itself */
  needleSentence: string;
  /** Actual word count of the full context */
  wordCount: number;
  /** Word position at which the needle appears */
  needleWordPos: number;
}

// ============================================================================
// Needle Definitions (10 distinct retrievable facts)
// ============================================================================

export interface Needle {
  fact: string;
  question: string;
  answer: string;
}

export const NEEDLES: readonly Needle[] = [
  {
    fact: 'The total budget allocated to Project Aurora in the fiscal year 2024 was $4.7 million',
    question: 'What was the total budget allocated to Project Aurora in fiscal year 2024?',
    answer: '$4.7 million',
  },
  {
    fact: 'Compound XR-7 showed a 73% reduction in inflammation markers during the Phase II clinical trial',
    question: 'What percentage reduction in inflammation markers did Compound XR-7 show?',
    answer: '73%',
  },
  {
    fact: 'The geographic coordinates of the lost city of Zandara are 41.2\u00B0N latitude and 28.9\u00B0E longitude',
    question: 'What are the geographic coordinates of the lost city of Zandara?',
    answer: '41.2\u00B0N, 28.9\u00B0E',
  },
  {
    fact: 'The planned server migration from US-East to EU-West data center has an estimated downtime of exactly 4 hours',
    question: 'What is the estimated downtime for the server migration from US-East to EU-West?',
    answer: '4 hours',
  },
  {
    fact: 'Contract #2847-B was awarded to Meridian Technologies for a total value of $2.3 million',
    question: 'Which company was awarded Contract #2847-B and for how much?',
    answer: 'Meridian Technologies, $2.3 million',
  },
  {
    fact: 'The rare mineral Stellarite has a Mohs hardness of 8.4 and a specific gravity of 6.12',
    question: 'What is the Mohs hardness of Stellarite?',
    answer: '8.4',
  },
  {
    fact: 'Deep sea species Luminara abyssalis was first documented at a depth of 7,234 meters in the Mariana Trench',
    question: 'At what depth was Luminara abyssalis first documented?',
    answer: '7,234 meters',
  },
  {
    fact: 'The Epsilon-7 satellite achieved orbit insertion on March 14, 2024, at exactly 03:47 UTC',
    question: 'When did the Epsilon-7 satellite achieve orbit insertion?',
    answer: 'March 14, 2024, at 03:47 UTC',
  },
  {
    fact: 'Professor Elena Vasquez published her seminal paper on quantum entanglement routing with exactly 847 citations by year end',
    question: 'How many citations did Professor Vasquez paper on quantum entanglement routing receive?',
    answer: '847',
  },
  {
    fact: 'The ancient manuscript fragment from the Library of Ashurbanipal contains a recipe requiring exactly 3.5 talents of silver',
    question: 'How much silver does the recipe in the Ashurbanipal manuscript fragment require?',
    answer: '3.5 talents',
  },
] as const;

// ============================================================================
// Padding Paragraph Pool (~100-200 words each, scientific domain)
//
// These paragraphs deliberately avoid specific numbers that could be confused
// with needle facts. Topics span astronomy, geology, marine biology, planetary
// science, and atmospheric physics.
// ============================================================================

const PARAGRAPHS: readonly string[] = [
  // 0 — Stellar formation
  `Stars form within dense regions of molecular clouds, vast accumulations of gas and dust that pervade the interstellar medium. When a portion of such a cloud reaches sufficient density, gravitational collapse begins, drawing material inward and raising the core temperature. As the protostellar core contracts, conservation of angular momentum causes the surrounding material to flatten into an accretion disk. Over hundreds of thousands of years, thermonuclear fusion ignites in the core, and a new star is born. The remaining disk material may aggregate into planets, asteroids, and cometary bodies, shaping an entire planetary system from a single collapsing fragment of a nebula. Observations from space-based telescopes continue to reveal the earliest stages of this process in star-forming regions across the Milky Way galaxy.`,

  // 1 — Tectonic plates
  `The theory of plate tectonics revolutionized our understanding of Earth's dynamic surface. Rigid lithospheric plates float atop the partially molten asthenosphere, driven by convection currents generated deep within the mantle. At divergent boundaries, new oceanic crust is created as magma rises to fill the gap left by separating plates. Convergent boundaries produce some of the most dramatic geological features on the planet, including mountain ranges, deep ocean trenches, and volcanic arcs. Transform boundaries, where plates slide laterally past each other, generate significant seismic activity. The continuous recycling of crustal material through subduction zones plays a critical role in regulating Earth's carbon cycle and maintaining the chemical composition of the atmosphere over geological timescales.`,

  // 2 — Coral reef ecosystems
  `Coral reefs are among the most biologically diverse ecosystems on Earth, supporting a staggering array of marine organisms. Built primarily by colonies of tiny coral polyps that secrete calcium carbonate skeletons, these structures can grow over millennia to form massive reef systems. The symbiotic relationship between coral polyps and photosynthetic zooxanthellae algae is fundamental to reef health, as the algae provide the coral with essential nutrients through photosynthesis. Reef ecosystems serve as nurseries for many commercially important fish species and protect coastal communities from storm surges and erosion. Rising ocean temperatures and acidification pose severe threats to coral survival, causing bleaching events that can devastate entire reef systems within weeks.`,

  // 3 — Atmospheric layers
  `Earth's atmosphere is divided into several distinct layers, each characterized by unique thermal and chemical properties. The troposphere, extending from the surface to roughly the tropopause, contains the bulk of atmospheric mass and is where virtually all weather phenomena occur. Above it, the stratosphere houses the ozone layer, which absorbs the majority of the Sun's harmful ultraviolet radiation. The mesosphere, situated above the stratosphere, is the coldest layer and the region where most meteors disintegrate upon entry. The thermosphere and exosphere extend outward into the near-vacuum of space, with temperatures in the thermosphere rising dramatically due to absorption of extreme ultraviolet radiation. Understanding these layers is essential for climate modeling, aviation safety, and satellite operations.`,

  // 4 — Lunar geology
  `The Moon's surface is a record of billions of years of geological history, preserved in stark detail due to the absence of atmospheric weathering and tectonic activity. The dark, flat lunar maria are ancient basaltic lava flows that filled enormous impact basins during a period of intense volcanism. The brighter, heavily cratered highlands represent the original anorthositic crust that solidified from a global magma ocean shortly after the Moon's formation. Regolith, a layer of fragmented rock and dust created by eons of micrometeorite bombardment, blankets the entire surface to varying depths. Samples returned by Apollo missions revealed that the Moon and Earth share a common isotopic signature, strongly supporting the giant impact hypothesis for lunar origin.`,

  // 5 — Deep ocean hydrothermal vents
  `Hydrothermal vents on the deep ocean floor represent one of the most extreme habitats on Earth, yet they teem with life. Superheated water, enriched with dissolved minerals and gases, erupts from fissures in the oceanic crust at temperatures that can exceed the boiling point of water at sea level. Chemosynthetic bacteria, which derive energy from chemical reactions rather than sunlight, form the base of vent ecosystems. These microbial communities sustain complex food webs that include giant tube worms, specialized shrimp, and various species of mussels and clams. The discovery of hydrothermal vent ecosystems in the late twentieth century fundamentally altered our understanding of the conditions necessary for life and expanded the search for habitable environments beyond Earth.`,

  // 6 — Magnetosphere
  `Earth's magnetosphere is a vast region of space dominated by the planet's magnetic field, extending tens of thousands of kilometers into the surrounding environment. Generated by the dynamo effect of convecting liquid iron in the outer core, this field deflects the continuous stream of charged particles known as the solar wind. Without this protective shield, the solar wind would gradually strip away the atmosphere, as is believed to have occurred on Mars after its internal dynamo ceased. The interaction between the solar wind and the magnetosphere produces phenomena such as the auroras, geomagnetic storms, and the Van Allen radiation belts. Understanding magnetospheric dynamics is crucial for protecting satellites, power grids, and astronaut safety during space missions.`,

  // 7 — Exoplanet detection
  `The detection of planets orbiting stars other than the Sun has opened an entirely new chapter in astronomy. The transit method, which identifies exoplanets by measuring the tiny dimming of starlight as a planet crosses in front of its host star, has proven enormously productive. Radial velocity measurements, which detect the gravitational wobble a planet induces in its parent star, provided some of the earliest confirmed exoplanet discoveries. Direct imaging, though technically challenging due to the extreme brightness contrast between a star and its planets, has revealed massive gas giants in wide orbits. More recently, gravitational microlensing has been used to detect planets at considerable distances from Earth. Collectively, these techniques have confirmed thousands of exoplanets, revealing a remarkable diversity of planetary systems.`,

  // 8 — Glaciology
  `Glaciers are massive bodies of ice that form over centuries from the accumulation and compaction of snow in regions where annual snowfall exceeds seasonal melting. These rivers of ice flow under their own weight, carving distinctive U-shaped valleys, depositing moraines, and sculpting the landscape in ways that persist long after the ice retreats. Ice sheets, the largest glacial formations, contain vast quantities of freshwater and play a decisive role in global sea level regulation. Ice core samples extracted from glaciers and ice sheets provide an invaluable archive of past atmospheric composition, temperature, and volcanic activity stretching back hundreds of thousands of years. Current observations indicate accelerating glacial retreat in most regions of the world, driven by rising global temperatures.`,

  // 9 — Solar wind
  `The solar wind is a continuous stream of charged particles, primarily protons and electrons, emanating from the Sun's corona and traveling outward through the heliosphere. This plasma flow varies in speed and density, with fast streams originating from coronal holes and slower streams from the equatorial regions of the Sun. Coronal mass ejections, massive expulsions of magnetized plasma, can dramatically intensify the solar wind and produce geomagnetic disturbances upon reaching Earth. The solar wind shapes the tails of comets, always pointing away from the Sun regardless of the comet's direction of travel. Beyond the orbit of Pluto, the solar wind eventually encounters the interstellar medium at the heliopause, a boundary that the Voyager spacecraft have recently crossed, providing direct measurements of this distant frontier.`,

  // 10 — Volcanic activity
  `Volcanic eruptions are among the most powerful geological events on Earth, capable of reshaping landscapes, altering climate, and affecting ecosystems on a global scale. Magma generated by partial melting of the mantle rises through the crust along zones of weakness, eventually reaching the surface through vents and fissures. Explosive eruptions occur when volatile-rich, viscous magma fragments violently upon depressurization, producing pyroclastic flows, ash columns, and lahars. Effusive eruptions, characteristic of basaltic volcanism, produce lava flows that can travel considerable distances before solidifying. The gases released during eruptions, including water vapor, carbon dioxide, and sulfur dioxide, can have both short-term cooling effects due to aerosol formation and long-term warming implications through greenhouse gas accumulation.`,

  // 11 — Asteroid belt
  `The asteroid belt, situated between the orbits of Mars and Jupiter, contains millions of rocky and metallic bodies ranging from tiny fragments to objects several hundred kilometers in diameter. Contrary to popular depiction, the belt is vast and sparsely populated, with typical separations between objects measuring millions of kilometers. The gravitational influence of Jupiter prevented these bodies from accreting into a single planet during the early solar system, instead trapping them in a zone of orbital resonances that persist to this day. Spectroscopic analysis reveals diverse compositions among belt asteroids, including carbonaceous, silicate-rich, and metallic types, reflecting the range of materials present in the primordial solar nebula. Some asteroids preserve pristine samples of the early solar system, making them valuable targets for sample-return missions.`,

  // 12 — Ocean currents
  `Ocean currents form a complex global circulation system that redistributes heat, nutrients, and dissolved gases throughout the world's oceans. Surface currents are driven primarily by prevailing winds and the Coriolis effect, creating large gyres in each major ocean basin. The thermohaline circulation, often described as the global conveyor belt, is driven by differences in water temperature and salinity. Cold, dense water sinks at high latitudes and flows along the ocean floor toward the equator, while warmer surface water flows poleward to replace it. This deep circulation plays a vital role in regulating global climate patterns and transporting nutrients that support marine productivity. Changes in freshwater input from melting ice sheets could potentially disrupt this circulation, with far-reaching consequences for weather patterns worldwide.`,

  // 13 — Nebulae
  `Nebulae are vast clouds of gas and dust in interstellar space, serving as both the birthplaces and graveyards of stars. Emission nebulae glow with characteristic colors as ultraviolet radiation from nearby hot stars ionizes the surrounding hydrogen gas, causing it to emit light at specific wavelengths. Reflection nebulae, in contrast, shine by scattering starlight off dust grains without ionizing the gas. Dark nebulae are dense enough to block the light of background stars, appearing as silhouettes against brighter regions of the galaxy. Planetary nebulae, despite their name, have nothing to do with planets; they are shells of gas expelled by dying intermediate-mass stars as they transition to white dwarfs. Supernova remnants, the expanding debris fields of massive stellar explosions, enrich the interstellar medium with heavy elements forged in the final moments of stellar life.`,

  // 14 — Sedimentary processes
  `Sedimentary rocks form through the accumulation, compaction, and cementation of mineral and organic particles deposited by water, wind, ice, or gravity. These rocks provide an unparalleled record of Earth's surface conditions throughout geological history, preserving evidence of ancient environments, climate patterns, and biological evolution. Sandstone, composed primarily of quartz grains, records the action of ancient rivers, beaches, and desert dunes. Limestone, formed from the shells and skeletons of marine organisms or by chemical precipitation, indicates the presence of ancient shallow seas. Shale, the most common sedimentary rock, consists of clay-sized particles deposited in low-energy environments such as deep ocean floors and lake bottoms. The study of sedimentary sequences allows geologists to reconstruct the dynamic history of continents and ocean basins.`,

  // 15 — Cosmic microwave background
  `The cosmic microwave background radiation is the oldest light in the universe, emitted approximately when the cosmos had cooled sufficiently for neutral hydrogen atoms to form. This primordial radiation, now redshifted into the microwave portion of the electromagnetic spectrum, pervades all of space with a remarkably uniform temperature. Tiny fluctuations in this background radiation, measured with extraordinary precision by satellite observatories, reveal the seeds of the large-scale structure that would eventually form galaxies, galaxy clusters, and cosmic filaments. The angular power spectrum of these fluctuations encodes fundamental information about the geometry, composition, and expansion history of the universe. Analysis of the cosmic microwave background has provided some of the most compelling evidence for the standard cosmological model and the existence of dark matter and dark energy.`,

  // 16 — Permafrost
  `Permafrost is ground that remains at or below the freezing point of water for two or more consecutive years, found predominantly in high-latitude and high-altitude regions. Covering roughly a quarter of the Northern Hemisphere's land surface, permafrost serves as a massive reservoir of organic carbon accumulated over thousands of years. As global temperatures rise, permafrost thaw is accelerating, releasing stored methane and carbon dioxide into the atmosphere and creating a positive feedback loop that amplifies warming. Thawing permafrost also destabilizes infrastructure built upon it, causing buildings, roads, and pipelines to buckle and collapse. In coastal regions, the loss of frozen ground accelerates erosion, threatening communities and archaeological sites. Monitoring permafrost conditions has become a critical component of climate change research and adaptation planning in Arctic nations.`,

  // 17 — Gravitational waves
  `Gravitational waves are ripples in the fabric of spacetime produced by the acceleration of massive objects, predicted by general relativity and first directly detected in the early twenty-first century. The most detectable sources of gravitational waves are binary systems of compact objects, such as pairs of neutron stars or black holes spiraling toward merger. As these objects orbit ever closer, they radiate gravitational energy, causing the orbit to shrink until the final coalescence produces a brief but intense burst of gravitational radiation. Ground-based interferometric detectors measure these waves by sensing the minute changes in distance between suspended mirrors separated by kilometers. The advent of gravitational wave astronomy has opened a new observational window on the universe, revealing events invisible to electromagnetic telescopes and enabling tests of general relativity in the strong-field regime.`,

  // 18 — Photosynthesis
  `Photosynthesis is the biochemical process by which plants, algae, and certain bacteria convert light energy into chemical energy stored in glucose molecules. The light-dependent reactions occur in the thylakoid membranes of chloroplasts, where chlorophyll and accessory pigments capture photons and use their energy to split water molecules, releasing oxygen as a byproduct. The resulting chemical energy drives the Calvin cycle in the stroma, where carbon dioxide from the atmosphere is fixed into organic carbon compounds. This process is responsible for virtually all the oxygen in Earth's atmosphere and forms the energetic foundation of nearly every food web on the planet. Variations in photosynthetic pathways, including the specialized mechanisms found in tropical grasses and succulent plants, reflect evolutionary adaptations to different environmental conditions including heat, drought, and variable light availability.`,

  // 19 — Kuiper Belt
  `The Kuiper Belt is a vast ring of icy bodies extending beyond the orbit of Neptune, analogous to the asteroid belt but far more massive and composed primarily of frozen volatiles rather than rock and metal. This region is home to dwarf planets, numerous smaller objects, and short-period comets that are periodically perturbed into the inner solar system by gravitational interactions. The diverse compositions and orbital characteristics of Kuiper Belt objects provide important constraints on models of solar system formation and the early migration of the giant planets. Observations have revealed a complex orbital structure within the belt, including resonant populations trapped by Neptune's gravity and a scattered disk of objects on highly eccentric orbits. Spacecraft exploration of this distant region has provided close-up views of these primordial bodies, offering direct evidence of conditions in the outer solar nebula.`,

  // 20 — Seismology
  `Seismology, the scientific study of earthquakes and the propagation of elastic waves through the Earth, has provided the most detailed picture of our planet's internal structure. When an earthquake occurs, it generates both compressional and shear waves that travel through the interior at speeds determined by the density and elastic properties of the material they traverse. By analyzing the arrival times and amplitudes of these waves at seismic stations around the world, scientists have mapped the boundaries between the crust, mantle, outer core, and inner core. The shadow zone created by the liquid outer core, which does not transmit shear waves, was one of the earliest pieces of evidence for Earth's layered structure. Modern seismic tomography uses vast datasets to create detailed images of mantle convection patterns, subducting slabs, and deep mantle plumes.`,

  // 21 — Titan (moon)
  `Titan, the largest moon of Saturn, is unique in the solar system for its dense nitrogen-rich atmosphere and its surface lakes and seas of liquid hydrocarbons. The thick atmospheric haze obscures the surface from visible-light observation, but radar mapping and infrared imaging have revealed a complex landscape of dunes, mountains, river channels, and cryovolcanic features. The methane cycle on Titan parallels the water cycle on Earth, with methane evaporating from surface reservoirs, forming clouds, and precipitating as rain that carves erosional features into the icy bedrock. Beneath the surface, evidence suggests the presence of a global subsurface ocean of liquid water, raising intriguing questions about the potential for prebiotic chemistry or even life in this alien environment. Future exploration missions are planned to investigate Titan's surface and atmospheric chemistry in greater detail.`,

  // 22 — Continental drift evidence
  `The concept of continental drift, first comprehensively proposed in the early twentieth century, drew on multiple lines of evidence to argue that the continents had once been joined and had since moved apart. The geometric fit of the Atlantic coastlines of South America and Africa provided an initial visual clue, but more compelling evidence came from the distribution of identical fossil species on continents now separated by vast oceans. Paleoclimatic indicators, such as glacial deposits in tropical regions and coal beds in polar areas, further supported the idea of continental repositioning over time. The discovery of matching geological formations and mountain belts that align when continents are reassembled added structural evidence. Although the mechanism for drift remained elusive until the development of plate tectonics theory, the observational evidence gathered by early proponents proved remarkably prescient and laid the groundwork for a revolution in Earth sciences.`,

  // 23 — Dark matter
  `Dark matter is a hypothetical form of matter that does not emit, absorb, or reflect electromagnetic radiation, making it invisible to all forms of telescopic observation. Its existence is inferred from gravitational effects on visible matter, including the rotation curves of galaxies, which spin faster than can be explained by the gravitational pull of their luminous components alone. Gravitational lensing observations, where the light from distant galaxies is bent by intervening mass concentrations, have provided additional evidence for the presence of large amounts of unseen matter. Cosmological simulations of structure formation require dark matter to reproduce the observed distribution of galaxies and galaxy clusters in the universe. Despite decades of experimental effort using underground detectors, particle accelerators, and indirect astrophysical searches, the fundamental nature of dark matter particles remains one of the greatest unsolved problems in modern physics.`,

  // 24 — Mangrove ecosystems
  `Mangrove forests thrive in the intertidal zones of tropical and subtropical coastlines, where specialized tree species have evolved remarkable adaptations to survive in saline, waterlogged, and oxygen-poor sediments. Their complex aerial root systems provide stability in soft substrates and create intricate habitats that shelter juvenile fish, crustaceans, and mollusks. Mangroves serve as highly effective natural barriers against coastal erosion, storm surges, and tsunami impacts, dissipating wave energy through their dense root networks. These ecosystems are also extraordinarily efficient at sequestering carbon, storing it in both their biomass and the deep organic-rich sediments beneath them at rates that significantly exceed those of most terrestrial forests. Despite their ecological and economic importance, mangrove forests face ongoing threats from coastal development, aquaculture expansion, and rising sea levels, prompting increased conservation and restoration efforts worldwide.`,

  // 25 — Supernova types
  `Supernovae are among the most energetic events in the universe, briefly outshining entire galaxies and scattering heavy elements throughout interstellar space. Type Ia supernovae occur in binary star systems when a white dwarf accretes enough matter from a companion star to exceed the critical mass limit, triggering a thermonuclear detonation that completely destroys the star. Because these events reach a consistent peak luminosity, they serve as standard candles for measuring cosmic distances and were instrumental in the discovery of the accelerating expansion of the universe. Core-collapse supernovae, encompassing several subtypes, result from the gravitational collapse of massive stars that have exhausted their nuclear fuel. The collapsing core may form a neutron star or black hole, while the outer layers are expelled at tremendous velocities, creating expanding remnants that enrich the surrounding medium with elements heavier than iron.`,

  // 26 — Cave formation
  `Caves form through a variety of geological processes, though the most common mechanism involves the dissolution of soluble bedrock, particularly limestone, by slightly acidic groundwater. As rainwater percolates through soil, it absorbs carbon dioxide and becomes a weak carbonic acid solution that slowly enlarges fractures and bedding planes in the rock over thousands to millions of years. The resulting caverns can extend for kilometers underground, forming complex networks of passages, chambers, and vertical shafts. Secondary mineral deposits, collectively known as speleothems, form within caves as dissolved minerals precipitate from dripping or flowing water. Stalactites grow downward from cave ceilings, while stalagmites build upward from the floor, sometimes meeting to form complete columns. These formations grow at extremely slow rates and preserve chemical records of past climate conditions in their layered structures.`,

  // 27 — Jupiter's atmosphere
  `Jupiter possesses the most dynamic and visually striking atmosphere of any planet in the solar system, characterized by alternating bands of light zones and dark belts driven by powerful jet streams. The Great Red Spot, a massive anticyclonic storm, has persisted for centuries and is large enough to engulf several Earth-sized planets within its boundaries. The atmosphere is composed predominantly of hydrogen and helium, with trace amounts of ammonia, methane, and water vapor that condense at different altitudes to form the colorful cloud layers visible from space. Lightning discharges observed in Jupiter's atmosphere are far more powerful than those on Earth, indicating vigorous convective activity driven by internal heat. Spacecraft missions have provided unprecedented detail of the atmospheric dynamics, revealing intricate vortex structures, polar cyclone arrays, and deep atmospheric circulation patterns that extend far below the visible cloud tops.`,

  // 28 — Migration patterns
  `Animal migration represents one of the most remarkable phenomena in the natural world, involving the seasonal movement of species across vast distances in response to changes in food availability, climate, and breeding conditions. Many bird species navigate thousands of kilometers between their breeding and wintering grounds, using a combination of celestial cues, the Earth's magnetic field, and learned landmarks to maintain their course. Marine species such as sea turtles and certain whale populations undertake similarly impressive journeys across entire ocean basins. The physiological demands of migration are extreme, requiring specialized metabolic adaptations that allow animals to sustain prolonged periods of intense physical activity with minimal rest. Increasingly, human activities including habitat destruction, light pollution, and climate change are disrupting traditional migratory routes and timing, posing significant conservation challenges for many species that depend on predictable seasonal movements.`,

  // 29 — Magnetic reversals
  `Throughout Earth's history, the planet's magnetic field has undergone numerous reversals, during which the magnetic north and south poles exchange positions. Evidence for these reversals is preserved in the magnetization of rocks, particularly in the striped pattern of alternating magnetic polarity recorded in oceanic crust on either side of mid-ocean ridges. The process of reversal is not instantaneous but occurs over thousands of years, during which the magnetic field weakens and becomes more complex before re-establishing itself in the opposite orientation. The intervals between reversals are highly irregular, ranging from tens of thousands to millions of years, with no discernible periodic pattern. During a reversal, the weakened magnetic field provides reduced shielding against solar and cosmic radiation, potentially increasing radiation exposure at the surface. Studying past reversals helps scientists understand the behavior of the geodynamo and improve predictions about the current state and future evolution of Earth's magnetic field.`,
] as const;

// ============================================================================
// Word-count utility
// ============================================================================

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

// ============================================================================
// Deterministic paragraph selection
//
// Uses needleIdx as a seed offset to cycle through paragraphs in a
// reproducible order. No randomness — identical config always yields
// identical output.
// ============================================================================

function selectParagraphs(
  needleIdx: number,
  targetWords: number,
  needleFact: string,
): string[] {
  const needleWords = countWords(needleFact);
  const budgetWords = targetWords - needleWords;

  const paragraphs: string[] = [];
  let accumulated = 0;
  let idx = 0;

  while (accumulated < budgetWords) {
    // Deterministic index: offset by needleIdx, cycle through pool
    const poolIdx = (needleIdx + idx) % PARAGRAPHS.length;
    const para = PARAGRAPHS[poolIdx];
    const paraWords = countWords(para);

    // Stop if adding this paragraph would overshoot by more than 50%
    // of the paragraph's own size (prefer being slightly over target
    // rather than significantly under)
    if (accumulated + paraWords > budgetWords + paraWords * 0.5 && accumulated > 0) {
      break;
    }

    paragraphs.push(para);
    accumulated += paraWords;
    idx++;

    // Safety: if we cycle the entire pool, start repeating with slight variation
    // by prepending "Furthermore, " on the second pass, etc.
    if (idx > 0 && idx % PARAGRAPHS.length === 0) {
      // On subsequent full cycles, paragraphs are re-used as-is.
      // The pool is large enough (~4500 words) that for targets up to
      // ~50K words we will cycle ~11 times, which is acceptable since
      // the haystack is filler text.
    }
  }

  return paragraphs;
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generates a deterministic haystack context with an embedded needle fact.
 *
 * @param config - Haystack configuration
 * @returns HaystackResult with the full context, question, answer, and metadata
 *
 * @example
 * ```ts
 * const result = generateHaystack({
 *   needleIdx: 0,
 *   targetWords: 3750,
 *   needlePosition: 0.5,
 * });
 * console.log(result.question); // "What was the total budget allocated..."
 * console.log(result.answer);   // "$4.7 million"
 * ```
 */
export function generateHaystack(config: HaystackConfig): HaystackResult {
  const { needleIdx, targetWords, needlePosition } = config;

  // Validate inputs
  if (needleIdx < 0 || needleIdx > 9) {
    throw new Error(`needleIdx must be 0-9, got ${needleIdx}`);
  }
  if (targetWords < 50) {
    throw new Error(`targetWords must be >= 50, got ${targetWords}`);
  }
  if (needlePosition < 0.0 || needlePosition > 1.0) {
    throw new Error(`needlePosition must be 0.0-1.0, got ${needlePosition}`);
  }

  const needle = NEEDLES[needleIdx];
  const needleSentence = needle.fact + '.';

  // Select padding paragraphs
  const paragraphs = selectParagraphs(needleIdx, targetWords, needleSentence);

  // Determine needle insertion point (paragraph index)
  const totalParagraphs = paragraphs.length;
  const insertAfter = Math.min(
    Math.max(0, Math.floor(needlePosition * totalParagraphs)),
    totalParagraphs,
  );

  // Build paragraphs with needle inserted at the right position.
  // The needle is wrapped as its own paragraph to blend seamlessly.
  const assembled: string[] = [];
  let needleWordPos = 0;
  let needleInserted = false;

  for (let i = 0; i < paragraphs.length; i++) {
    if (i === insertAfter && !needleInserted) {
      needleWordPos = countWords(assembled.join('\n\n'));
      assembled.push(needleSentence);
      needleInserted = true;
    }
    assembled.push(paragraphs[i]);
  }

  // If needle goes at the very end (position ~1.0)
  if (!needleInserted) {
    needleWordPos = countWords(assembled.join('\n\n'));
    assembled.push(needleSentence);
  }

  const context = assembled.join('\n\n');
  const wordCount = countWords(context);

  return {
    context,
    question: needle.question,
    answer: needle.answer,
    needleSentence,
    wordCount,
    needleWordPos,
  };
}
