/**
 * Pure-data mirror of the procedural model catalog (src/lib3d/catalog.ts), usable without Three.js:
 * by the server (AI prompt, scene validation), the offline mnemonic composer and tests.
 *
 * One entry per id of `REQUIRED_IDS`. `tags` say what a model can *mean* (symbols, historical
 * associations, idioms); `soundsLike` lists syllables it can *pun* on, in English and French
 * (lower-case, no accents), e.g. avocado → "avo" (Avogadro).
 *
 * The lead may regenerate this file from src/lib3d; keep the shape of {@link CatalogEntry}.
 */
import type { AnimId } from './types';

export type CatalogCategory = 'animal' | 'person' | 'food' | 'nature' | 'science' | 'object' | 'vehicle' | 'structure';

export interface CatalogEntry {
  id: string;
  name: string;
  category: CatalogCategory;
  tags: string[];
  soundsLike: string[];
  /** true if the model renders a `label` (sign, plaque, scroll, flag, book). */
  text?: boolean;
  /** Anims that look natural on this model (first = preferred). */
  anims: AnimId[];
}

const e = (id: string, name: string, category: CatalogCategory, tags: string[], soundsLike: string[], anims: AnimId[], text?: boolean): CatalogEntry =>
  text ? { id, name, category, tags, soundsLike, text: true, anims } : { id, name, category, tags, soundsLike, anims };

export const CATALOG_INDEX: CatalogEntry[] = [
  // ── Animals ────────────────────────────────────────────────────────────────
  e('kangaroo', 'Kangaroo', 'animal', ['kangaroo', 'australia', 'jump', 'hop', 'pouch', 'outback', 'boxing', 'marsupial', 'leap'], ['kanga', 'kang', 'kan', 'can', 'roo', 'rou', 'cang'], ['bounce', 'flip', 'dance', 'march']),
  e('elephant', 'Elephant', 'animal', ['elephant', 'memory', 'never forgets', 'africa', 'india', 'big', 'heavy', 'trunk', 'ivory', 'republican', 'hannibal', 'circus'], ['ele', 'elef', 'elephan', 'fant', 'ella', 'hell'], ['march', 'wobble', 'grow', 'dance']),
  e('owl', 'Owl', 'animal', ['owl', 'wisdom', 'knowledge', 'night', 'athena', 'minerva', 'athens', 'philosophy', 'school', 'hoot'], ['owl', 'hou', 'hoo', 'ow', 'aul', 'chou'], ['float', 'wobble', 'fly', 'spin']),
  e('cat', 'Cat', 'animal', ['cat', 'curiosity', 'egypt', 'bastet', 'nine lives', 'luck', 'witch', 'pet', 'meow', 'chat'], ['cat', 'kat', 'chat', 'cath', 'catt', 'ca'], ['wobble', 'bounce', 'flip', 'dance']),
  e('dog', 'Dog', 'animal', ['dog', 'loyalty', 'friend', 'pavlov', 'conditioning', 'guard', 'bark', 'pet', 'chien', 'laika'], ['dog', 'dug', 'doge', 'chien', 'bow'], ['bounce', 'wobble', 'dance', 'march']),
  e('fish', 'Fish', 'animal', ['fish', 'sea', 'ocean', 'water', 'swim', 'christian', 'pisces', 'poisson', 'evolution'], ['fish', 'fis', 'pois', 'poisson', 'fi'], ['float', 'wobble', 'flip', 'rain']),
  e('dove', 'Dove', 'animal', ['dove', 'peace', 'treaty', 'armistice', 'truce', 'hope', 'love', 'united nations', 'olive', 'colombe', 'victory', 'freedom'], ['dove', 'duv', 'dov', 'colomb', 'colon'], ['fly', 'orbit', 'float', 'rain']),
  e('eagle', 'Eagle', 'animal', ['eagle', 'america', 'usa', 'united states', 'rome', 'empire', 'power', 'freedom', 'sky', 'aigle', 'napoleon'], ['eagle', 'eag', 'egal', 'aigle', 'ego', 'igle'], ['fly', 'orbit', 'float', 'grow']),
  e('bear', 'Bear', 'animal', ['bear', 'russia', 'soviet', 'ussr', 'strength', 'winter', 'honey', 'market', 'berlin', 'california', 'ours'], ['bear', 'bare', 'ber', 'bair', 'beer', 'ours', 'bern'], ['march', 'wobble', 'shake', 'dance']),
  e('lion', 'Lion', 'animal', ['lion', 'britain', 'england', 'king', 'courage', 'pride', 'africa', 'leo', 'roar', 'royal', 'belgium'], ['lion', 'lie', 'lyon', 'leon', 'leo', 'li'], ['grow', 'march', 'wobble', 'shake']),
  e('rooster', 'Rooster', 'animal', ['rooster', 'france', 'french', 'gaul', 'morning', 'dawn', 'wake up', 'pride', 'coq', 'cock'], ['roost', 'roo', 'coq', 'coc', 'coque', 'gal', 'gaul'], ['march', 'shake', 'dance', 'bounce']),
  e('frog', 'Frog', 'animal', ['frog', 'jump', 'pond', 'metamorphosis', 'prince', 'amphibian', 'galvani', 'electricity', 'grenouille', 'france'], ['frog', 'frag', 'fro', 'grenou', 'croak'], ['bounce', 'flip', 'stack', 'rain']),
  e('snail', 'Snail', 'animal', ['snail', 'slow', 'shell', 'spiral', 'patience', 'escargot', 'france', 'delay'], ['snail', 'snel', 'nail', 'esca', 'escar', 'cargo', 'escargot'], ['march', 'float', 'grow', 'idle']),
  e('bee', 'Bee', 'animal', ['bee', 'honey', 'work', 'busy', 'hive', 'pollen', 'sting', 'napoleon', 'abeille', 'buzz'], ['bee', 'be', 'bi', 'b', 'abe', 'abeille', 'buzz'], ['fly', 'orbit', 'rain', 'juggle']),
  e('penguin', 'Penguin', 'animal', ['penguin', 'antarctica', 'south pole', 'pole', 'cold', 'ice', 'tuxedo', 'march', 'pingouin', 'manchot'], ['pen', 'peng', 'pingu', 'pin', 'win', 'gwin', 'manch'], ['march', 'wobble', 'flip', 'dance']),
  e('horse', 'Horse', 'animal', ['horse', 'cavalry', 'gallop', 'ride', 'troy', 'knight', 'speed', 'horsepower', 'cheval', 'mongol'], ['horse', 'hors', 'gallop', 'gal', 'cheval', 'chev', 'jument'], ['march', 'bounce', 'flip', 'dance']),
  e('turkey', 'Turkey', 'animal', ['turkey', 'thanksgiving', 'feast', 'gobble', 'november', 'bird', 'dinde', 'pilgrims'], ['turk', 'tur', 'turkey', 'dinde', 'dind', 'gobble'], ['wobble', 'march', 'shake', 'dance']),
  e('otter', 'Otter', 'animal', ['otter', 'river', 'swim', 'play', 'water', 'fur', 'loutre', 'canada'], ['otter', 'otta', 'ott', 'auto', 'hotter', 'loutre'], ['flip', 'float', 'wobble', 'spin']),
  e('sheep', 'Sheep', 'animal', ['sheep', 'wool', 'new zealand', 'flock', 'counting', 'sleep', 'dolly', 'clone', 'lamb', 'mouton', 'follower'], ['sheep', 'ship', 'shee', 'mouton', 'mout', 'baa', 'lamb'], ['march', 'bounce', 'wobble', 'stack']),

  // ── People ─────────────────────────────────────────────────────────────────
  e('soldier', 'Soldier', 'person', ['soldier', 'army', 'war', 'troops', 'infantry', 'trench', 'march', 'battle', 'duty', 'soldat', 'guard'], ['sold', 'solder', 'soldat', 'sol', 'shoulder'], ['march', 'wobble', 'idle', 'dance']),
  e('king', 'King', 'person', ['king', 'monarchy', 'royal', 'crown', 'emperor', 'kaiser', 'tsar', 'power', 'rule', 'roi', 'louis', 'reign'], ['king', 'kin', 'kingston', 'roi', 'roy', 'rex'], ['wobble', 'march', 'dance', 'grow']),
  e('sailor', 'Sailor', 'person', ['sailor', 'navy', 'sea', 'ship', 'ocean', 'voyage', 'explorer', 'marin', 'swim', 'port'], ['sail', 'sale', 'sailor', 'salo', 'marin', 'mar'], ['wobble', 'dance', 'march', 'float']),
  e('pilot', 'Pilot', 'person', ['pilot', 'flight', 'aviation', 'air force', 'plane', 'sky', 'wright', 'lindbergh', 'pilote', 'ace'], ['pilot', 'pile', 'pil', 'pilote', 'lot'], ['wobble', 'float', 'dance', 'march']),
  e('scientist', 'Scientist', 'person', ['scientist', 'science', 'experiment', 'laboratory', 'research', 'einstein', 'curie', 'genius', 'invention', 'code', 'savant', 'theory'], ['sci', 'scien', 'sigh', 'savant', 'sav'], ['wobble', 'shake', 'dance', 'bounce']),
  e('knight', 'Knight', 'person', ['knight', 'chivalry', 'middle ages', 'medieval', 'crusade', 'armour', 'honour', 'norman', 'england', 'chevalier', 'quest'], ['knight', 'night', 'nite', 'nait', 'chev', 'chevalier'], ['march', 'wobble', 'bounce', 'idle']),

  // ── Food ───────────────────────────────────────────────────────────────────
  e('avocado', 'Avocado', 'food', ['avocado', 'mexico', 'guacamole', 'green', 'fruit', 'healthy', 'avocat', 'lawyer'], ['avo', 'avoca', 'avocad', 'avocat', 'cado', 'guaca'], ['juggle', 'bounce', 'spin', 'dance']),
  e('apple', 'Apple', 'food', ['apple', 'fruit', 'newton', 'gravity', 'health', 'teacher', 'new york', 'temptation', 'eden', 'snow white', 'pomme'], ['app', 'appl', 'apple', 'pomme', 'pom', 'pomp'], ['bounce', 'spin', 'rain', 'juggle']),
  e('banana', 'Banana', 'food', ['banana', 'fruit', 'tropical', 'monkey', 'slip', 'yellow', 'republic', 'banane'], ['ban', 'bana', 'nana', 'banan', 'anna'], ['spin', 'juggle', 'flip', 'dance']),
  e('cheese', 'Cheese', 'food', ['cheese', 'switzerland', 'swiss', 'france', 'holes', 'mouse', 'fromage', 'dairy', 'emmental', 'camembert', 'normandy'], ['cheese', 'chee', 'chez', 'fromage', 'from', 'fro'], ['spin', 'wobble', 'shake', 'bounce']),
  e('cake', 'Cake', 'food', ['cake', 'birthday', 'celebration', 'anniversary', 'marie antoinette', 'party', 'candles', 'gateau', 'layers'], ['cake', 'cak', 'kek', 'gato', 'gateau'], ['spin', 'wobble', 'stack', 'grow']),
  e('teacup', 'Teacup', 'food', ['tea', 'teacup', 'britain', 'england', 'boston', 'tea party', 'china', 'india', 'afternoon', 'the'], ['tea', 'tee', 'ti', 'cup', 'the', 'tasse'], ['spin', 'wobble', 'float', 'stack']),
  e('pizza', 'Pizza', 'food', ['pizza', 'italy', 'naples', 'slice', 'fraction', 'pie', 'circle', 'pi'], ['pizz', 'piz', 'pisa', 'pi', 'pie', 'pis'], ['spin', 'flip', 'juggle', 'rain']),

  // ── Nature ─────────────────────────────────────────────────────────────────
  e('tree', 'Tree', 'nature', ['tree', 'forest', 'growth', 'family tree', 'roots', 'life', 'oak', 'nature', 'arbre', 'photosynthesis', 'wood'], ['tree', 'three', 'tri', 'arbre', 'arb', 'tre'], ['wobble', 'grow', 'shake', 'idle']),
  e('mountain', 'Mountain', 'nature', ['mountain', 'alps', 'peak', 'everest', 'summit', 'climb', 'himalaya', 'mont', 'montagne', 'obstacle'], ['mount', 'mont', 'mon', 'montagne', 'moun'], ['grow', 'shake', 'idle', 'wobble']),
  e('sun', 'Sun', 'nature', ['sun', 'light', 'day', 'summer', 'heat', 'japan', 'rising sun', 'solar', 'energy', 'louis xiv', 'soleil', 'june', 'star'], ['sun', 'son', 'sol', 'soleil', 'sonne', 'sunny'], ['spin', 'grow', 'float', 'orbit']),
  e('moon', 'Moon', 'nature', ['moon', 'night', 'apollo', 'armstrong', 'tide', 'month', 'lunar', 'lune', 'crescent', 'dream'], ['moon', 'mun', 'mon', 'lune', 'loon', 'lun'], ['float', 'orbit', 'spin', 'grow']),
  e('star', 'Star', 'nature', ['star', 'fame', 'wish', 'night', 'america', 'flag', 'astronomy', 'etoile', 'hollywood', 'excellence'], ['star', 'sta', 'stal', 'stalin', 'etoile', 'etoi'], ['spin', 'rain', 'orbit', 'juggle']),
  e('cloud', 'Cloud', 'nature', ['cloud', 'weather', 'rain', 'sky', 'dream', 'storm', 'nuage', 'computing', 'fog'], ['cloud', 'clou', 'claude', 'clo', 'nuage'], ['float', 'rain', 'wobble', 'grow']),
  e('lightning', 'Lightning', 'nature', ['lightning', 'electricity', 'storm', 'thunder', 'zeus', 'franklin', 'blitz', 'energy', 'eclair', 'fast', 'shock'], ['light', 'lite', 'blitz', 'eclair', 'thunder', 'zap'], ['shake', 'grow', 'rain', 'flip']),
  e('snowflake', 'Snowflake', 'nature', ['snow', 'snowflake', 'winter', 'cold', 'ice', 'russia', 'christmas', 'crystal', 'neige', 'freeze'], ['snow', 'sno', 'flake', 'neige', 'nei', 'flo'], ['rain', 'spin', 'float', 'orbit']),
  e('fire', 'Fire', 'nature', ['fire', 'flame', 'burn', 'heat', 'prometheus', 'energy', 'danger', 'passion', 'feu', 'london', 'revolution', 'torch'], ['fire', 'fir', 'burn', 'bern', 'feu', 'fer', 'flam'], ['grow', 'shake', 'wobble', 'dance']),
  e('wave', 'Wave', 'nature', ['wave', 'water', 'sea', 'ocean', 'surf', 'tsunami', 'beach', 'landing', 'physics', 'sound', 'vague', 'hello'], ['wave', 'wa', 'wav', 'vague', 'vag', 'eau', 'water', 'wat'], ['wobble', 'float', 'grow', 'shake']),

  // ── Science ────────────────────────────────────────────────────────────────
  e('globe', 'Globe', 'science', ['globe', 'world', 'earth', 'planet', 'geography', 'united nations', 'international', 'travel', 'map', 'global', 'terre'], ['glob', 'globe', 'glo', 'world', 'terre'], ['spin', 'orbit', 'float', 'wobble']),
  e('atom', 'Atom', 'science', ['atom', 'physics', 'chemistry', 'nuclear', 'energy', 'electron', 'bohr', 'rutherford', 'element', 'molecule', 'atome'], ['atom', 'atome', 'adam', 'at', 'tom'], ['spin', 'orbit', 'float', 'grow']),
  e('flask', 'Flask', 'science', ['flask', 'chemistry', 'experiment', 'potion', 'laboratory', 'reaction', 'solution', 'acid', 'fiole'], ['flask', 'flas', 'flash', 'fiole', 'fio'], ['shake', 'wobble', 'bounce', 'float']),
  e('telescope', 'Telescope', 'science', ['telescope', 'astronomy', 'galileo', 'stars', 'discovery', 'space', 'hubble', 'observe', 'lunette'], ['tele', 'tel', 'scope', 'lunette'], ['spin', 'wobble', 'idle', 'float']),
  e('magnet', 'Magnet', 'science', ['magnet', 'magnetism', 'attraction', 'north', 'south', 'compass', 'force', 'faraday', 'aimant'], ['magn', 'mag', 'magnet', 'net', 'aimant'], ['wobble', 'shake', 'spin', 'orbit']),
  e('lightbulb', 'Light bulb', 'science', ['lightbulb', 'idea', 'invention', 'edison', 'electricity', 'light', 'genius', 'enlightenment', 'ampoule'], ['bulb', 'bul', 'light', 'lite', 'ampoule', 'ampou'], ['grow', 'float', 'spin', 'shake']),

  // ── Objects ────────────────────────────────────────────────────────────────
  e('book', 'Book', 'object', ['book', 'knowledge', 'reading', 'bible', 'law', 'history', 'library', 'story', 'novel', 'code', 'livre', 'constitution'], ['book', 'boo', 'buck', 'livre', 'liv'], ['float', 'spin', 'flip', 'stack'], true),
  e('clock', 'Clock', 'object', ['clock', 'time', 'hour', 'deadline', 'eleven', 'armistice', 'midnight', 'late', 'horloge', 'history', 'tick'], ['clock', 'clo', 'cloc', 'tick', 'horlo', 'heure'], ['spin', 'wobble', 'shake', 'grow']),
  e('bell', 'Bell', 'object', ['bell', 'alarm', 'church', 'victory', 'liberty', 'school', 'ring', 'celebration', 'cloche', 'graham bell', 'telephone'], ['bell', 'bel', 'belle', 'cloche', 'ding'], ['shake', 'wobble', 'spin', 'grow']),
  e('crown', 'Crown', 'object', ['crown', 'king', 'queen', 'monarchy', 'empire', 'royal', 'coronation', 'power', 'couronne', 'victory'], ['crown', 'crow', 'cro', 'couronne', 'coro'], ['spin', 'float', 'orbit', 'bounce']),
  e('sword', 'Sword', 'object', ['sword', 'knight', 'battle', 'duel', 'honour', 'excalibur', 'justice', 'epee', 'blade'], ['sword', 'sore', 'sord', 'epee', 'saber', 'sabre'], ['spin', 'float', 'wobble', 'flip']),
  e('shield', 'Shield', 'object', ['shield', 'defence', 'protection', 'knight', 'resistance', 'guard', 'bouclier', 'wall'], ['shield', 'shiel', 'shell', 'bouclier', 'boucl'], ['spin', 'wobble', 'float', 'shake']),
  e('key', 'Key', 'object', ['key', 'secret', 'code', 'unlock', 'solution', 'answer', 'door', 'cle', 'music', 'access'], ['key', 'kee', 'ki', 'quay', 'cle', 'clef'], ['spin', 'float', 'orbit', 'wobble']),
  e('coin', 'Coin', 'object', ['coin', 'money', 'gold', 'euro', 'dollar', 'trade', 'economy', 'treasure', 'piece', 'luck', 'tax'], ['coin', 'coi', 'quoi', 'piece', 'penny', 'cent'], ['spin', 'rain', 'stack', 'juggle', 'flip']),
  e('trophy', 'Trophy', 'object', ['trophy', 'victory', 'winner', 'champion', 'league', 'cup', 'prize', 'olympics', 'coupe', 'win'], ['troph', 'trophy', 'tro', 'coupe', 'cup'], ['spin', 'grow', 'bounce', 'float']),
  e('candle', 'Candle', 'object', ['candle', 'light', 'remembrance', 'memory', 'birthday', 'church', 'hope', 'vigil', 'bougie', 'flame', 'enlightenment'], ['candle', 'cand', 'kandel', 'bougie', 'boug'], ['wobble', 'grow', 'float', 'idle']),
  e('umbrella', 'Umbrella', 'object', ['umbrella', 'rain', 'protection', 'weather', 'britain', 'chamberlain', 'appeasement', 'parapluie', 'london'], ['umbrel', 'umb', 'brella', 'ella', 'parapluie', 'para'], ['spin', 'float', 'wobble', 'flip']),
  e('tophat', 'Top hat', 'object', ['top hat', 'hat', 'gentleman', 'magic', 'magician', 'lincoln', 'archduke', 'aristocrat', 'chapeau', 'victorian', 'elegance'], ['top', 'hat', 'chapeau', 'chap', 'lincoln'], ['spin', 'flip', 'bounce', 'float']),
  e('ball', 'Ball', 'object', ['ball', 'sport', 'football', 'game', 'round', 'sphere', 'pearl', 'dance', 'balle', 'ballon', 'play'], ['ball', 'bal', 'bol', 'balle', 'ballon', 'baltic'], ['bounce', 'juggle', 'rain', 'stack', 'spin']),
  e('dice', 'Dice', 'object', ['dice', 'chance', 'luck', 'gamble', 'probability', 'risk', 'caesar', 'rubicon', 'game', 'de', 'random'], ['dice', 'dis', 'dy', 'de', 'des'], ['spin', 'flip', 'rain', 'stack', 'juggle']),
  e('anchor', 'Anchor', 'object', ['anchor', 'navy', 'sea', 'port', 'harbour', 'stability', 'hope', 'sailor', 'ancre', 'ankara', 'turkey'], ['anchor', 'anch', 'ank', 'anka', 'ankara', 'ancre', 'anc', 'encre'], ['wobble', 'spin', 'float', 'shake']),
  e('gear', 'Gear', 'object', ['gear', 'machine', 'industry', 'industrial revolution', 'engineering', 'mechanism', 'code', 'enigma', 'factory', 'engrenage', 'progress'], ['gear', 'geer', 'gir', 'engr', 'rouage'], ['spin', 'orbit', 'wobble', 'stack']),
  e('hammer', 'Hammer', 'object', ['hammer', 'work', 'build', 'labour', 'soviet', 'justice', 'auction', 'thor', 'marteau', 'industry', 'nail'], ['ham', 'hamm', 'hammer', 'marteau', 'mart', 'mar'], ['shake', 'bounce', 'spin', 'flip']),
  e('envelope', 'Envelope', 'object', ['envelope', 'letter', 'message', 'mail', 'telegram', 'secret', 'news', 'post', 'lettre', 'declaration'], ['envelop', 'envel', 'env', 'enve', 'letter', 'lettre'], ['fly', 'float', 'spin', 'flip']),
  e('telephone', 'Telephone', 'object', ['telephone', 'phone', 'call', 'communication', 'bell', 'hotline', 'message', 'ring', 'switchboard'], ['tele', 'phone', 'fone', 'tel', 'fon'], ['shake', 'wobble', 'bounce', 'spin']),
  e('radio', 'Radio', 'object', ['radio', 'broadcast', 'news', 'speech', 'music', 'wave', 'marconi', 'resistance', 'churchill', 'de gaulle', 'signal'], ['radio', 'rad', 'radi', 'ray', 'dio'], ['shake', 'wobble', 'dance', 'bounce']),
  e('medal', 'Medal', 'object', ['medal', 'honour', 'award', 'victory', 'bravery', 'olympics', 'gold', 'hero', 'medaille', 'nobel'], ['medal', 'med', 'meddle', 'medaille', 'meda'], ['spin', 'float', 'wobble', 'grow']),
  e('poppy', 'Poppy', 'object', ['poppy', 'remembrance', 'armistice', 'veterans', 'flanders', 'memory', 'november', 'peace', 'coquelicot', 'red flower', 'opium'], ['pop', 'poppy', 'papa', 'poppi', 'coquelicot', 'coque'], ['grow', 'wobble', 'rain', 'spin']),
  e('helmet', 'Helmet', 'object', ['helmet', 'soldier', 'protection', 'army', 'war', 'safety', 'casque', 'brodie', 'trench'], ['helm', 'hel', 'hell', 'casque', 'cask'], ['spin', 'bounce', 'wobble', 'flip']),
  e('cannon', 'Cannon', 'object', ['cannon', 'artillery', 'battle', 'napoleon', 'fort', 'history', 'canon', 'boom', 'salute'], ['cannon', 'canon', 'can', 'canno', 'cano'], ['shake', 'wobble', 'idle', 'bounce']),
  e('scroll', 'Scroll', 'object', ['scroll', 'treaty', 'law', 'document', 'decree', 'declaration', 'constitution', 'history', 'parchment', 'charter', 'magna carta', 'versailles'], ['scroll', 'scro', 'roll', 'parch', 'traite'], ['float', 'spin', 'wobble', 'flip'], true),
  e('flag', 'Flag', 'object', ['flag', 'country', 'nation', 'victory', 'independence', 'patriotism', 'territory', 'drapeau', 'pole', 'conquest'], ['flag', 'flak', 'drap', 'drapeau', 'pole'], ['wobble', 'float', 'spin', 'march'], true),
  e('sign', 'Sign', 'object', ['sign', 'direction', 'name', 'city', 'place', 'road', 'warning', 'panneau', 'label', 'notice'], ['sign', 'sine', 'sin', 'signe', 'pan', 'panneau'], ['wobble', 'bounce', 'float', 'spin'], true),
  e('plaque', 'Plaque', 'object', ['plaque', 'memorial', 'remembrance', 'monument', 'dedication', 'history', 'commemoration', 'honour', 'inscription'], ['plaque', 'plak', 'plac', 'plat', 'lac'], ['float', 'wobble', 'spin', 'idle'], true),
  e('can', 'Can', 'object', ['can', 'tin', 'container', 'food', 'soup', 'preserve', 'canned', 'boite', 'conserve'], ['can', 'kan', 'cann', 'canne', 'boite', 'tin'], ['wobble', 'bounce', 'stack', 'spin', 'rain']),
  e('boot', 'Boot', 'object', ['boot', 'wellington', 'march', 'army', 'walk', 'rain', 'italy', 'kick', 'botte', 'cowboy', 'wellies'], ['boot', 'bout', 'botte', 'bot', 'well', 'welly'], ['march', 'bounce', 'stack', 'dance']),

  // ── Vehicles ───────────────────────────────────────────────────────────────
  e('tank', 'Tank', 'vehicle', ['tank', 'army', 'war', 'armour', 'somme', 'cambrai', 'blitzkrieg', 'panzer', 'char', 'heavy', 'water tank'], ['tank', 'tan', 'thank', 'char', 'tanque'], ['march', 'wobble', 'shake', 'idle']),
  e('biplane', 'Biplane', 'vehicle', ['biplane', 'plane', 'aviation', 'red baron', 'flight', 'wright', 'air', 'pilot', 'avion', 'battle of britain', 'sky'], ['bi', 'bip', 'plane', 'plain', 'avion', 'avi'], ['fly', 'orbit', 'flip', 'float']),
  e('zeppelin', 'Zeppelin', 'vehicle', ['zeppelin', 'airship', 'germany', 'hindenburg', 'blimp', 'dirigible', 'float', 'dirigeable'], ['zep', 'zeppe', 'lin', 'pelin', 'zeplin'], ['float', 'orbit', 'wobble', 'fly']),
  e('ship', 'Ship', 'vehicle', ['ship', 'navy', 'sea', 'voyage', 'titanic', 'exploration', 'fleet', 'harbour', 'landing', 'bateau', 'trade', 'lusitania'], ['ship', 'sheep', 'chip', 'bateau', 'bato', 'navire'], ['wobble', 'float', 'march', 'orbit']),
  e('submarine', 'Submarine', 'vehicle', ['submarine', 'u-boat', 'navy', 'deep', 'ocean', 'secret', 'sous-marin', 'yellow', 'lusitania', 'underwater'], ['sub', 'subma', 'marine', 'sous', 'uboat'], ['float', 'wobble', 'orbit', 'flip']),
  e('train', 'Train', 'vehicle', ['train', 'railway', 'travel', 'industrial revolution', 'steam', 'station', 'compiegne', 'armistice', 'orient express', 'rail', 'progress'], ['train', 'tray', 'tren', 'rain', 'tchou'], ['march', 'wobble', 'orbit', 'shake']),
  e('car', 'Car', 'vehicle', ['car', 'automobile', 'ford', 'road', 'travel', 'speed', 'industry', 'voiture', 'sarajevo', 'traffic'], ['car', 'kar', 'carr', 'char', 'voiture', 'auto'], ['march', 'wobble', 'bounce', 'spin']),
  e('rocket', 'Rocket', 'vehicle', ['rocket', 'space', 'launch', 'moon', 'nasa', 'sputnik', 'speed', 'fusee', 'apollo', 'v2', 'race'], ['rock', 'rocket', 'roc', 'fusee', 'fuse'], ['fly', 'grow', 'shake', 'spin']),
  e('balloon', 'Balloon', 'vehicle', ['balloon', 'hot air', 'montgolfier', 'flight', 'celebration', 'float', 'party', 'ballon', 'lift'], ['ball', 'balloon', 'ballon', 'loon', 'montgol'], ['float', 'orbit', 'grow', 'wobble']),

  // ── Structures ─────────────────────────────────────────────────────────────
  e('castle', 'Castle', 'structure', ['castle', 'palace', 'versailles', 'king', 'fortress', 'medieval', 'kingdom', 'chateau', 'defence', 'monarchy'], ['castle', 'cast', 'cas', 'chateau', 'chat', 'cassel'], ['grow', 'wobble', 'idle', 'shake']),
  e('tower', 'Tower', 'structure', ['tower', 'eiffel', 'paris', 'london', 'babel', 'pisa', 'height', 'power', 'tour', 'prison', 'watch'], ['tower', 'tow', 'tour', 'tau', 'towel'], ['grow', 'wobble', 'shake', 'stack']),
  e('pyramid', 'Pyramid', 'structure', ['pyramid', 'egypt', 'pharaoh', 'ancient', 'giza', 'hierarchy', 'tomb', 'geometry', 'pyramide'], ['pyra', 'pira', 'pyr', 'mid', 'pyramide'], ['grow', 'spin', 'float', 'idle']),
  e('bridge', 'Bridge', 'structure', ['bridge', 'connection', 'river', 'crossing', 'link', 'alliance', 'pont', 'golden gate', 'arnhem', 'peace'], ['bridge', 'brig', 'brij', 'pont', 'bri'], ['wobble', 'grow', 'idle', 'shake']),
  e('brickwall', 'Brick wall', 'structure', ['wall', 'brick', 'barrier', 'berlin wall', 'defence', 'they shall not pass', 'border', 'obstacle', 'mur', 'china', 'blockade'], ['wall', 'wal', 'brick', 'mur', 'brique'], ['shake', 'stack', 'grow', 'wobble']),
  e('house', 'House', 'structure', ['house', 'home', 'family', 'parliament', 'white house', 'government', 'maison', 'dynasty', 'roof'], ['house', 'hau', 'how', 'maison', 'mais', 'haus'], ['wobble', 'grow', 'shake', 'bounce']),
  e('tent', 'Tent', 'structure', ['tent', 'camp', 'camping', 'army', 'circus', 'rest', 'nomad', 'refuge', 'tente', 'expedition'], ['tent', 'ten', 'tant', 'tente', 'temps'], ['wobble', 'shake', 'grow', 'idle']),
];

const BY_ID = new Map(CATALOG_INDEX.map((c) => [c.id, c]));

/** Entry of a model id (undefined when unknown). */
export function catalogEntry(id: string): CatalogEntry | undefined {
  return BY_ID.get(id);
}

/** true if the id is a known model. */
export function isCatalogId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Ids of the label-capable models (sign, plaque, scroll, flag, book). */
export const TEXT_MODEL_IDS: string[] = CATALOG_INDEX.filter((c) => c.text).map((c) => c.id);

/** true if the model can carry a `label`. */
export function isTextModel(id: string): boolean {
  return !!BY_ID.get(id)?.text;
}
