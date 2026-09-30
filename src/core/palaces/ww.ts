/**
 * Demo palace for the video: World Wars I & II — 20 high-school notions (10 + 10), in
 * chronological order. Scenes are vivid but tasteful: symbolic animals (British lion, French
 * rooster, Russian bear, American eagle), doves for peace, poppies for remembrance, clocks and
 * counts for dates — no gore, no weapon aimed at anyone, no offensive symbols.
 */
import type { Palace } from '../types';

const CREATED_AT = Date.UTC(2026, 8, 29);

export const WORLD_WARS: Palace = {
  id: 'world-wars',
  title: 'World Wars I & II',
  subject: 'History',
  lang: 'en',
  createdAt: CREATED_AT,
  builtin: true,
  notions: [
    // ── World War I ─────────────────────────────────────────────────────────
    {
      id: 'ww1-sarajevo',
      question: 'City where Archduke Franz Ferdinand was assassinated in 1914?',
      answer: 'Sarajevo',
      distractors: ['Vienna', 'Belgrade'],
      scene: {
        actors: [
          { model: 'tophat', role: 'hero', anim: 'spin', scale: 1.2 },
          { model: 'sun', role: 'prop', anim: 'grow', tint: '#ffb300' },
          { model: 'sign', role: 'prop', anim: 'wobble', label: 'SARAJEVO' },
        ],
        caption: "The Archduke's TOP HAT spins off under a SAHARA sun — SAHARA-YEVO: SARAJEVO!",
        hooks: ['TOP HAT', 'SAHARA', 'SARAJEVO'],
        accent: '#ffb300',
      },
    },
    {
      id: 'ww1-start',
      question: 'Year World War I began?',
      answer: '1914',
      distractors: ['1912', '1916'],
      scene: {
        actors: [
          { model: 'bell', role: 'hero', anim: 'shake', scale: 1.2 },
          { model: 'soldier', role: 'count', anim: 'march', count: 4 },
          { model: 'sign', role: 'prop', anim: 'float', label: '1914' },
        ],
        caption: 'Alarm BELLS ring as FOUR SOLDIERS march off — nineteen-FOUR-teen: 1914!',
        hooks: ['BELLS', 'FOUR SOLDIERS', 'FOUR', '1914'],
        accent: '#ef5350',
      },
    },
    {
      id: 'ww1-gallipoli',
      question: 'Allied campaign of 1915 on a Turkish peninsula?',
      answer: 'Gallipoli',
      accept: ['Gallipoli campaign', 'Dardanelles'],
      distractors: ['Salonika', 'Jutland'],
      scene: {
        actors: [
          { model: 'horse', role: 'hero', anim: 'march', scale: 1.1 },
          { model: 'ship', role: 'prop', anim: 'wobble' },
          { model: 'wave', role: 'prop', anim: 'wobble' },
        ],
        caption: 'A HORSE GALLOPS along the beach past a SHIP — GALLOP-POLI: GALLIPOLI!',
        hooks: ['HORSE', 'GALLOPS', 'SHIP', 'GALLIPOLI'],
        accent: '#4fc3f7',
      },
    },
    {
      id: 'ww1-verdun',
      question: "1916 battle where France vowed 'They shall not pass'?",
      answer: 'Verdun',
      accept: ['Battle of Verdun'],
      distractors: ['The Somme', 'Ypres'],
      scene: {
        actors: [
          { model: 'rooster', role: 'hero', anim: 'march', scale: 1.2 },
          { model: 'brickwall', role: 'prop', anim: 'shake' },
          { model: 'flag', role: 'prop', anim: 'wobble', label: 'VERDUN' },
        ],
        caption: "A French ROOSTER guards a BRICK WALL: 'They shall not pass!' — VERDUN!",
        hooks: ['ROOSTER', 'BRICK WALL', 'VERDUN'],
        accent: '#5c6bc0',
      },
    },
    {
      id: 'ww1-zimmermann',
      question: 'Intercepted German message that pushed the USA towards war in 1917?',
      answer: 'Zimmermann telegram',
      accept: ['Zimmermann', 'Zimmerman telegram', 'Zimmerman', 'the Zimmermann note'],
      distractors: ['Ems Dispatch', 'Balfour Declaration'],
      scene: {
        actors: [
          { model: 'sailor', role: 'hero', anim: 'wobble', scale: 1.1 },
          { model: 'envelope', role: 'prop', anim: 'fly', scale: 1.3 },
          { model: 'wave', role: 'prop', anim: 'wobble' },
        ],
        caption: 'A SWIMMER-MAN sailor paddles a giant ENVELOPE across the sea — the ZIMMERMANN telegram!',
        hooks: ['SWIMMER-MAN', 'ENVELOPE', 'ZIMMERMANN'],
        accent: '#fbc02d',
      },
    },
    {
      id: 'ww1-us-entry',
      question: 'Year the USA entered World War I?',
      answer: '1917',
      distractors: ['1915', '1918'],
      scene: {
        actors: [
          { model: 'eagle', role: 'hero', anim: 'fly', scale: 1.2 },
          { model: 'ship', role: 'count', anim: 'float', count: 7 },
          { model: 'sign', role: 'prop', anim: 'float', label: '1917' },
        ],
        caption: 'An American EAGLE leads SEVEN SHIPS across the ocean — nineteen-SEVEN-teen: 1917!',
        hooks: ['EAGLE', 'SEVEN SHIPS', '1917'],
        accent: '#42a5f5',
      },
    },
    {
      id: 'ww1-brest-litovsk',
      question: 'Treaty by which Russia left World War I in 1918?',
      answer: 'Brest-Litovsk',
      accept: ['Treaty of Brest-Litovsk', 'Brest Litovsk', 'Brest'],
      distractors: ['Trianon', 'Versailles'],
      scene: {
        actors: [
          { model: 'bear', role: 'hero', anim: 'wobble', scale: 1.2 },
          { model: 'tent', role: 'prop', anim: 'idle' },
          { model: 'scroll', role: 'prop', anim: 'float', label: 'BREST-LITOVSK' },
        ],
        caption: 'A tired Russian BEAR quits the war for a long REST in its TENT — B-REST-Litovsk!',
        hooks: ['BEAR', 'REST', 'TENT', 'B-REST-Litovsk'],
        accent: '#8d6e63',
      },
    },
    {
      id: 'ww1-armistice',
      question: 'Day the WWI Armistice took effect, at 11 am, in 1918?',
      answer: '11 November',
      accept: ['November 11', '11 November 1918', 'November 11 1918', 'Armistice Day'],
      distractors: ['9 November', '11 October'],
      scene: {
        actors: [
          { model: 'clock', role: 'hero', anim: 'spin', scale: 1.2 },
          { model: 'dove', role: 'count', anim: 'fly', count: 11 },
          { model: 'poppy', role: 'prop', anim: 'grow', tint: '#e53935' },
        ],
        caption: 'A CLOCK strikes ELEVEN and ELEVEN DOVES fly out over a red POPPY — 11th hour, 11th day, 11th month!',
        hooks: ['CLOCK', 'ELEVEN', 'ELEVEN DOVES', 'POPPY'],
        accent: '#e53935',
      },
    },
    {
      id: 'ww1-versailles',
      question: 'Year the Treaty of Versailles was signed?',
      answer: '1919',
      distractors: ['1918', '1920'],
      scene: {
        actors: [
          { model: 'castle', role: 'hero', anim: 'grow', scale: 1.1 },
          { model: 'scroll', role: 'prop', anim: 'float', label: 'VERSAILLES 1919' },
          { model: 'dove', role: 'prop', anim: 'orbit' },
        ],
        caption: 'A giant peace SCROLL floats out of the CASTLE of Versailles, a DOVE circling it — nineteen-NINETEEN: 1919!',
        hooks: ['SCROLL', 'CASTLE', 'DOVE', 'NINETEEN', '1919'],
        accent: '#ffd54f',
      },
    },
    {
      id: 'ww1-league',
      question: 'Organisation founded after World War I to keep the peace?',
      answer: 'League of Nations',
      accept: ['The League of Nations', 'League', 'Societe des Nations'],
      distractors: ['United Nations', 'NATO'],
      scene: {
        actors: [
          { model: 'trophy', role: 'hero', anim: 'spin', scale: 1.2 },
          { model: 'globe', role: 'prop', anim: 'wobble' },
          { model: 'dove', role: 'prop', anim: 'orbit' },
        ],
        caption: 'The nations play in a peace LEAGUE: the GLOBE lifts the TROPHY while a DOVE circles — LEAGUE of Nations!',
        hooks: ['LEAGUE', 'GLOBE', 'TROPHY', 'DOVE'],
        accent: '#9fa8ff',
      },
    },

    // ── World War II ────────────────────────────────────────────────────────
    {
      id: 'ww2-poland',
      question: 'Country invaded by Germany on 1 September 1939, starting World War II?',
      answer: 'Poland',
      distractors: ['Czechoslovakia', 'France'],
      scene: {
        actors: [
          { model: 'penguin', role: 'hero', anim: 'flip', scale: 1.1 },
          { model: 'flag', role: 'prop', anim: 'wobble', label: 'POLAND', tint: '#e53935' },
          { model: 'snowflake', role: 'prop', anim: 'rain' },
        ],
        caption: 'A South POLE PENGUIN slides down a FLAG POLE — POLE-LAND: POLAND!',
        hooks: ['POLE', 'PENGUIN', 'FLAG POLE', 'POLAND'],
        accent: '#ef5350',
      },
    },
    {
      id: 'ww2-britain',
      question: 'Year of the Battle of Britain?',
      answer: '1940',
      distractors: ['1939', '1941'],
      scene: {
        actors: [
          { model: 'lion', role: 'hero', anim: 'grow', scale: 1.2 },
          { model: 'biplane', role: 'count', anim: 'fly', count: 4 },
          { model: 'sign', role: 'prop', anim: 'float', label: '1940' },
        ],
        caption: 'The British LION roars at the sky as FOUR PLANES loop above it — nineteen FORTY: 1940!',
        hooks: ['LION', 'FOUR PLANES', 'FORTY', '1940'],
        accent: '#1e88e5',
      },
    },
    {
      id: 'ww2-barbarossa',
      question: 'Code name of the 1941 German invasion of the Soviet Union?',
      answer: 'Operation Barbarossa',
      accept: ['Barbarossa'],
      distractors: ['Operation Overlord', 'Operation Sea Lion'],
      scene: {
        actors: [
          { model: 'king', role: 'hero', anim: 'shake', scale: 1.2, tint: '#c62828' },
          { model: 'snowflake', role: 'prop', anim: 'rain' },
          { model: 'sign', role: 'prop', anim: 'wobble', label: 'BARBAROSSA' },
        ],
        caption: 'An emperor with a huge RED BEARD shivers in the Russian SNOW — BARBA-ROSSA means RED BEARD!',
        hooks: ['RED BEARD', 'SNOW', 'BARBA-ROSSA'],
        accent: '#c62828',
      },
    },
    {
      id: 'ww2-pearl-harbor',
      question: 'Date of the attack on Pearl Harbor?',
      answer: '7 December 1941',
      accept: ['December 7 1941', '7 December', 'December 7'],
      distractors: ['7 December 1942', '7 November 1941'],
      scene: {
        actors: [
          { model: 'ship', role: 'hero', anim: 'wobble', scale: 1.2 },
          { model: 'ball', role: 'count', anim: 'rain', count: 7, tint: '#f5f0e6' },
          { model: 'sign', role: 'prop', anim: 'float', label: '7 DEC 1941' },
        ],
        caption: 'SEVEN giant PEARLS rain onto a SHIP in the HARBOR — December SEVENTH, 1941!',
        hooks: ['SEVEN', 'PEARLS', 'SHIP', 'HARBOR', 'SEVENTH'],
        accent: '#b0bec5',
      },
    },
    {
      id: 'ww2-stalingrad',
      question: 'City where the Soviets turned the tide in 1942–43?',
      answer: 'Stalingrad',
      accept: ['Battle of Stalingrad'],
      distractors: ['Leningrad', 'Moscow'],
      scene: {
        actors: [
          { model: 'bear', role: 'hero', anim: 'march', scale: 1.2 },
          { model: 'tank', role: 'prop', anim: 'shake' },
          { model: 'star', role: 'prop', anim: 'spin', tint: '#e53935' },
        ],
        caption: 'The Russian BEAR stomps as an enemy TANK STALLS in the snow under a red STAR — STALL-IN-GRAD!',
        hooks: ['BEAR', 'TANK', 'STALLS', 'STAR', 'STALL-IN-GRAD'],
        accent: '#e53935',
      },
    },
    {
      id: 'ww2-bletchley',
      question: "Where did Alan Turing's team break the Enigma code?",
      answer: 'Bletchley Park',
      accept: ['Bletchley'],
      distractors: ['Los Alamos', 'Whitehall'],
      scene: {
        actors: [
          { model: 'scientist', role: 'hero', anim: 'shake', scale: 1.2 },
          { model: 'gear', role: 'prop', anim: 'spin' },
          { model: 'tree', role: 'prop', anim: 'wobble' },
        ],
        caption: 'A SCIENTIST cracks the code and lets out a huge BELCH in the PARK as GEARS spin — BLETCH-ley PARK!',
        hooks: ['SCIENTIST', 'BELCH', 'PARK', 'GEARS', 'BLETCH'],
        accent: '#7fd1ae',
      },
    },
    {
      id: 'ww2-d-day',
      question: 'Date of D-Day, the Allied landings in France?',
      answer: '6 June 1944',
      accept: ['June 6 1944', '6 June', 'June 6'],
      distractors: ['6 June 1943', '6 August 1944'],
      scene: {
        actors: [
          { model: 'sun', role: 'hero', anim: 'grow', scale: 1.1 },
          { model: 'ship', role: 'count', anim: 'float', count: 6 },
          { model: 'sign', role: 'prop', anim: 'float', label: '6 JUNE 1944' },
        ],
        caption: 'A JUNE SUN rises over SIX SHIPS crossing the Channel — D-Day, June SIXTH 1944!',
        hooks: ['JUNE SUN', 'SIX SHIPS', 'SIXTH'],
        accent: '#ffca28',
      },
    },
    {
      id: 'ww2-normandy',
      question: 'Region of France where the D-Day landings took place?',
      answer: 'Normandy',
      accept: ['Normandie'],
      distractors: ['Brittany', 'Provence'],
      scene: {
        actors: [
          { model: 'knight', role: 'hero', anim: 'march', scale: 1.1 },
          { model: 'wave', role: 'prop', anim: 'wobble' },
          { model: 'cheese', role: 'prop', anim: 'spin', tint: '#fff3c4' },
        ],
        caption: 'A NORMAN KNIGHT surfs a WAVE onto the beach waving a CAMEMBERT — NORMAN-DY: NORMANDY!',
        hooks: ['NORMAN', 'KNIGHT', 'WAVE', 'CAMEMBERT', 'NORMANDY'],
        accent: '#26a69a',
      },
    },
    {
      id: 'ww2-ve-day',
      question: 'Date of VE Day, Victory in Europe?',
      answer: '8 May 1945',
      accept: ['May 8 1945', '8 May', 'May 8'],
      distractors: ['9 May 1945', '2 September 1945'],
      scene: {
        actors: [
          { model: 'bell', role: 'hero', anim: 'shake', scale: 1.2 },
          { model: 'dove', role: 'count', anim: 'fly', count: 8 },
          { model: 'flag', role: 'prop', anim: 'wobble', label: 'VE DAY 8 MAY 1945' },
        ],
        caption: 'A victory BELL rings and EIGHT DOVES burst out into the MAY sky — VE Day, May EIGHTH 1945!',
        hooks: ['BELL', 'EIGHT DOVES', 'MAY', 'EIGHTH'],
        accent: '#66bb6a',
      },
    },
    {
      id: 'ww2-un',
      question: 'Organisation founded in 1945 to keep world peace?',
      answer: 'United Nations',
      accept: ['The United Nations', 'UN', 'U.N.', 'UNO'],
      distractors: ['League of Nations', 'NATO'],
      scene: {
        actors: [
          { model: 'globe', role: 'hero', anim: 'spin', scale: 1.2, tint: '#4fc3f7' },
          { model: 'dove', role: 'prop', anim: 'orbit' },
          { model: 'flag', role: 'prop', anim: 'wobble', label: 'UNITED NATIONS', tint: '#4fc3f7' },
        ],
        caption: 'The whole GLOBE holds hands under one blue FLAG while a DOVE circles — UNITED NATIONS!',
        hooks: ['GLOBE', 'FLAG', 'DOVE', 'UNITED NATIONS'],
        accent: '#4fc3f7',
      },
    },
  ],
};
