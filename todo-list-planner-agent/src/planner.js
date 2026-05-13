'use strict';

const { truncate } = require('./message-utils');

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('LLM returned empty response.');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('LLM response does not contain a JSON object.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeDraft(value) {
  const source = value && typeof value === 'object' ? value : {};
  const task = source.task && typeof source.task === 'object' ? source.task : source;
  const title = String(task.title || '').trim();
  if (!title) throw new Error('LLM draft is missing task.title.');

  return {
    title,
    description: String(task.description || task.desc || ''),
    date: String(task.date || 'today'),
    remind: String(task.remind || task.reminder || ''),
    difficulty: String(task.difficulty || task.workload || 'general'),
    category: task.category ? String(task.category) : '',
    categoryId: task.categoryId,
    tags: Array.isArray(task.tags) ? task.tags : (task.tags ? [String(task.tags)] : []),
    subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(String) : [],
    repeat: task.repeat || '',
    repeatInterval: task.repeatInterval,
    repeatCount: task.repeatCount,
    repeatWeekdays: task.repeatWeekdays,
    repeatMonthDays: task.repeatMonthDays,
    repeatYearDate: task.repeatYearDate,
    repeatSkipWeekends: Boolean(task.repeatSkipWeekends),
    repeatSkipStatutoryHolidays: Boolean(task.repeatSkipStatutoryHolidays),
    repeatStatutoryWorkdays: Boolean(task.repeatStatutoryWorkdays),
    image: '',
    notes: String(source.notes || task.notes || '')
  };
}

function systemPrompt(context) {
  return [
    'You are Todo List Planner Feishu Agent.',
    'Convert the user message into exactly one Todo task draft for Todo清单.',
    'Return strict JSON only. No Markdown. No explanations.',
    'Schema:',
    '{ "task": { "title": string, "description": string, "date": "today|tomorrow|YYYY-MM-DD|none", "remind": "HH:mm or empty", "difficulty": "general|medium|high", "category": string, "tags": string[], "subtasks": string[], "repeat": "daily|weekly|monthly|yearly or empty", "repeatInterval": number, "repeatCount": number }, "notes": string }',
    'Use empty strings or empty arrays when information is missing.',
    'Do not invent exact dates unless the message implies them.',
    'Keep title concise. Keep subtasks under 20 items.',
    `Current date: ${context.currentDate}. Timezone: ${context.timezone}.`
  ].join('\n');
}

async function callOpenAiCompatible(config, messages) {
  const url = `${config.llm.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  const body = {
    model: config.llm.model,
    messages,
    temperature: 0.2,
    response_format: { type: 'json_object' }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.llm.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok && response.status >= 400 && response.status < 500 && /response_format/i.test(text)) {
    delete body.response_format;
    const retry = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const retryText = await retry.text();
    if (!retry.ok) {
      throw new Error(`LLM API failed: HTTP ${retry.status} ${truncate(retryText, 500)}`);
    }
    const retryData = JSON.parse(retryText);
    const retryContent = retryData.choices && retryData.choices[0] && retryData.choices[0].message && retryData.choices[0].message.content;
    if (!retryContent) throw new Error('LLM API returned no message content.');
    return retryContent;
  }

  if (!response.ok) {
    throw new Error(`LLM API failed: HTTP ${response.status} ${truncate(text, 500)}`);
  }

  const data = JSON.parse(text);
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('LLM API returned no message content.');
  return content;
}

async function planTask(config, input) {
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-CA', { timeZone: config.timezone });
  const messages = [
    { role: 'system', content: systemPrompt({ currentDate, timezone: config.timezone }) },
    {
      role: 'user',
      content: [
        `Message text:\n${input.text}`,
        input.imageCount ? `Image attachments: ${input.imageCount}` : '',
        input.modifyInstruction ? `Modify previous draft with instruction:\n${input.modifyInstruction}` : '',
        input.previousDraft ? `Previous draft:\n${JSON.stringify(input.previousDraft)}` : ''
      ].filter(Boolean).join('\n\n')
    }
  ];

  const content = await callOpenAiCompatible(config, messages);
  return normalizeDraft(extractJson(content));
}

module.exports = {
  extractJson,
  normalizeDraft,
  planTask,
  callOpenAiCompatible
};
