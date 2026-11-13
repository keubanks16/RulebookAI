// The sports The Rulebook AI knows about. The app and the Worker both read this list.
// To add a sport: add its rules file in public/rules/, its prompt file in src/sports/,
// register it in src/sports/index.js, then set live: true here.
export const SPORTS = [
  { id: 'baseball', name: 'Baseball', icon: '⚾', live: true },
  { id: 'softball', name: 'Softball', icon: '🥎', live: false },
  { id: 'football', name: 'Football', icon: '🏈', live: false },
  { id: 'basketball', name: 'Basketball', icon: '🏀', live: false },
  { id: 'soccer', name: 'Soccer', icon: '⚽', live: false },
  { id: 'volleyball', name: 'Volleyball', icon: '🏐', live: false },
];

// What the Ask screen needs for each live sport.
export const ASK = {
  baseball: {
    rules: './rules/baseball.js',
    // Rule books a coach can ask under. "other" = the event isn't listed.
    orgs: ['usssa', 'pg', 'tl', 'tg', 'tc', 'ft', 'sga', 'nfhs', 'other'],
    orgNames: { nfhs: 'NFHS (high school rules)', other: 'Other / not sure' },
    ages: ['6U', '7U', '8U', '9U', '10U', '11U', '12U', '13U', '14U', 'High school'],
    // Ages where the app asks coach pitch or kid pitch. 6U is always coach pitch and 9U and up is always kid pitch.
    pitchAges: ['7U', '8U'],
    // Ages that are always coach pitch.
    coachOnly: ['6U'],
    placeholder: 'Runner on first, one out. Batter hits a pop-up to short, the runner bumps into the shortstop while he’s under the ball…',
  },
};
