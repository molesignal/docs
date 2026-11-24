// A chat-completions client for OpenAI and OpenAI-compatible services, with nothing to install.
//
// OPENAI_API_KEY is required; OPENAI_BASE_URL points it at another compatible service.

const DEFAULT_MODEL = 'gpt-4o';
const ATTEMPTS = 4;
const TIMEOUT_MS = 10 * 60 * 1000;

export function connect(model = process.env.TRANSLATE_MODEL ?? DEFAULT_MODEL) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Set OPENAI_API_KEY first.');
  const base = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');

  async function post(body) {
    let lastError;

    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      let response;
      try {
        response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        // A dropped connection or a timeout: try again.
        lastError = error;
        await sleep(5_000 * attempt);
        continue;
      }

      if (response.ok) {
        const choice = (await response.json()).choices?.[0];
        if (choice?.finish_reason === 'length') throw new Error('the answer was cut off');
        return choice?.message?.content ?? '';
      }

      lastError = new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      // A refused key or a malformed request will not get better by waiting.
      if (response.status !== 429 && response.status < 500) throw lastError;
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 5_000 * attempt);
    }
    throw lastError;
  }

  return {
    model,
    /** Sends one request and returns the text of the answer. */
    complete(system, user, { json = false } = {}) {
      return post({
        model,
        // Reasoning models refuse a temperature other than the default; older chat models take 0,
        // which keeps their wording steady from one request to the next.
        ...(/^gpt-4/.test(model) ? { temperature: 0 } : {}),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
    },
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs the jobs with at most `limit` of them in flight. */
export async function runPool(jobs, limit) {
  let next = 0;

  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      await job();
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}

export function parseJsonObject(raw) {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) text = text.slice(first, last + 1);
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('the model did not return a JSON object');
  }
  return parsed;
}
