import { SEED_STATE } from "./data.js";
import { state, setState, setDbUrl } from "./state.js";
import { sanitizeState } from "./state.js";
import { dbFromHash, pullRemote, setDot } from "./sync.js";
import { autoFetchResults } from "./fetch.js";
import { render } from "./render.js";
import { registerEvents } from "./events.js";

// Boot
setState(sanitizeState(state));
const initialDbUrl = dbFromHash();
if (initialDbUrl) setDbUrl(initialDbUrl);

registerEvents();
render();

if (initialDbUrl) {
  pullRemote(true);
} else {
  setDot("Local only", false);
}

setInterval(() => pullRemote(false), 20000);
setInterval(() => {
  if (!(document.activeElement && document.activeElement.tagName === "INPUT")) render();
}, 60000);
setTimeout(autoFetchResults, 4000);
setInterval(autoFetchResults, 3 * 60 * 1000);
