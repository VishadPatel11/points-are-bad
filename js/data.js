export const MATCHES = [
  {n:1, code:"M1", date:"Jun 11", time:"3:00 PM", group:"A", home:"Mexico", away:"South Africa", venue:"Mexico City", kickoff:"2026-06-11T15:00:00-04:00"},
  {n:2, code:"M4", date:"Jun 12", time:"9:00 PM", group:"D", home:"USA", away:"Paraguay", venue:"Los Angeles", kickoff:"2026-06-12T21:00:00-04:00"},
  {n:3, code:"M7", date:"Jun 13", time:"6:00 PM", group:"C", home:"Brazil", away:"Morocco", venue:"New York/NJ", kickoff:"2026-06-13T18:00:00-04:00"},
  {n:4, code:"M11", date:"Jun 14", time:"4:00 PM", group:"F", home:"Netherlands", away:"Japan", venue:"Dallas", kickoff:"2026-06-14T16:00:00-04:00"},
  {n:5, code:"M17", date:"Jun 16", time:"3:00 PM", group:"I", home:"France", away:"Senegal", venue:"New York/NJ", kickoff:"2026-06-16T15:00:00-04:00"},
  {n:6, code:"M19", date:"Jun 16", time:"9:00 PM", group:"J", home:"Argentina", away:"Algeria", venue:"Kansas City", kickoff:"2026-06-16T21:00:00-04:00"},
  {n:7, code:"M22", date:"Jun 17", time:"4:00 PM", group:"L", home:"England", away:"Croatia", venue:"Dallas", kickoff:"2026-06-17T16:00:00-04:00"},
  {n:8, code:"M33", date:"Jun 20", time:"4:00 PM", group:"E", home:"Germany", away:"Ivory Coast", venue:"Toronto", kickoff:"2026-06-20T16:00:00-04:00"},
  {n:9, code:"M38", date:"Jun 21", time:"12:00 PM", group:"H", home:"Spain", away:"Saudi Arabia", venue:"Atlanta", kickoff:"2026-06-21T12:00:00-04:00"},
  {n:10, code:"M43", date:"Jun 22", time:"1:00 PM", group:"J", home:"Argentina", away:"Austria", venue:"Dallas", kickoff:"2026-06-22T13:00:00-04:00"},
  {n:11, code:"M49", date:"Jun 24", time:"6:00 PM", group:"C", home:"Scotland", away:"Brazil", venue:"Miami", kickoff:"2026-06-24T18:00:00-04:00"},
  {n:12, code:"M56", date:"Jun 25", time:"4:00 PM", group:"E", home:"Ecuador", away:"Germany", venue:"New York/NJ", kickoff:"2026-06-25T16:00:00-04:00"},
  {n:13, code:"M59", date:"Jun 25", time:"10:00 PM", group:"D", home:"Türkiye", away:"USA", venue:"Los Angeles", kickoff:"2026-06-25T22:00:00-04:00"},
  {n:14, code:"M66", date:"Jun 26", time:"8:00 PM", group:"H", home:"Uruguay", away:"Spain", venue:"Guadalajara", kickoff:"2026-06-26T20:00:00-04:00"},
  {n:15, code:"M71", date:"Jun 27", time:"7:30 PM", group:"K", home:"Colombia", away:"Portugal", venue:"Miami", kickoff:"2026-06-27T19:30:00-04:00"},
];

export const FLAGS = {
  "Mexico":"🇲🇽","South Africa":"🇿🇦","USA":"🇺🇸","Paraguay":"🇵🇾","Brazil":"🇧🇷",
  "Morocco":"🇲🇦","Netherlands":"🇳🇱","Japan":"🇯🇵","France":"🇫🇷","Senegal":"🇸🇳",
  "Argentina":"🇦🇷","Algeria":"🇩🇿","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Croatia":"🇭🇷","Germany":"🇩🇪",
  "Ivory Coast":"🇨🇮","Spain":"🇪🇸","Saudi Arabia":"🇸🇦","Austria":"🇦🇹","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Ecuador":"🇪🇨","Türkiye":"🇹🇷","Uruguay":"🇺🇾","Colombia":"🇨🇴","Portugal":"🇵🇹"
};

export const SEED_STATE = {
  players: [],
  predictions: {},
  results: {},
  apiKey: "",
  predictionsLocked: false,
  officialPlayers: null
};
