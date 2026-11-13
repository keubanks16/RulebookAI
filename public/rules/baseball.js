// The Rulebook AI baseball rules library (carried over from The Sports Hub): plain-language summaries of tournament organizations' baseball
// rules and of the NFHS (high school) rules most tournaments fall back on. These are summaries
// written for coaches, not the official text. Each organization links to its own rules, and
// tournament directors can change rules for an event, so the clipboard rules at the field win.

export const UPDATED = 'November 2026';

export const NFHS_LINK = { t: 'NFHS Baseball Rules Book (buy or read the official book)', url: 'https://www.nfhs.org/ebooks' };

export const ORGS = [
  {
    id: 'tl', name: 'Training Legends', base: 'NFHS', fallback: 'nfhs',
    note: 'Georgia-based. Plays NFHS rules with Training Legends changes. Anything their rules sheet doesn’t cover goes by the NFHS book. Each event posts a clipboard rules sheet; it wins over anything here.',
    src: [{ t: 'Travel tournament rules', url: 'https://traininglegends.com/?p=4267' }, { t: 'Rules page (bats, coach pitch, safety)', url: 'https://traininglegends.com/rules-page/' }, { t: 'Pitching policy', url: 'https://traininglegends.com/pitching-policy/' }, { t: 'All Star tournament rules', url: 'https://traininglegends.com/rules-all-star-tournaments/' }],
    sections: [
      { h: 'Game length and time', rules: [
        'Coach pitch games are scheduled for 6 innings, subject to the event’s time limit.',
        'Time limits on past clipboard sheets: 1:15 for coach pitch (5U–8U), 1:30 for 8U kid pitch through 10U, and 1:45 for older groups. Check the clipboard sheet at your event, since these change.',
        'Championship games: past sheets used a time limit on Sunday in fall one-day events and no time limit for two-day events.',
        'Extra innings use the international tiebreaker: no outs, last batted out starts on second base.',
        'Seeding ties: record, head-to-head, run differential, runs allowed, runs scored, then a coin flip. Run differential counts at most 7 runs per game.',
      ] },
      { h: 'Coach pitch', rules: [
        'Four outfielders.',
        'Each batter gets up to 5 pitches. Three strikes before the fifth pitch is an out. No foul-ball outs: a foul on the fifth pitch keeps the batter hitting until a swing and miss or a ball in play.',
        'A team can score at most 7 runs in an inning.',
        'Only the umpire calls time, usually once runners stop advancing. Players and coaches can’t call time.',
        'Every team plays a catcher in full gear (helmet with mask, chest protector, shin guards). The catcher can squat behind the plate or stand at the backstop.',
        'Face guards aren’t required on batting helmets or for the player pitcher.',
        'A 20-foot arc in front of home plate: a ball must reach the arc to be fair.',
        'The pitching coach keeps one foot on or straddling the pitcher’s line. Breaking that is a “no pitch.”',
        'Safety lines 30 feet down the first and third base lines: no fielder may be in front of them at the pitch.',
        'Past clipboard sheets: one successful bunt per inning (a second bunt is an out).',
        'Players wearing a cast of any kind may not play.',
      ] },
      { h: '8U kid pitch', rules: [
        'No leadoffs, and no stealing home. A runner on third scores only on a batted ball or when forced (walk, hit batter).',
        'Walks are dead balls: the batter goes to first and forced runners move up one base.',
        'Runners on first or second may score on a batted ball as part of the play.',
        'A runner stealing third can’t keep going home on the catcher’s overthrow.',
        'If a runner crosses home on a non-batted ball, the runner goes back to third and runners behind go back too.',
        'Leaving early: first time is a dead ball and a warning; after that the runner is out and other runners go back, with no pitch counted.',
        'The batter can’t run on a dropped third strike.',
        'Past clipboard sheets: a per-inning run limit until the last inning, when the umpire announces unlimited runs. One successful bunt per inning.',
      ] },
      { h: 'Pitching limits (per tournament)', rules: [
        'Limits are innings per tournament, however many days it runs. Throwing a single pitch in an inning counts as a full inning.',
        '8U–12U: 6 innings for tournaments of up to 4 games; 13U and older: 7 innings.',
        'Each game after the 4th adds an inning: 8U–12U go to 7, 8, 9 innings in games 5, 6, 7; 13U+ go to 8, 9, 10.',
        'No limit on how many times a pitcher appears.',
        'Warm-ups: at least 8 pitches when a pitcher first comes in, 5 before each later inning. The pitcher may choose to throw fewer.',
        'Both managers sign the scorecard after each game to confirm innings pitched.',
        'Penalties for going over can include removing the pitcher, ejections, forfeits and removal from the tournament.',
        'Players in different Training Legends tournaments the same weekend still count toward pitching limits.',
      ] },
      { h: 'Lineup, roster and age', rules: [
        'DH or EH is at the coach’s discretion (past clipboard sheets).',
        'Teams must start with 9 players and can finish with 8 (past clipboard sheets).',
        'A player can’t play for two teams in the same tournament. Different age divisions, and All Star vs. travel, count as separate tournaments.',
        'Bring birth certificates. Teams may use two grade exemptions, proven with a birth certificate and last year’s report card.',
        'Age protests go to the tournament director; during a game, file before the umpires leave the field. A player whose age can’t be proven is ineligible and games can be forfeited.',
        'Defensive visits: 3 per game; a pitcher is removed on the second visit in an inning (past clipboard sheets).',
        'Slung bat: one warning per player, then the player is out (past clipboard sheets).',
      ] },
      { h: 'Bats and equipment', rules: [
        '5U–12U: USSSA BPF 1.15, USA Baseball stamped, or legal wood bats.',
        '13U: approved bats no lighter than -5 (BBCOR or wood if playing up in 14U+). 14U–15U: BBCOR (-3) or wood only.',
        'All Black Emerald bats are illegal except the BBCOR (-3) version.',
        'Catchers’ helmets must be NOCSAE approved.',
      ] },
    ],
  },
  {
    id: 'usssa', name: 'USSSA', base: 'USSSA rule book (built on MLB’s Official Baseball Rules, not NFHS)', fallback: 'obr',
    note: 'USSSA events play the USSSA National By-laws & Rules, and each state and event adds its own tournament rules. Anything USSSA doesn’t cover goes by MLB’s Official Baseball Rules, not the high school (NFHS) book, so a few calls differ from NFHS tournaments. The numbers below are the common ones; your event’s sheet decides.',
    src: [{ t: 'USSSA baseball rules', url: 'https://usssa.com/baseball/baseball-rules' }, { t: 'Example event rules (pitching table)', url: 'https://dc.usssa.com/api/uploads/event/410607/e467858a-6b2f-4c03-809c-452e7fe3c4b9.pdf' }, { t: 'Example 8U coach pitch addendum', url: 'https://dc.usssa.com/api/uploads/event/381679/a2bc9814-38a2-4ddf-9fad-d75f0918b4ae.pdf' }],
    sections: [
      { h: 'Game length and time', rules: [
        'Most events: 1 hour 40 minutes for every age group, and no new inning after time runs out. Some use 1:45 for 9U and up.',
        'Championship games often get 2 hours.',
        'Ties allowed in pool play. Bracket games that are tied go to a tiebreaker (a runner placed on base to start each extra inning; the exact setup is on the event sheet).',
      ] },
      { h: 'Run rules', rules: [
        '6-inning games: 15 after 3, 8 after 4.',
        '7-inning games: 15 after 3, 12 after 4, 8 after 5.',
        'Some events use 12 after 3, 10 after 4, 8 after 5.',
      ] },
      { h: 'Pitching (innings)', rules: [
        'One out counts as a third of an inning.',
        '7U–12U: a pitcher who throws more than 3 innings in a day can’t pitch the next day; 6 innings max in a day; 8 innings max over back-to-back days.',
        '13U–14U: same, but 7 innings max in a day.',
        'A pitcher removed from the mound can’t come back to pitch in the same game.',
      ] },
      { h: '8U coach pitch', rules: [
        'Up to 10 defensive players, with four outfielders at least 10 feet behind the base paths.',
        'Bat the whole lineup (roster batting) with free defensive substitution.',
        'No bunting, slapping or stealing.',
        'The catcher squats behind the plate in full gear.',
        'Maximum of 5 runs per inning at many events (some use 6).',
      ] },
      { h: 'Courtesy runners', rules: [
        'Allowed for the pitcher and catcher. The same courtesy runner can’t run for both in the same inning.',
      ] },
    ],
  },
  {
    id: 'pg', name: 'Perfect Game', base: 'NFHS', fallback: 'nfhs',
    note: 'Perfect Game plays NFHS rules with these changes. Each event page lists its own time limits.',
    src: [{ t: 'PG youth rules', url: 'https://www.perfectgame.org/Tournaments/ViewDocument.aspx?id=4000' }, { t: 'PG pitching restrictions (example event)', url: 'https://perfectgame.org/events/Tournaments/PitchingRestrictions.aspx?event=8863' }],
    sections: [
      { h: 'Game length and time', rules: [
        'Pool play: 1 hour 45 minutes for 9U–12U, 2 hours for 13U–14U. No inning starts after the time limit.',
        'Many events list 8U–10U at 1:30 or 2:00, so check the event page.',
        '9U–12U games are 6 innings; 13U–14U are 7.',
        'Pool games tied at 6 innings or the time limit (7 innings for 13U–14U) go in as a tie, counted as half a win and half a loss.',
        'Semifinals and championships have no tiebreaker.',
      ] },
      { h: 'Run rules and run limits', rules: [
        'Mercy rule: 15 after 3, 12 after 4, 8 after 5.',
        '8U kid pitch: 5 runs max per inning; no leadoffs; steal only after the ball crosses the plate; no balks or dropped third strikes (common PG event rules).',
        'Some 10U divisions use a 5-run cap until the last inning and allow leadoffs and steals.',
      ] },
      { h: 'Pitching (Pitch Smart)', rules: [
        'All events follow Pitch Smart. Daily max: 50 pitches (7–8), 75 (9–10), 85 (11–12), 95 (13–14).',
        'Rest days (ages 7–14): 1–20 pitches none, 21–35 one day, 36–50 two, 51–65 three, 66+ four.',
        'A pitcher who reaches the daily max must come out of the game.',
        'Pitching before the required rest makes the player ineligible.',
      ] },
    ],
  },
  {
    id: 'tg', name: 'Top Gun', base: 'NFHS', fallback: 'nfhs',
    note: 'Top Gun plays NFHS rules with these changes (2026 scorecard rules).',
    src: [{ t: '2026 Top Gun baseball rules', url: 'https://playtopgunsports.com/CustomPageInfo/2026%20Scorecard-BB1.pdf' }],
    sections: [
      { h: 'Game length and time', rules: [
        'One-day events: 1:15 for 8U, 1:30 for 9U–HS.',
        'Two-day events: pool games 1:15 (8U) or 1:30 (9U–HS); bracket games 1:45; championships 1:30 (8U) or 2:00 (9U–HS). Consolation games 1:30.',
        'If time runs out after a third out, a new inning still starts.',
        'Ties allowed in pool play. Bracket ties: international tiebreaker with the last three hitters on first, second and third and one out.',
        'Pool home team by coin toss; in brackets the higher seed chooses.',
      ] },
      { h: 'Run rules', rules: [
        '8U: 15 after 5 innings.',
        '9U–HS: 12 after 3, 8 after 4.',
      ] },
      { h: 'Pitching (innings)', rules: [
        'Per game: 9U–10U 7 innings, 11U–12U 8, 13U–15U 9, high school unlimited.',
        'Per day: 6 innings for 9U–12U, 7 for 13U–15U.',
        'More than 3 innings in a day means resting the next day. A pitcher’s innings reset after a day of not pitching.',
        'A courtesy runner for the pitcher is optional.',
      ] },
      { h: 'Balks', rules: [
        'Balks are live-ball at all ages, with no warnings. No balks are called in 9U fall-modified play.',
        'A balk on a pickoff attempt is a dead ball and runners go back with no penalty.',
      ] },
      { h: 'Lineup', rules: [
        'Need 8 to start; the 9th spot is an out until the player arrives.',
        'Teams can bat their whole roster (then there are no subs). An injured player’s spot is an out each time up.',
        'A DH is allowed for any position player; with a DH only 9 players bat.',
      ] },
      { h: 'Bats', rules: [
        '8U–12U: any size with a BPF 1.15 or USA Baseball stamp. 13U: -8 or heavier with those stamps. 14U and up: BBCOR. Wood is always legal.',
      ] },
    ],
  },
  {
    id: 'tc', name: 'Triple Crown', base: 'Event rules', fallback: 'unknown',
    note: 'Triple Crown posts rules on each event’s page, and which rule book they fall back on varies by event. These are from their USA Tournament Series events; check the event page for the rest.',
    src: [{ t: 'Example event rules', url: 'https://store.triplecrownsports.com/Store/Index/9790' }],
    sections: [
      { h: 'Game length and time', rules: [
        '13U–17U: 2-hour time limit except the championship. Not a drop-dead limit: no new inning after time is reached. The site director keeps official time.',
      ] },
      { h: 'Run rules', rules: [
        '15 after 3, 10 after 4, 8 after 5. The home team always gets its last at-bat unless it’s winning.',
      ] },
    ],
  },
  {
    id: 'ft', name: 'Five Tool', base: 'NFHS', fallback: 'nfhs',
    note: 'Five Tool events play high school federation rules with these event rules.',
    src: [{ t: 'Example event rules', url: 'https://events.fivetool.org/events/five-tool-northeast-summer-championship-at-cene-park-struthers-oh-06-26-2026/schedule/all' }],
    sections: [
      { h: 'Game length and time', rules: [
        'No new inning after 1:45 or 7 innings (some events use 2 hours). Pool games can end in a tie.',
        'Championship games have no time limit. Once time runs out in other bracket games, the last batted out goes to second base and the inning is played out until there’s a winner.',
      ] },
      { h: 'Run rules', rules: ['15 after 3, 10 after 4, 8 after 5.'] },
      { h: 'Lineups and pitching', rules: [
        'DH and/or EH allowed.',
        'Many events have no innings or pitch-count limits and ask teams to follow Pitch Smart. The director can step in for player safety.',
        'Seeding ties (two teams): head-to-head, runs allowed, run differential, runs scored.',
      ] },
    ],
  },
  {
    id: 'smart', name: 'Pitch Smart', base: 'MLB and USA Baseball guidelines', fallback: 'none',
    note: 'Pitch Smart is a pitch-count guideline many tournaments and leagues adopt.',
    src: [{ t: 'Pitch Smart guidelines', url: 'https://www.mlb.com/pitch-smart/pitching-guidelines' }],
    sections: [
      { h: 'Daily maximum pitches', rules: ['Ages 7–8: 50. Ages 9–10: 75. Ages 11–12: 85. Ages 13–14: 95. Ages 15–16: 95. Ages 17–18: 105.'] },
      { h: 'Rest days', rules: [
        'Ages 7–14: 1–20 pitches, no rest; 21–35, one day; 36–50, two days; 51–65, three days; 66 or more, four days. (Ages 7–8 top out at 50.)',
        'Ages 15–18: 1–30 none; 31–45 one; 46–60 two; 61–75 three; 76+ four.',
        'Rest is counted in calendar days.',
        'Don’t pitch on three days in a row, whatever the counts.',
        'Ages 8 and under: no more than 60 combined innings in any 12 months.',
      ] },
    ],
  },
];

// Where MLB's Official Baseball Rules (OBR), which USSSA builds on, differ from NFHS. Plain-language
// summaries, not the official text.
export const OBR_LINK = { t: 'MLB Official Baseball Rules', url: 'https://www.mlb.com/official-information/rules' };
export const OBR = [
  { h: 'How OBR (and USSSA) differ from NFHS', rules: [
    'Balk: a delayed dead ball. The pitch or throw is live; if the batter and all runners advance at least one base anyway, the balk is ignored. (NFHS: immediate dead ball.)',
    'Slides on force plays: a runner can’t go out of the baseline or interfere to break up a double play, but there is no NFHS-style rule requiring a slide straight to the base. Interference is still the umpire’s judgment.',
    'Re-entry: in OBR a player taken out of the game can’t come back. USSSA lets a starter re-enter once in the same batting spot, and many events allow a courtesy runner; check the USSSA rule book and the event sheet.',
    'Obstruction has two kinds: Type A (a play is being made on the obstructed runner) is an immediate dead ball with at least one base awarded; Type B (no play on him) is a delayed dead ball and the umpire places runners where they would have reached.',
    'Charged visits: a second trip to the same pitcher in the same inning means the pitcher must be removed. (NFHS counts three conferences per game.)',
    'A pitcher who starts the game or comes in must face at least one batter until he’s out or reaches base, unless injured. Youth events often change this.',
    'Hit by pitch: the batter is awarded first unless the pitch was in the strike zone or he made no attempt to avoid it; the umpire judges the attempt loosely compared with NFHS.',
    'Running lane, infield fly, catch, fair/foul, interference and appeal plays work much the same way as in NFHS.',
    'A courtesy runner isn’t in OBR at all; it exists only where USSSA or the event adds it.',
    'Batting out of order, the dropped third strike and the infield fly rule are the same as NFHS in substance.',
  ] },
];

// Plain-language summaries of NFHS baseball rules youth tournaments fall back on. Not the official
// text; where the exact wording matters, the NFHS book (and the state association) decides.
export const NFHS = [
  { h: 'Players, lineup and substitutes', rules: [
    'A starter may leave the game and re-enter once, but must return to the same spot in the batting order.',
    'A substitute who leaves the game can’t come back in.',
    'Batting out of order is an appeal play: the defense must appeal after the at-bat ends and before the next pitch. If upheld, the proper batter is out and whatever the improper batter did is canceled.',
    'Designated hitter: a team may use a DH for one starter. A starter may also be both a DH and a fielder; details of when the DH role ends are in Rule 3.',
    'Extra hitter (EH): where adopted, a 10th batter who doesn’t have to play the field; any of the 10 can play defense.',
    'Courtesy runners (where the state or tournament adopts them): allowed for the pitcher and catcher at any time; the runner must be someone who hasn’t played in the game yet, and the same player can’t be the courtesy runner for both the pitcher and the catcher in the same game.',
    'A team that can’t keep 9 players (or the agreed number) may forfeit, unless tournament rules let it continue with fewer.',
  ] },
  { h: 'Batting', rules: [
    'Strike three not caught: the batter may run to first if first base is empty, or if there are two outs. With first base occupied and fewer than two outs, the batter is out. (Most 8U and younger tournaments turn this off.)',
    'A bunt that goes foul with two strikes is strike three.',
    'A batter hit by a pitch must try to avoid it. If the batter doesn’t, or swings, it’s not an award of first base.',
    'A batter who hits the ball with a foot completely outside the batter’s box (touching the ground) is out.',
    'A batter who steps across the plate or otherwise interferes with the catcher’s play or throw is out.',
    'Batting helmets with a NOCSAE stamp must be worn by batters, runners and on-deck batters.',
  ] },
  { h: 'Pitching and balks', rules: [
    'Two legal pitching positions: the windup and the set. From the set, the pitcher must come to a complete, noticeable stop before pitching.',
    'A balk with runners on is an immediate dead ball, and each runner moves up one base.',
    'An illegal pitch with no runners on is a ball added to the count.',
    'Common balks: starting a motion and stopping, faking a throw to first from the rubber (faking to third is legal only if the pitcher steps off or steps toward third), not stepping toward a base when throwing there, pitching without a stop from the set, and dropping the ball while on the rubber.',
    'Youth tournaments often turn balks off or give a warning first at the younger ages. Check the tournament’s rules before arguing one.',
    'Defensive charged conferences: three per seven-inning game without removing the pitcher; a fourth means the pitcher must be removed. Offense: one charged conference per inning.',
    'Pitch-count limits come from the state association (or tournament), not the NFHS book itself.',
  ] },
  { h: 'Base running', rules: [
    'Runners must touch every base in order, going forward and coming back. A missed base is an appeal play.',
    'Force-play slide rule: on a force play, a runner must slide legally on the ground straight to the base, or run away from the fielder. An illegal slide that interferes is interference: the runner is out, and the batter-runner is also out on a double-play attempt.',
    'Malicious contact by a runner: the runner is out (unless already scored) and ejected.',
    'A runner hit by a fair batted ball before it passes an infielder (other than the pitcher) is out, and the ball is dead.',
    'Running lane: in the last half of the way to first, the batter-runner must be in the running lane when a throw comes. Being outside it and interfering with the throw is interference.',
    'A runner who leaves the base path by more than 3 feet to avoid a tag is out.',
    'A coach who physically helps a runner causes that runner to be out.',
    'Two runners on one base: the base belongs to the runner who got there first, unless the trailing runner was forced.',
  ] },
  { h: 'Fair, foul and catches', rules: [
    'Infield fly: with fewer than two outs and runners on first and second (or bases loaded), a fair fly ball (not a line drive or bunt) that an infielder can catch with ordinary effort. The batter is out whether or not it’s caught; runners can advance at their own risk.',
    'A catch needs secure possession of the ball; a voluntary release shows the catch was complete.',
    'A fair ball that bounces over or through the fence is a ground-rule double (two bases).',
    'A fair fly ball over the fence in fair territory is a home run.',
    'A foul tip caught by the catcher is a strike, and the ball is live.',
  ] },
  { h: 'Obstruction and interference', rules: [
    'Obstruction: a fielder without the ball (and not fielding it) gets in a runner’s way. It’s a delayed dead ball; the runner gets at least one base beyond the last base touched when obstructed.',
    'Catcher obstruction on the batter: the batter is awarded first base, but the offense may take the result of the play instead.',
    'Offensive interference: the ball is dead and the runner (or batter) is out; other runners return.',
    'Spectator interference: the ball is dead and the umpire puts runners where they’d have reached.',
  ] },
  { h: 'Dead balls and base awards', rules: [
    'A pitch that goes out of play: runners advance one base.',
    'A thrown ball that goes out of play: two bases (from the time of the pitch on an infielder’s first play, otherwise from the time of the throw).',
    'Fielder who catches a fly ball and then falls into dead-ball territory: the catch counts; the ball is dead and runners advance one base.',
    'A fair ball that sticks in or goes under the fence: two bases.',
  ] },
  { h: 'Game length and ending', rules: [
    'A regulation game is 7 innings.',
    'A game called early counts as complete after 5 innings, or 4½ if the home team is ahead.',
    'A game tied after 7 innings goes to extra innings unless tournament rules say otherwise.',
    'Mercy (run-ahead) rules, time limits and tiebreakers come from the state association or tournament.',
    'Suspended game: a game stopped before it’s regulation is resumed from that point, unless the tournament says otherwise.',
  ] },
  { h: 'Equipment, conduct and umpires', rules: [
    'Jewelry is allowed (the ban was removed in 2023), but the umpire can have anything removed that could hurt a player or is a distraction.',
    'Catchers wear a helmet with a mask and throat protector, chest protector and shin guards, and a protective cup for boys.',
    'Bats: high school requires BBCOR. Youth age groups follow the tournament’s bat stamps.',
    'Only the on-deck batter may be outside the dugout during play.',
    'Unsportsmanlike conduct can lead to a warning or ejection. An ejected player or coach must leave and can’t take part the rest of the game.',
    'Judgment calls can’t be protested. Rule-interpretation protests are only allowed where the state association or tournament permits them (often with a fee).',
  ] },
];
