console.log('GROQ_API_KEY exists?', !!process.env.GROQ_API_KEY);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Optional: debug line – remove later
console.log('GROQ_API_KEY loaded?', process.env.GROQ_API_KEY ? 'YES' : 'NO');

const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

// rest of your code...



const app = express();
const PORT = process.env.PORT || 3001;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('../frontend'));

// ---------- User Profile (rich, persistent) ----------
let userProfile = {
  id: 'demo-user',
  recoveryScore: 74,
  norwoodStage: 3,
  // Vision metrics (last scan)
  lastMetrics: {
    follicle_density: 142,
    diameter_variance: 0.38,
    miniaturization_score: 0.31,
    inflammation_risk: 0.22
  },
  history: [
    { date: '2025-03-01', metrics: { follicle_density: 128, miniaturization_score: 0.35 } },
    { date: '2025-02-01', metrics: { follicle_density: 108, miniaturization_score: 0.41 } }
  ],
  protocolAdherence: 89,
  alerts: [
    { type: 'warning', title: 'Recovery score declined 7 pts since last scan.', actionTab: 'plan' }
  ],
  // ... other fields (same as before)
};

// ---------- Groq Reasoning Engine ----------
async function reasonWithGroq(metrics, userContext) {
  const prompt = `You are a clinical hair intelligence AI. Given the following vision-derived metrics and user history, assess risk, recommend action, and predict trajectory.

Metrics:
- Follicle density: ${metrics.follicle_density} follicles/cm²
- Diameter variance: ${metrics.diameter_variance} (0=uniform, 1=high variance)
- Miniaturization score: ${metrics.miniaturization_score} (0=healthy, 1=severe)
- Inflammation risk: ${metrics.inflammation_risk} (0=none, 1=high)

User context: Norwood stage ${userContext.norwoodStage}, adherence ${userContext.protocolAdherence}%, previous density trend.

Return JSON only:
{
  "newRecoveryScore": number (0-100),
  "riskLevel": "low|moderate|high|critical",
  "insightText": "string",
  "recommendedAction": "string",
  "escalate": boolean,
  "nextScanDays": number,
  "adjustedProtocol": ["intervention1", "intervention2"]
}`;

  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'llama-3.1-8b-instant',
    temperature: 0.4,
    response_format: { type: 'json_object' }
  });
  return JSON.parse(completion.choices[0]?.message?.content || '{}');
}

// ---------- API: Receive vision metrics, run Groq reasoning, update profile ----------
app.post('/api/vision/analyze', async (req, res) => {
  const { metrics, imagePreview } = req.body; // metrics from client-side vision AI
  if (!metrics) return res.status(400).json({ error: 'Missing metrics' });

  // Store metrics in history
  userProfile.history.unshift({
    date: new Date().toISOString().slice(0,10),
    metrics: { ...metrics }
  });
  if (userProfile.history.length > 6) userProfile.history.pop();

  // Run Groq reasoning
  const reasoning = await reasonWithGroq(metrics, {
    norwoodStage: userProfile.norwoodStage,
    protocolAdherence: userProfile.protocolAdherence
  });

  // Update profile with reasoning output
  if (reasoning.newRecoveryScore) userProfile.recoveryScore = reasoning.newRecoveryScore;
  userProfile.lastMetrics = metrics;
  if (reasoning.escalate) {
    userProfile.alerts.unshift({
      type: 'danger',
      title: reasoning.recommendedAction || 'Escalation needed. Consult dermatologist.',
      actionTab: 'plan'
    });
  }
  if (reasoning.nextScanDays) {
    userProfile.nextScanDue = reasoning.nextScanDays;
  }

  res.json({
    success: true,
    profile: userProfile,
    reasoning
  });
});

// ---------- Chat endpoint (same as before, but includes updated metrics) ----------
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  const systemPrompt = `You are HAIRTOOL AI. Latest scan metrics: density ${userProfile.lastMetrics.follicle_density}, miniaturization ${userProfile.lastMetrics.miniaturization_score}. Provide concise, evidence-based advice.`;
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
    model: 'llama-3.1-8b-instant',
    temperature: 0.7
  });
  res.json({ reply: completion.choices[0]?.message?.content });
});

app.get('/api/user/profile', (req, res) => res.json(userProfile));
app.post('/api/user/reset', (req, res) => { /* reset logic */ res.json({ success: true }); });

app.listen(PORT, () => console.log(`HAIRTOOL backend running on port ${PORT}`));