const Parser = require('rss-parser');
const parser = new Parser({ timeout: 10000 });
const fetch = require('node-fetch');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function summarizeWithOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `You are a professional news editor for an AdSense-compliant site. Summarize news in 80-120 words, neutral tone, include Why it matters, and end with "Source: [source] — Read full article here: [link]".` },
      ],
      temperature: 0.3,
      max_tokens: 350
    })
  });
  if (!res.ok) throw new Error('OpenAI API error');
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

exports.handler = async function(event) {
  try {
    const data = JSON.parse(event.body || '{}');
    const feeds = data.feeds || [];
    if (!feeds.length) return { statusCode: 400, body: JSON.stringify({ error: 'No feeds' }) };

    const feedData = await Promise.all(feeds.map(async url => {
      try {
        const feed = await parser.parseURL(url);
        const source = feed.title || new URL(url).hostname;
        return (feed.items || []).slice(0,6).map(item => ({
          title: item.title || 'Untitled',
          link: item.link || '',
          pubDate: item.pubDate || '',
          snippet: item.contentSnippet || '',
          source
        }));
      } catch(e){ return []; }
    }));

    const allItems = feedData.flat().slice(0,20);
    const results = [];

    for (const item of allItems) {
      const prompt = `
Article title: ${item.title}
Source: ${item.source}
URL: ${item.link}
Snippet: ${item.snippet}

Task: Summarize this news article in your own words, neutral tone.
Include Why it matters. End with "Source: ${item.source} — Read full article here: ${item.link}".
`;
      let summary = '';
      try { summary = await summarizeWithOpenAI(prompt); } catch(e){ summary = '(Error summarizing)'; }
      results.push({ title: item.title, pubDate: item.pubDate, summary, source: item.source, link: item.link });
      await new Promise(r => setTimeout(r, 200));
    }

    return { statusCode: 200, body: JSON.stringify({ items: results }) };
  } catch(err){
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
