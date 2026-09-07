import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function isInRange(value, range) {
  return value >= range.from && value <= range.to;
}

export async function resolveGitHubToken(env = process.env) {
  const configuredToken = env.GITHUB_TOKEN || env.GH_TOKEN || "";
  if (configuredToken) return { token: configuredToken, source: "environment" };

  try {
    const result = await execFileAsync(
      "gh",
      ["auth", "token", "--hostname", "github.com"],
      { encoding: "utf8" },
    );
    const token = result.stdout.trim();
    return token ? { token, source: "gh-cli" } : null;
  } catch {
    return null;
  }
}

export async function fetchGitHubActivity({
  username,
  range,
  token,
  fetchImpl = fetch,
}) {
  if (!username) throw new Error("GitHub username is missing");
  if (!token) throw new Error("No GitHub token found; set GITHUB_TOKEN or run gh auth login");

  const query = [
    "query($login:String!,$from:DateTime!,$to:DateTime!){",
    "user(login:$login){",
    "contributionsCollection(from:$from,to:$to){",
    "contributionCalendar{",
    "weeks{contributionDays{date contributionCount}}",
    "}",
    "}",
    "}",
    "}",
  ].join("");

  const response = await fetchImpl("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: "bearer " + token,
      "content-type": "application/json",
      "user-agent": "activity-heatmap",
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username,
        from: range.from + "T00:00:00Z",
        to: range.to + "T23:59:59Z",
      },
    }),
  });

  const body = await response.json();
  if (!response.ok) throw new Error("GitHub returned HTTP " + response.status);
  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    throw new Error(body.errors.map((error) => error.message).join("; "));
  }

  const weeks = body?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks)) throw new Error("GitHub returned no contribution calendar");

  const days = [];
  weeks.forEach((week) => {
    (week?.contributionDays || []).forEach((day) => {
      if (!day?.date || !isInRange(day.date, range)) return;
      days.push({
        date: day.date,
        contributions: Number(day.contributionCount) || 0,
      });
    });
  });

  return days.sort((left, right) => left.date.localeCompare(right.date));
}
